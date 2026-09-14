import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { publishSkillPackage } from '@fastgpt/service/core/agentSkills/version/publish';
import { createSkillPackage } from '@fastgpt/service/core/agentSkills/zipBuilder';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/core/agentSkills/storage', () => ({
  finalizeStagedSkillPackage: vi.fn(),
  stageSkillPackage: vi.fn(async ({ versionId, zipBuffer, checksum }) => ({
    bucket: 'private',
    key: `${versionId}.zip`,
    size: zipBuffer.length,
    checksum
  }))
}));

describe('publishing an Edit workspace transaction', () => {
  const teamId = new Types.ObjectId().toHexString();
  const tmbId = new Types.ObjectId().toHexString();
  let skillId: string;
  let baseVersionId: string;
  let instanceId: string;
  let packageBuffer: Buffer;
  beforeEach(async () => {
    const skill = await MongoAgentSkills.create({
      source: 'personal',
      name: 'draft',
      description: '',
      author: '',
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
    baseVersionId = String(version._id);
    await MongoAgentSkills.updateOne({ _id: skillId }, { currentVersionId: version._id });
    const instance = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: 'publish-test',
      sourceType: 'skillEdit',
      sourceId: skillId,
      teamId,
      runtimeUserId: 'skillEdit',
      sessionId: 'edit-debug',
      status: 'provisioning',
      baseVersionId,
      workspaceGeneration: 'one',
      operation: {
        id: 'publish-one',
        type: 'publish',
        checkpoint: 'package_ready',
        startedAt: new Date(),
        updatedAt: new Date()
      }
    });
    instanceId = String(instance._id);
    packageBuffer = await createSkillPackage({
      name: 'draft',
      skillMd: '---\nname: draft\ndescription: Draft\n---\n'
    });
  });
  const publish = (generation = 'one') =>
    publishSkillPackage({
      teamId,
      tmbId,
      skillId,
      expectedCurrentVersionId: baseVersionId,
      packageBuffer,
      workspace: {
        instanceId,
        sandboxId: 'publish-test',
        operationId: 'publish-one',
        generation,
        expectedBaseVersionId: baseVersionId,
        assertActive: async () => {},
        markExternalEffect: async () => {
          await MongoSandboxInstance.updateOne(
            { _id: instanceId, 'operation.id': 'publish-one' },
            { $set: { 'operation.failureDisposition': 'unknown' } }
          );
        }
      }
    });

  it('commits version, current pointer and draft baseline together', async () => {
    const result = await publish();
    const instance = await MongoSandboxInstance.findById(instanceId).lean();
    expect(String(instance?.baseVersionId)).toBe(result.versionId);
    expect(instance?.operation).toMatchObject({
      id: 'publish-one',
      type: 'publish',
      checkpoint: 'ready',
      failureDisposition: 'retryable'
    });
    expect(instance?.status).toBe('running');
  });

  it.each(['generation', 'operation', 'base'])(
    'rolls back the version when the workspace %s changes',
    async (field) => {
      await MongoSandboxInstance.updateOne(
        { _id: instanceId },
        {
          $set:
            field === 'generation'
              ? { workspaceGeneration: 'two' }
              : field === 'operation'
                ? { 'operation.id': 'other' }
                : { baseVersionId: new Types.ObjectId() }
        }
      );
      await expect(publish()).rejects.toThrow('workspace_conflict');
      expect(await MongoAgentSkillsVersion.countDocuments({ skillId })).toBe(1);
      expect(String((await MongoAgentSkills.findById(skillId).lean())?.currentVersionId)).toBe(
        baseVersionId
      );
    }
  );
});
