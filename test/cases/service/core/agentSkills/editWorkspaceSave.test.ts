import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { publishEditWorkspace } from '@fastgpt/service/core/agentSkills/editWorkspace/service';
import { createSkillPackage } from '@fastgpt/service/core/agentSkills/zipBuilder';
import type { SandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';
import { SkillPackageValidationError } from '@fastgpt/service/core/agentSkills/packageValidator';
import { isEditWorkspaceOperationComplete } from '@fastgpt/service/core/agentSkills/editWorkspace/utils';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import * as skillPublisher from '@fastgpt/service/core/agentSkills/version/publish';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');
const mocks = vi.hoisted(() => ({
  package: vi.fn(),
  stage: vi.fn(),
  beforeAssertOwned: vi.fn(),
  held: new Set<string>()
}));
vi.mock('@fastgpt/service/core/agentSkills/sandboxController', () => ({
  packageSkillInSandbox: mocks.package
}));
vi.mock('@fastgpt/service/core/agentSkills/storage', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/agentSkills/storage')>()),
  stageSkillPackage: mocks.stage,
  finalizeStagedSkillPackage: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/sandbox/lease', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/ai/sandbox/lease')>()),
  withSandboxLease: async (key: string, run: (lease: SandboxLease) => Promise<unknown>) => {
    if (mocks.held.has(key)) throw new Error('operation_conflict');
    mocks.held.add(key);
    try {
      return await run({
        token: 'publish-lease',
        assertOwned: async () => {
          await mocks.beforeAssertOwned();
          if (!mocks.held.has(key)) throw new Error('lease lost');
        },
        setHeartbeat: () => {}
      });
    } finally {
      mocks.held.delete(key);
    }
  }
}));

describe('Edit save owns one lease through export and publication', () => {
  const teamId = new Types.ObjectId().toHexString();
  const tmbId = new Types.ObjectId().toHexString();
  let skillId: string;
  let currentVersionId: string;
  let instanceId: string;
  let packageBuffer: Buffer;
  const save = () =>
    publishEditWorkspace({
      skillId,
      teamId,
      tmbId,
      expectedBaseVersionId: null,
      expectedCurrentVersionId: currentVersionId
    });
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.beforeAssertOwned.mockReset();
    mocks.held.clear();
    const skill = await MongoAgentSkills.create({
      source: 'personal',
      name: 'Draft',
      author: '',
      description: '',
      category: [],
      config: {},
      teamId,
      tmbId
    });
    skillId = String(skill._id);
    const version = await MongoAgentSkillsVersion.create({
      skillId,
      tmbId,
      version: 0,
      storage: { bucket: 'private', key: 'old.zip', size: 1 }
    });
    currentVersionId = String(version._id);
    await MongoAgentSkills.updateOne({ _id: skillId }, { currentVersionId });
    const instance = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: 'fastgpt-session-id',
      status: 'running',
      sourceType: 'skillEdit',
      sourceId: skillId,
      teamId,
      runtimeUserId: 'skillEdit',
      sessionId: 'edit-debug',
      metadata: {
        sandboxType: 'edit-debug',
        skillId,
        teamId,
        providerSandboxId: 'provider-assigned-id'
      }
    });
    instanceId = String(instance._id);
    packageBuffer = await createSkillPackage({
      name: 'draft',
      skillMd: '---\nname: draft\ndescription: Draft\n---\n'
    });
    mocks.package.mockImplementation(async ({ assertActive }) => {
      await assertActive();
      return packageBuffer;
    });
    mocks.stage.mockImplementation(async ({ versionId, zipBuffer, checksum }) => {
      expect(mocks.held.has(`skill-edit-init:${skillId}`)).toBe(true);
      return { bucket: 'private', key: `${versionId}.zip`, size: zipBuffer.length, checksum };
    });
  });

  it('uses the logical sandbox id and commits an explicitly unknown legacy baseline', async () => {
    const result = await save();
    expect(mocks.package).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: 'fastgpt-session-id', operationId: 'publish-lease' })
    );
    expect(result.workspace.baseVersionId).toBe(result.versionId);
    expect(result.workspace.stale).toBe(false);
    expect(mocks.held.size).toBe(0);
  });
  it('preserves the draft baseline and current version on an upload failure', async () => {
    mocks.stage.mockRejectedValueOnce(new Error('upload failed'));
    await expect(save()).rejects.toThrow('upload failed');
    const instance = await MongoSandboxInstance.findById(instanceId).lean();
    expect(instance?.baseVersionId).toBeUndefined();
    expect(instance?.operation?.error?.code).toBe('workspace_publish_failed');
    expect(instance?.status).toBe('failed');
    expect(instance?.operation?.failureDisposition).toBe('unknown');
    expect(String((await MongoAgentSkills.findById(skillId).lean())?.currentVersionId)).toBe(
      currentVersionId
    );
    expect(await MongoAgentSkillsVersion.countDocuments({ skillId })).toBe(1);
  });
  it.each(['export', 'package'])(
    'allows correcting a locally rejected %s and saving again',
    async (boundary) => {
      if (boundary === 'export') {
        mocks.package.mockRejectedValueOnce(
          new SkillPackageValidationError('runtime_name_mismatch', 'Invalid QA package')
        );
      } else {
        mocks.package.mockResolvedValueOnce(Buffer.from('invalid ZIP'));
      }
      await expect(save()).rejects.toBeInstanceOf(SkillPackageValidationError);
      const instance = await MongoSandboxInstance.findById(instanceId).lean();
      expect(instance).toMatchObject({
        status: 'running',
        operation: {
          type: 'publish',
          checkpoint: 'rejected',
          failureDisposition: 'retryable',
          error: { code: 'invalid_package' }
        }
      });
      expect(instance?.metadata?.providerSandboxId).toBe('provider-assigned-id');
      expect(instance?.baseVersionId).toBeUndefined();
      expect(instance && isEditWorkspaceOperationComplete(instance)).toBe(true);
      expect(mocks.stage).not.toHaveBeenCalled();
      expect(await MongoAgentSkillsVersion.countDocuments({ skillId })).toBe(1);
      const result = await save();
      expect(result.workspace.status).toBe('running');
      expect(result.workspace.baseVersionId).toBe(result.versionId);
      expect(await MongoAgentSkillsVersion.countDocuments({ skillId })).toBe(2);
    }
  );
  it('does not infer local rejection from a forged validation error name', async () => {
    mocks.package.mockRejectedValueOnce(
      Object.assign(new Error('transport failed'), { name: 'SkillPackageValidationError' })
    );
    await expect(save()).rejects.toThrow('transport failed');
    expect(await MongoSandboxInstance.findById(instanceId).lean()).toMatchObject({
      status: 'failed',
      operation: { checkpoint: 'claimed', error: { code: 'workspace_publish_failed' } }
    });
  });
  it('does not release a validation-shaped error after external publishing begins', async () => {
    mocks.stage.mockRejectedValueOnce(
      new SkillPackageValidationError('invalid_zip', 'Unexpected stage error')
    );
    await expect(save()).rejects.toThrow('Unexpected stage error');
    expect(await MongoSandboxInstance.findById(instanceId).lean()).toMatchObject({
      status: 'failed',
      operation: { failureDisposition: 'unknown', error: { code: 'workspace_publish_failed' } }
    });
  });
  it('never completes a rejected export after its operation owner changes', async () => {
    mocks.package.mockImplementationOnce(async () => {
      await MongoSandboxInstance.updateOne(
        { _id: instanceId },
        { $set: { 'operation.id': 'new-owner' } }
      );
      throw new SkillPackageValidationError('invalid_zip', 'Invalid QA package');
    });
    await expect(save()).rejects.toBeInstanceOf(SkillPackageValidationError);
    expect(await MongoSandboxInstance.findById(instanceId).lean()).toMatchObject({
      status: 'provisioning',
      operation: { id: 'new-owner', checkpoint: 'claimed' }
    });
  });
  it('never replaces a ready-shaped operation whose publication outcome is unknown', async () => {
    await MongoSandboxInstance.updateOne(
      { _id: instanceId },
      {
        $set: {
          operation: {
            id: 'uncertain-commit',
            type: 'publish',
            checkpoint: 'ready',
            failureDisposition: 'unknown',
            startedAt: new Date(),
            updatedAt: new Date()
          }
        }
      }
    );
    const before = await MongoSandboxInstance.findById(instanceId).lean();
    await expect(save()).rejects.toThrow('operation_conflict');
    expect(mocks.package).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.findById(instanceId).lean()).toEqual(before);
  });
  it('supports an explicitly absent current pointer when claiming publication', async () => {
    await MongoAgentSkills.updateOne({ _id: skillId }, { $unset: { currentVersionId: '' } });
    const result = await publishEditWorkspace({
      skillId,
      teamId,
      tmbId,
      expectedBaseVersionId: null,
      expectedCurrentVersionId: null
    });
    expect(result.workspace.status).toBe('running');
    expect(result.workspace.baseVersionId).toBe(result.versionId);
  });
  it('does not replace committed ready state when publication reports an error afterwards', async () => {
    const publish = skillPublisher.publishSkillPackage;
    vi.spyOn(skillPublisher, 'publishSkillPackage').mockImplementationOnce(async (params) => {
      await publish(params);
      throw new Error('publication response lost after commit');
    });
    await expect(save()).rejects.toThrow('publication response lost after commit');
    const instance = await MongoSandboxInstance.findById(instanceId).lean();
    const skill = await MongoAgentSkills.findById(skillId).lean();
    expect(instance).toMatchObject({
      status: 'running',
      operation: { type: 'publish', checkpoint: 'ready', failureDisposition: 'retryable' }
    });
    expect(instance?.operation?.error).toBeUndefined();
    expect(String(instance?.baseVersionId)).toBe(String(skill?.currentVersionId));
    expect(String(skill?.currentVersionId)).not.toBe(currentVersionId);
    expect(await MongoAgentSkillsVersion.countDocuments({ skillId })).toBe(2);
  });
  it('rejects a version change before claiming without exporting or mutating the workspace', async () => {
    const nextVersion = await MongoAgentSkillsVersion.create({
      skillId,
      tmbId,
      version: 1,
      storage: { bucket: 'private', key: 'other.zip', size: 1 }
    });
    const before = await MongoSandboxInstance.findById(instanceId).lean();
    mocks.beforeAssertOwned.mockImplementationOnce(async () => {
      await MongoAgentSkills.updateOne({ _id: skillId }, { currentVersionId: nextVersion._id });
    });
    await expect(save()).rejects.toThrow(SkillErrEnum.versionConflict);
    expect(mocks.package).not.toHaveBeenCalled();
    expect(mocks.stage).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.findById(instanceId).lean()).toEqual(before);
    expect(String((await MongoAgentSkills.findById(skillId).lean())?.currentVersionId)).toBe(
      String(nextVersion._id)
    );
  });
  it('rejects another save while the first export holds the shared Edit lease', async () => {
    let release = () => {};
    let exported = () => {};
    const entered = new Promise<void>((resolve) => {
      exported = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.package.mockImplementationOnce(async () => {
      exported();
      await gate;
      return packageBuffer;
    });
    const first = save();
    await entered;
    await expect(save()).rejects.toThrow('operation_conflict');
    release();
    await first;
    expect(await MongoAgentSkillsVersion.countDocuments({ skillId })).toBe(2);
  });
});
