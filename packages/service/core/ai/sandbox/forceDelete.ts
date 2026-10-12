import type { OpenSandboxAdapter } from '@fastgpt-sdk/sandbox-adapter';
import { env } from '../../../env';
import { getLogger, LogCategories } from '../../../common/logger';
import { runSandboxOperation } from './operation';
import { getSandboxOwnership } from './ownership';
import { SandboxBusyBeforeEffectError, SandboxOperationConflict } from './lease';
import { deleteSessionVolume, getSandboxProviderScope, prepareVolumeManagerConfig } from './config';
import type { SandboxInstanceSchemaType } from './type';

type PendingReason =
  | 'busy'
  | 'stale'
  | 'ownership_conflict'
  | 'unknown_operation'
  | 'cleanup_failed';
export type SandboxForceDeleteResult =
  | { success: true; status: 'deleted' }
  | { success: false; status: 'pending'; reason: PendingReason };

class UnknownOriginalOperation extends Error {}
const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

const assertOriginalEffectSettled = (instance: SandboxInstanceSchemaType) => {
  const original = instance.forceDeletion?.previousOperation ?? instance.operation;
  if (!original || original.effectState === 'completed') return;
  const createsResource =
    original.checkpoint === 'volume_ensure' ||
    ['provision', 'start', 'restore', 'resetWorkspace', 'archive'].includes(original.type);
  if (
    createsResource &&
    (original.effectState === 'pending' || original.failureDisposition === 'unknown')
  ) {
    throw new UnknownOriginalOperation();
  }
};

export const forceDeleteSandboxWorkspace = async ({
  instance,
  provider,
  deletionRevision,
  assertAuthorized
}: {
  instance: SandboxInstanceSchemaType;
  provider: OpenSandboxAdapter;
  deletionRevision: string;
  assertAuthorized: () => Promise<void>;
}): Promise<SandboxForceDeleteResult> => {
  if (
    env.AGENT_SANDBOX_PROVIDER !== 'opensandbox' ||
    env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME !== 'docker'
  ) {
    throw new SandboxOperationConflict('sandbox_force_delete_ownership_conflict');
  }
  getSandboxOwnership(instance);
  try {
    await runSandboxOperation(
      {
        provider: 'opensandbox',
        sandboxId: instance.sandboxId,
        action: 'delete',
        priority: 'interactive',
        expectedInstance: instance,
        assertAuthorized,
        forceDelete: { deletionRevision }
      },
      async (operation) => {
        const previous = operation.previous;
        if (!previous) throw new SandboxOperationConflict();
        getSandboxOwnership(previous);
        assertOriginalEffectSettled(previous);
        const checkpoint =
          previous.operation?.type === 'delete' ? previous.operation.checkpoint : undefined;
        const volume =
          checkpoint !== 'volume_deleted'
            ? prepareVolumeManagerConfig({
                sandboxId: instance.sandboxId,
                previous,
                action: 'delete'
              })
            : undefined;
        const expectedId =
          previous.operation?.providerSandboxId ?? previous.metadata?.providerSandboxId;
        if (
          previous.operation?.providerSandboxId &&
          previous.metadata?.providerSandboxId &&
          previous.operation.providerSandboxId !== previous.metadata.providerSandboxId
        ) {
          throw new SandboxOperationConflict('sandbox_force_delete_ownership_conflict');
        }
        if (checkpoint !== 'provider_deleted' && checkpoint !== 'volume_deleted') {
          const remote = await provider.inspectExisting(expectedId);
          if (!remote && expectedId && (await provider.inspectExisting())) {
            throw new SandboxOperationConflict('sandbox_force_delete_ownership_conflict');
          }
          await operation.assertActive();
          if (!remote && previous.providerScope !== getSandboxProviderScope('opensandbox')) {
            throw new SandboxOperationConflict('sandbox_force_delete_ownership_conflict');
          }
          await operation.checkpoint('provider_delete', {
            providerScope: getSandboxProviderScope('opensandbox'),
            ...(remote ? { 'operation.providerSandboxId': remote.id } : {})
          });
          if (remote) {
            await operation.remoteEffect(() => provider.deleteExisting(remote.id));
            if ((await provider.inspectExisting(remote.id)) || (await provider.inspectExisting()))
              throw new Error('sandbox_deletion_pending');
          }
          await operation.checkpoint('provider_deleted', { capacityReserved: false });
        } else if (previous.capacityReserved !== false) {
          await operation.checkpoint(checkpoint, { capacityReserved: false });
        }
        if (checkpoint !== 'volume_deleted') {
          await operation.assertActive();
          if (volume) await deleteSessionVolume(instance.sandboxId, volume);
          await operation.checkpoint('volume_deleted');
        }
        const keys = [
          ...new Set([
            ...(previous.archiveKeys ?? []),
            ...(previous.archive ? [previous.archive.key] : [])
          ])
        ];
        if (keys.length) {
          const { getSandboxArchiveStorage } = await import('./archiveStorage');
          for (const key of keys) {
            await operation.assertActive();
            await getSandboxArchiveStorage().remove(instance.sandboxId, key);
          }
        }
        await operation.remove();
      }
    );
    return { success: true, status: 'deleted' };
  } catch (error) {
    let reason: PendingReason = 'cleanup_failed';
    if (error instanceof UnknownOriginalOperation) reason = 'unknown_operation';
    else if (error instanceof SandboxBusyBeforeEffectError) reason = 'busy';
    else if (error instanceof SandboxOperationConflict) {
      reason = error.message.includes('sandbox_force_delete_stale')
        ? 'stale'
        : error.message.includes('sandbox_force_delete_busy')
          ? 'busy'
          : 'ownership_conflict';
    }
    logger.warn('Sandbox force deletion is pending', { sandboxId: instance.sandboxId, reason });
    return { success: false, status: 'pending', reason };
  }
};
