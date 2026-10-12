import { createHash } from 'node:crypto';
import type { SandboxInstanceSchemaType } from './type';
import { SandboxOperationConflict } from './lease';

export const getSandboxForceDeleteRevision = (instance: SandboxInstanceSchemaType): string =>
  createHash('sha256')
    .update(
      JSON.stringify([
        String(instance._id),
        instance.provider,
        instance.providerScope,
        instance.sandboxId,
        instance.sourceType,
        instance.sourceId,
        String(instance.teamId ?? ''),
        String(instance.ownerTmbId ?? ''),
        instance.runtimeUserId,
        instance.reuseScope,
        instance.sessionId,
        instance.sourceChatId,
        instance.appId,
        instance.userId,
        instance.chatId,
        instance.workspaceGeneration,
        instance.status,
        instance.deleteTime,
        instance.releasedAt,
        instance.metadata,
        instance.storage,
        instance.archive,
        instance.archiveKeys,
        instance.operation,
        instance.forceDeletion
      ])
    )
    .digest('hex');

export const canForceDeleteSandbox = (instance: SandboxInstanceSchemaType): boolean =>
  instance.provider === 'opensandbox' && instance.sourceType === 'appRuntime';

export const prepareForceDeleteClaim = (instance: SandboxInstanceSchemaType, revision: string) => {
  if (!canForceDeleteSandbox(instance))
    throw new SandboxOperationConflict('sandbox_force_delete_ownership_conflict');
  if (getSandboxForceDeleteRevision(instance) !== revision)
    throw new SandboxOperationConflict('sandbox_force_delete_stale');
  const operation = instance.operation;
  if (
    ['provisioning', 'stopping', 'deleting', 'archiving', 'restoring'].includes(instance.status) &&
    operation &&
    !operation.error &&
    (operation.heartbeatAt ?? operation.updatedAt).getTime() > Date.now() - 45 * 60_000
  )
    throw new SandboxOperationConflict('sandbox_force_delete_busy');
  return (
    instance.forceDeletion ?? {
      requestedAt: new Date(),
      ...(operation ? { previousOperation: operation } : {})
    }
  );
};
