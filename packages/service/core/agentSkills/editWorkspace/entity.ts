import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { generateSandboxIdentityId } from '../../ai/sandbox/identity';
import { MongoSandboxInstance } from '../../ai/sandbox/schema';
import type { SandboxInstanceSchemaType } from '../../ai/sandbox/type';
import { type SandboxLease, SandboxOperationConflict } from '../../ai/sandbox/lease';
import { registerSandboxOperationHeartbeat } from '../../ai/sandbox/operation';
import { isEditWorkspaceOperationComplete } from './utils';
import { randomUUID } from 'node:crypto';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import type { ClientSession } from '../../../common/mongo';
import { MongoAgentSkills } from '../schema';
import { UserError } from '@fastgpt/global/common/error/utils';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';

export const claimEditWorkspace = async ({
  instance,
  lease,
  type,
  expectedCurrentVersion
}: {
  instance: SandboxInstanceSchemaType;
  lease: SandboxLease;
  type: 'publish' | 'resetWorkspace';
  expectedCurrentVersion?: { skillId: string; teamId: string; versionId: string | null };
}) => {
  if (!isEditWorkspaceOperationComplete(instance)) throw new SandboxOperationConflict();
  await lease.assertOwned();
  const now = new Date();
  const generation = type === 'resetWorkspace' ? randomUUID() : instance.workspaceGeneration;
  const claim = async (session?: ClientSession) => {
    if (expectedCurrentVersion) {
      const current = await MongoAgentSkills.updateOne(
        {
          _id: expectedCurrentVersion.skillId,
          teamId: expectedCurrentVersion.teamId,
          currentVersionId: expectedCurrentVersion.versionId,
          deleteTime: null
        },
        { $set: { updateTime: now } },
        { session }
      );
      if (current.matchedCount !== 1) throw new UserError(SkillErrEnum.versionConflict);
    }
    return MongoSandboxInstance.findOneAndUpdate(
      {
        _id: instance._id,
        status: instance.status,
        deleteTime: null,
        'operation.id': instance.operation?.id ?? { $exists: false },
        'operation.type': instance.operation?.type ?? { $exists: false },
        'operation.checkpoint': instance.operation?.checkpoint ?? { $exists: false },
        'operation.updatedAt': instance.operation?.updatedAt ?? { $exists: false },
        'metadata.providerSandboxId': instance.metadata?.providerSandboxId ?? { $exists: false },
        'metadata.workspaceRoot': instance.metadata?.workspaceRoot ?? { $exists: false },
        baseVersionId: instance.baseVersionId ?? null,
        workspaceGeneration: instance.workspaceGeneration ?? { $exists: false }
      },
      {
        $set: {
          status: 'provisioning',
          ...(generation ? { workspaceGeneration: generation } : {}),
          operation: {
            id: lease.token,
            type,
            checkpoint: 'claimed',
            startedAt: now,
            updatedAt: now,
            heartbeatAt: now,
            failureDisposition: 'retryable'
          }
        }
      },
      { new: true, session }
    ).lean();
  };
  const claimed = expectedCurrentVersion ? await mongoSessionRun(claim) : await claim();
  if (!claimed) throw new SandboxOperationConflict();
  const filter = {
    _id: instance._id,
    deleteTime: null,
    status: 'provisioning',
    'operation.id': lease.token,
    'operation.type': type,
    workspaceGeneration: generation ?? { $exists: false }
  };
  registerSandboxOperationHeartbeat(lease, {
    provider: instance.provider,
    sandboxId: instance.sandboxId,
    operationId: lease.token,
    operationType: type
  });
  const assertActive = async () => {
    await lease.assertOwned();
    if (!(await MongoSandboxInstance.exists(filter))) throw new SandboxOperationConflict();
    await lease.assertOwned();
  };
  const checkpoint = async (phase: string, fields: Record<string, unknown> = {}) => {
    await assertActive();
    const result = await MongoSandboxInstance.updateOne(filter, {
      $set: { ...fields, 'operation.checkpoint': phase, 'operation.updatedAt': new Date() }
    });
    if (result.matchedCount !== 1) throw new SandboxOperationConflict();
    await lease.assertOwned();
  };
  const markRemoteEffect = async () => {
    await assertActive();
    const result = await MongoSandboxInstance.updateOne(filter, {
      $set: { 'operation.failureDisposition': 'unknown', 'operation.updatedAt': new Date() }
    });
    if (result.matchedCount !== 1) throw new SandboxOperationConflict();
    await assertActive();
  };
  const remoteEffect = async <T>(run: () => Promise<T>): Promise<T> => {
    await markRemoteEffect();
    return run();
  };
  const fail = async ({
    invalidPackage = false,
    terminalRejection
  }: { invalidPackage?: boolean; terminalRejection?: 'busy' | 'probe_failed' } = {}) => {
    await assertActive();
    if (type === 'publish' && (invalidPackage || terminalRejection)) {
      // Only local validation before publication side effects may leave the draft editable.
      const rejected = await MongoSandboxInstance.updateOne(
        {
          ...filter,
          'operation.checkpoint': { $in: ['claimed', 'package_ready'] },
          'operation.failureDisposition': 'retryable',
          'operation.error': { $exists: false }
        },
        {
          $set: {
            status: 'running',
            'operation.checkpoint': 'rejected',
            'operation.updatedAt': new Date(),
            'operation.error': {
              code: terminalRejection ? `terminal_${terminalRejection}` : 'invalid_package',
              message: 'Publication preflight rejected; draft retained'
            }
          }
        }
      );
      if (rejected.matchedCount === 1) return;
      await assertActive();
    }
    await MongoSandboxInstance.updateOne(filter, {
      $set: {
        status: 'failed',
        'operation.updatedAt': new Date(),
        'operation.error': {
          code: type === 'publish' ? 'workspace_publish_failed' : 'workspace_reset_failed',
          message: 'Workspace operation did not complete; draft retained'
        }
      }
    });
  };
  return {
    instance: claimed,
    filter,
    assertActive,
    checkpoint,
    markRemoteEffect,
    remoteEffect,
    fail
  };
};

export class EditWorkspaceIdentityConflict extends Error {
  constructor() {
    super('workspace_identity_conflict');
  }
}

export const resolveEditWorkspace = async ({
  skillId,
  teamId
}: {
  skillId: string;
  teamId: string;
}) => {
  const sandboxId = generateSandboxIdentityId({ sourceType: 'skillEdit', sourceId: skillId });
  const candidates = await MongoSandboxInstance.find({
    $or: [
      { sourceType: 'skillEdit', sourceId: skillId },
      { appId: skillId, chatId: 'edit-debug' },
      { 'metadata.skillId': skillId, 'metadata.sandboxType': SandboxTypeEnum.editDebug },
      { sandboxId }
    ]
  })
    .limit(2)
    .lean();
  if (candidates.length > 1) throw new EditWorkspaceIdentityConflict();
  const instance = candidates[0];
  if (!instance) return null;
  const canonical =
    instance.sourceType === 'skillEdit' &&
    instance.sourceId === skillId &&
    instance.runtimeUserId === 'skillEdit' &&
    instance.sessionId === 'edit-debug' &&
    String(instance.teamId) === teamId;
  const legacy =
    !instance.sourceType &&
    instance.appId === skillId &&
    instance.chatId === 'edit-debug' &&
    instance.metadata?.sandboxType === SandboxTypeEnum.editDebug &&
    instance.metadata.skillId === skillId &&
    instance.metadata.teamId === teamId;
  if (
    (!canonical && !legacy) ||
    (instance.appId && instance.appId !== skillId) ||
    (instance.chatId && instance.chatId !== 'edit-debug') ||
    (instance.teamId && String(instance.teamId) !== teamId) ||
    (instance.metadata?.teamId && instance.metadata.teamId !== teamId) ||
    (instance.metadata?.skillId && instance.metadata.skillId !== skillId) ||
    (instance.metadata?.sandboxType && instance.metadata.sandboxType !== SandboxTypeEnum.editDebug)
  ) {
    throw new EditWorkspaceIdentityConflict();
  }
  return instance;
};
