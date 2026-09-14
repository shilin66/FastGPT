import { describe, expect, it } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { resolveEditWorkspace } from '@fastgpt/service/core/agentSkills/editWorkspace/entity';
import { getEditWorkspaceState } from '@fastgpt/service/core/agentSkills/editWorkspace/service';

describe('shared Skill Edit workspace state', () => {
  const teamId = new Types.ObjectId().toHexString();
  const skillId = new Types.ObjectId().toHexString();
  const currentVersionId = new Types.ObjectId().toHexString();
  const create = (extra: Record<string, unknown> = {}) =>
    MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: `edit-${new Types.ObjectId()}`,
      sourceType: 'skillEdit',
      sourceId: skillId,
      teamId,
      runtimeUserId: 'skillEdit',
      sessionId: 'edit-debug',
      status: 'running',
      metadata: {
        sandboxType: SandboxTypeEnum.editDebug,
        skillId,
        teamId,
        workspaceRoot: '/workspace/edit',
        volumeEnabled: true,
        providerSandboxId: 'existing-provider'
      },
      storage: {
        volumes: [{ name: 'workspace', claimName: 'test-pvc', mountPath: '/workspace' }],
        mountPath: '/workspace'
      },
      ...extra
    });

  it('reports absent without inventing a draft baseline', async () => {
    expect(await getEditWorkspaceState({ skillId, teamId, currentVersionId })).toMatchObject({
      status: 'absent',
      baseVersionId: null,
      currentVersionId,
      resetAvailable: false
    });
  });

  it('retains unknown legacy baseline and only exposes safe operation fields', async () => {
    await create({
      sourceType: undefined,
      sourceId: undefined,
      runtimeUserId: undefined,
      sessionId: undefined,
      appId: skillId,
      chatId: 'edit-debug',
      operation: {
        id: 'done',
        type: 'editInitialize',
        checkpoint: 'ready',
        startedAt: new Date(),
        updatedAt: new Date(),
        error: { code: 'safe_code', message: 'SECRET' }
      }
    });
    const state = await getEditWorkspaceState({ skillId, teamId, currentVersionId });
    expect(state.baseVersionId).toBeNull();
    expect(state.stale).toBe(true);
    expect(JSON.stringify(state)).not.toContain('SECRET');
  });

  it.each([
    { status: 'provisioning', type: 'provision', checkpoint: 'volume_ensure' },
    { status: 'failed', type: 'provision', checkpoint: 'volume_ensure' },
    { status: 'failed', type: 'editInitialize', checkpoint: 'package_extract' }
  ])('does not call an uninitialized $status/$checkpoint workspace stale', async (phase) => {
    await create({
      status: phase.status,
      operation: {
        id: 'initial-operation',
        type: phase.type,
        checkpoint: phase.checkpoint,
        startedAt: new Date(),
        updatedAt: new Date(),
        ...(phase.status === 'failed'
          ? { error: { code: 'initialization_failed', message: 'Initialization failed' } }
          : {})
      }
    });
    expect(await getEditWorkspaceState({ skillId, teamId, currentVersionId })).toMatchObject({
      status: phase.status,
      baseVersionId: null,
      currentVersionId,
      stale: false,
      resetAvailable: false
    });
  });

  it('keeps a migrated historical workspace with an unknown baseline stale', async () => {
    const instance = await create();
    await MongoSandboxInstance.updateOne(
      { _id: instance._id },
      { $set: { 'metadata.storage': { bucket: 'legacy', key: 'legacy.zip', size: 1 } } }
    );
    expect(await getEditWorkspaceState({ skillId, teamId, currentVersionId })).toMatchObject({
      baseVersionId: null,
      stale: true
    });
  });

  it('keeps an established older baseline stale even when its operation failed', async () => {
    const baseVersionId = new Types.ObjectId().toHexString();
    await create({ status: 'failed', baseVersionId });
    expect(await getEditWorkspaceState({ skillId, teamId, currentVersionId })).toMatchObject({
      baseVersionId,
      stale: true
    });
  });

  it('rejects multiple workspace identities and returns a safe conflict state', async () => {
    await create();
    await create();
    await expect(resolveEditWorkspace({ skillId, teamId })).rejects.toThrow(
      'workspace_identity_conflict'
    );
    expect(await getEditWorkspaceState({ skillId, teamId, currentVersionId })).toMatchObject({
      status: 'conflict',
      resetUnavailableReason: 'identity_conflict'
    });
  });

  it('never advertises reset for a historical root outside the persisted mount', async () => {
    await create({
      metadata: {
        sandboxType: SandboxTypeEnum.editDebug,
        skillId,
        teamId,
        workspaceRoot: '/home/sandbox/workspace',
        volumeEnabled: true
      }
    });
    expect(await getEditWorkspaceState({ skillId, teamId, currentVersionId })).toMatchObject({
      resetAvailable: false,
      resetUnavailableReason: 'not_persistent'
    });
  });

  it('recognizes publish completion and exposes the reset generation', async () => {
    await create({
      baseVersionId: currentVersionId,
      workspaceGeneration: 'generation-2',
      operation: {
        id: 'publish',
        type: 'publish',
        checkpoint: 'ready',
        startedAt: new Date(),
        updatedAt: new Date()
      }
    });
    expect(await getEditWorkspaceState({ skillId, teamId, currentVersionId })).toMatchObject({
      stale: false,
      resetAvailable: true,
      generation: 'generation-2'
    });
  });

  it.each([
    {
      type: 'publish',
      checkpoint: 'rejected',
      disposition: 'retryable',
      code: 'invalid_package',
      allowed: true
    },
    {
      type: 'publish',
      checkpoint: 'rejected',
      disposition: 'unknown',
      code: 'invalid_package',
      allowed: false
    },
    {
      type: 'resetWorkspace',
      checkpoint: 'rejected',
      disposition: 'retryable',
      code: 'invalid_package',
      allowed: false
    },
    {
      type: 'publish',
      checkpoint: 'package_ready',
      disposition: 'retryable',
      code: 'invalid_package',
      allowed: false
    },
    {
      type: 'publish',
      checkpoint: 'rejected',
      disposition: 'retryable',
      code: 'workspace_publish_failed',
      allowed: false
    }
  ])(
    'only offers reset for an exact terminal rejection: $type/$checkpoint/$disposition/$code',
    async (phase) => {
      await create({
        baseVersionId: currentVersionId,
        operation: {
          id: 'validation-rejected',
          type: phase.type,
          checkpoint: phase.checkpoint,
          startedAt: new Date(),
          updatedAt: new Date(),
          failureDisposition: phase.disposition,
          error: { code: phase.code, message: 'not exposed' }
        }
      });
      expect(await getEditWorkspaceState({ skillId, teamId, currentVersionId })).toMatchObject({
        status: 'running',
        stale: false,
        resetAvailable: phase.allowed,
        operation: { errorCode: phase.code }
      });
    }
  );
});
