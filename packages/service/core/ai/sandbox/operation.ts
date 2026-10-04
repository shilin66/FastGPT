import { MongoSandboxInstance } from './schema';
import {
  SandboxBusyBeforeEffectError,
  SandboxOperationConflict,
  withSandboxLease,
  withSandboxReadLease,
  type SandboxLease
} from './lease';
import type {
  SandboxInstanceSchemaType,
  SandboxOperationDiagnosis,
  SandboxProviderType
} from './type';
import { getLogger, LogCategories } from '../../../common/logger';
import {
  SandboxVolumeConfigurationError,
  VolumeManagerAuthRejectedBeforeEffectError
} from './errors';
import { isSandboxPublishRejected } from './utils';
import {
  assertSandboxCapacity,
  getSandboxCapacityType,
  hasSandboxCapacityReservation,
  withSandboxCapacityTransaction
} from './capacity';
import type { ClientSession } from '../../../common/mongo';
import { getSandboxProviderScope } from './config';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);
type OperationAction = 'ensure' | 'stop' | 'release' | 'delete' | 'archive' | 'restore';

export const registerSandboxOperationHeartbeat = (
  lease: SandboxLease,
  {
    provider,
    sandboxId,
    operationId,
    operationType
  }: {
    provider: SandboxProviderType;
    sandboxId: string;
    operationId: string;
    operationType: string;
  }
) => {
  lease.setHeartbeat(async () => {
    const result = await MongoSandboxInstance.updateOne(
      {
        provider,
        sandboxId,
        'operation.id': operationId,
        'operation.type': operationType,
        'operation.error': { $exists: false },
        status: { $in: ['provisioning', 'stopping', 'deleting', 'archiving', 'restoring'] }
      },
      { $max: { 'operation.heartbeatAt': new Date() } }
    );
    return result.matchedCount === 1;
  });
};

const canClaimOperation = (instance: SandboxInstanceSchemaType, action: OperationAction) => {
  const { status, operation } = instance;
  if (action === 'restore' && status === 'archived')
    return operation?.checkpoint === 'archived' || !operation;
  if (action === 'delete' && status === 'archived') return true;
  if (['archiving', 'restoring'].includes(status)) {
    const sameOperation = action === operation?.type || action === 'delete';
    const failedWithoutPendingEffect = !!operation?.error && operation.effectState !== 'pending';
    const quarantined =
      !!operation?.heartbeatAt && operation.heartbeatAt.getTime() < Date.now() - 45 * 60_000;
    return sameOperation && (failedWithoutPendingEffect || quarantined);
  }
  if (isSandboxPublishRejected(instance)) return true;
  if (!operation) return status === 'running' || status === 'stopped';
  if (operation.type === 'resetWorkspace' && operation.checkpoint !== 'ready') return false;
  if (status === 'failed' && operation.error) return operation.failureDisposition === 'retryable';
  if (status === 'deleting') {
    const interruptedBeforeNextEffect =
      operation.effectState === 'idle' &&
      ['pending', 'provider_delete', 'provider_deleted', 'volume_deleted'].includes(
        operation.checkpoint
      ) &&
      (operation.heartbeatAt ?? operation.updatedAt).getTime() < Date.now() - 45 * 60_000;
    return (
      action === 'delete' &&
      operation.type === 'delete' &&
      (!!operation.error || interruptedBeforeNextEffect) &&
      operation.failureDisposition === 'retryable'
    );
  }
  if (operation.error || operation.failureDisposition === 'unknown') return false;
  const completedInitialization =
    ([
      'provision',
      'start',
      'restore',
      'editInitialize',
      'publish',
      'resetWorkspace',
      'debug'
    ].includes(operation.type) &&
      operation.checkpoint === 'ready') ||
    (operation.type === 'deploy' && operation.checkpoint === 'completed');
  if (status === 'stopped') {
    // Old stop writers changed only status; permit resume without extending cleanup ownership.
    return (
      (operation.type === 'stop' && operation.checkpoint === 'provider_stopped') ||
      (operation.type === 'release' && operation.checkpoint === 'provider_released') ||
      ((action === 'ensure' || action === 'archive' || action === 'delete') &&
        completedInitialization)
    );
  }
  return status === 'running' && completedInitialization;
};

export const getInstanceBinding = (
  instance: SandboxInstanceSchemaType,
  includeStorage = false
) => ({
  _id: instance._id,
  provider: instance.provider,
  sandboxId: instance.sandboxId,
  providerScope: instance.providerScope ?? null,
  ...(includeStorage
    ? {
        storage: instance.storage ?? null,
        'metadata.providerSandboxId': instance.metadata?.providerSandboxId ?? null,
        'metadata.workspaceRoot': instance.metadata?.workspaceRoot ?? null
      }
    : {}),
  'metadata.sandboxType': instance.metadata?.sandboxType ?? null,
  'metadata.skillId': instance.metadata?.skillId ?? null,
  ...Object.fromEntries(
    (
      [
        'sourceType',
        'sourceId',
        'teamId',
        'ownerTmbId',
        'runtimeUserId',
        'sessionId',
        'sourceChatId',
        'reuseScope',
        'appId',
        'userId',
        'chatId',
        'workspaceGeneration'
      ] as const
    ).map((key) => [key, instance[key] ?? null])
  )
});

type SandboxOperation = {
  id: string;
  previous: SandboxInstanceSchemaType | null;
  assertActive: () => Promise<void>;
  checkpoint: (checkpoint: string, fields?: Record<string, unknown>) => Promise<void>;
  remoteEffect: <T>(run: () => Promise<T>) => Promise<T>;
  remove: () => Promise<void>;
};

const activityLeaseWaitMs = 125_000;
const activityLeaseRetryMs = 100;

export const runSandboxActivity = async <T>(
  {
    provider,
    sandboxId,
    expectedInstance,
    mode = 'write',
    priority = 'agent'
  }: {
    provider: string;
    sandboxId: string;
    expectedInstance?: SandboxInstanceSchemaType;
    mode?: 'read' | 'write';
    priority?: 'agent' | 'interactive';
  },
  run: () => Promise<T>
): Promise<T> => {
  const deadline = Date.now() + (priority === 'interactive' ? 20_000 : activityLeaseWaitMs);
  for (;;) {
    let entered = false;
    try {
      const execute = async (lease: SandboxLease) => {
        entered = true;
        const instance = await MongoSandboxInstance.findOne({ provider, sandboxId }).lean();
        if (instance && ['provisioning', 'stopping'].includes(instance.status)) {
          throw new SandboxBusyBeforeEffectError();
        }
        if (!instance || instance.status !== 'running' || instance.deleteTime) {
          throw new SandboxOperationConflict('Sandbox is not available for file or tool activity');
        }
        if (
          instance.providerScope &&
          instance.providerScope !== getSandboxProviderScope(instance.provider)
        )
          throw new SandboxOperationConflict('Sandbox provider deployment changed');
        const binding = getInstanceBinding(expectedInstance ?? instance, true);
        const touch = async () => {
          await lease.assertOwned();
          const updated = await MongoSandboxInstance.updateOne(
            { ...binding, status: 'running', deleteTime: null },
            { $max: { lastActiveAt: new Date() } }
          );
          if (updated.matchedCount !== 1)
            throw new SandboxOperationConflict('Sandbox activity binding changed');
        };
        await touch();
        try {
          const result = await run();
          await lease.assertOwned();
          return result;
        } finally {
          await touch().catch((error) =>
            logger.warn('Failed to renew Sandbox activity', { sandboxId, error })
          );
        }
      };
      const key = `sandbox:lease:${provider}:${sandboxId}`;
      const pinned = (writer?: SandboxLease) =>
        withSandboxReadLease(
          key,
          (reader) => {
            if (!writer) return execute(reader);
            return execute({
              token: writer.token,
              isActive: () => reader.isActive() && writer.isActive(),
              assertOwned: async () => {
                await reader.assertOwned();
                await writer.assertOwned();
              },
              setHeartbeat: (callback) => {
                reader.setHeartbeat(callback);
                writer.setHeartbeat(callback);
              }
            });
          },
          {
            priority: mode === 'read' ? 'preview' : priority,
            waitMs: priority === 'interactive' ? 8_000 : activityLeaseWaitMs
          }
        );
      return await (mode === 'read'
        ? pinned()
        : withSandboxLease(`${key}:activity`, (writer) => pinned(writer), {
            priority,
            waitMs: priority === 'interactive' ? 8_000 : activityLeaseWaitMs
          }));
    } catch (error) {
      // Never replay a callback: its effect may already have reached the provider.
      if (entered || !(error instanceof SandboxBusyBeforeEffectError) || Date.now() >= deadline) {
        throw error;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, activityLeaseRetryMs));
    }
  }
};

export const runSandboxOperation = async (
  options: {
    provider: SandboxProviderType;
    sandboxId: string;
    action: OperationAction;
    priority?: 'agent' | 'lifecycle' | 'interactive';
    insert?: Omit<Partial<SandboxInstanceSchemaType>, 'limit'> & {
      limit?: Partial<NonNullable<SandboxInstanceSchemaType['limit']>>;
    };
    shouldRun?: (doc: SandboxInstanceSchemaType) => boolean | Promise<boolean>;
    expectedInstance?: SandboxInstanceSchemaType;
    assertAuthorized?: () => Promise<void>;
  },
  run: (operation: SandboxOperation) => Promise<void>
) => {
  const { provider, sandboxId, action } = options;
  await withSandboxLease(
    `sandbox:lease:${provider}:${sandboxId}`,
    async (lease) => {
      await options.assertAuthorized?.();
      const previous = await MongoSandboxInstance.findOne({ provider, sandboxId }).lean();
      if (
        previous?.providerScope &&
        previous.providerScope !== getSandboxProviderScope(previous.provider)
      )
        throw new SandboxOperationConflict('Sandbox provider deployment changed');
      if (!previous && action === 'ensure' && options.expectedInstance) {
        throw new SandboxOperationConflict('Selected Sandbox workspace no longer exists');
      }
      if (!previous && action !== 'ensure') return;
      const binding = previous
        ? getInstanceBinding(
            options.expectedInstance ?? previous,
            !!options.expectedInstance || action !== 'ensure'
          )
        : {};
      if (previous && !(await MongoSandboxInstance.exists(binding))) {
        throw new SandboxOperationConflict('Sandbox ownership changed');
      }
      if (
        previous &&
        ['archived', 'archiving', 'restoring'].includes(previous.status) &&
        !['archive', 'restore', 'delete'].includes(action)
      ) {
        throw new SandboxOperationConflict(
          'Sandbox archive/restore lifecycle is not supported; existing resources are retained'
        );
      }
      if (previous && options.shouldRun && !(await options.shouldRun(previous))) return;
      if (action !== 'delete' && (previous?.status === 'deleting' || previous?.deleteTime)) {
        throw new SandboxOperationConflict();
      }
      if (previous && !canClaimOperation(previous, action)) {
        throw new SandboxOperationConflict(
          'An unfinished Sandbox operation requires explicit recovery; lease expiry does not permit takeover'
        );
      }

      const capacityType =
        getSandboxCapacityType(previous ?? {}) ??
        getSandboxCapacityType({ provider, ...options.insert });
      if ((capacityType || previous?.capacityReserved) && provider !== 'opensandbox') {
        throw new Error('sandbox_capacity_provider_unsupported');
      }
      const existingProviderRisk = !!previous && hasSandboxCapacityReservation(previous);
      const inheritedReservation =
        existingProviderRisk && getSandboxCapacityType(previous ?? {}) === capacityType;
      const reservesCapacity = ['ensure', 'archive', 'restore'].includes(action) && !!capacityType;

      const now = new Date();
      let checkpoint =
        previous?.operation?.type === action && ['delete', 'archive', 'restore'].includes(action)
          ? previous.operation.checkpoint
          : 'pending';
      let failureDisposition: 'retryable' | 'unknown' = 'retryable';
      const state = {
        status:
          action === 'archive'
            ? 'archiving'
            : action === 'restore'
              ? 'restoring'
              : action === 'ensure'
                ? 'provisioning'
                : action === 'stop' || action === 'release'
                  ? 'stopping'
                  : 'deleting',
        ...(reservesCapacity ? { capacityReserved: true } : {}),
        ...(action === 'ensure' && previous && capacityType && !previous.metadata?.sandboxType
          ? previous.metadata
            ? { 'metadata.sandboxType': capacityType }
            : { metadata: { sandboxType: capacityType } }
          : {}),
        operation: {
          id: lease.token,
          type: action === 'ensure' ? (previous ? 'start' : 'provision') : action,
          checkpoint,
          startedAt: now,
          updatedAt: now,
          heartbeatAt: now,
          failureDisposition: 'retryable',
          effectState: 'idle',
          ...(previous?.operation?.type === action && previous.operation.providerSandboxId
            ? { providerSandboxId: previous.operation.providerSandboxId }
            : {})
        },
        ...(action === 'delete' ? { deleteTime: previous?.deleteTime ?? now } : {})
      };
      await lease.assertOwned();
      await options.assertAuthorized?.();
      const claim = async (session?: ClientSession) => {
        await lease.assertOwned();
        if (session) {
          const committed = await MongoSandboxInstance.findOne({
            ...(previous ? binding : { provider, sandboxId }),
            ...(previous && capacityType ? { 'metadata.sandboxType': capacityType } : {}),
            status: state.status,
            capacityReserved: true,
            // Commit replay requires every key/value, independent of Mongoose's BSON field order.
            $expr: {
              $setEquals: [
                { $objectToArray: { $literal: state.operation } },
                { $objectToArray: { $ifNull: ['$operation', {}] } }
              ]
            }
          }).session(session);
          if (committed) return committed;
        }
        if (reservesCapacity && !inheritedReservation && capacityType) {
          await assertSandboxCapacity(capacityType, undefined, session);
        }
        const claimed = previous
          ? await MongoSandboxInstance.findOneAndUpdate(
              {
                ...binding,
                status: previous.status,
                capacityReserved: previous.capacityReserved ?? { $exists: false },
                deleteTime: previous.deleteTime ?? null,
                ...(options.shouldRun ? { lastActiveAt: previous.lastActiveAt } : {}),
                'operation.id': previous.operation?.id ?? { $exists: false },
                'operation.type': previous.operation?.type ?? { $exists: false },
                'operation.checkpoint': previous.operation?.checkpoint ?? { $exists: false },
                'operation.updatedAt': previous.operation?.updatedAt ?? { $exists: false },
                'operation.failureDisposition': previous.operation?.failureDisposition ?? {
                  $exists: false
                }
              },
              { $set: state },
              { new: true, session }
            )
          : (
              await MongoSandboxInstance.create(
                [{ ...options.insert, provider, sandboxId, ...state }],
                { session, ordered: true }
              )
            )[0];
        if (!claimed) throw new SandboxOperationConflict();
        await lease.assertOwned();
        return claimed;
      };
      const claimed =
        reservesCapacity && capacityType
          ? await withSandboxCapacityTransaction(capacityType, claim)
          : await claim();
      registerSandboxOperationHeartbeat(lease, {
        provider,
        sandboxId,
        operationId: lease.token,
        operationType: state.operation.type
      });

      const filter: Record<string, unknown> = {
        ...getInstanceBinding(claimed, action !== 'ensure'),
        'operation.id': lease.token,
        'operation.type': state.operation.type
      };
      const assertActive = async () => {
        await lease.assertOwned();
        await options.assertAuthorized?.();
        if (!(await MongoSandboxInstance.exists(filter))) throw new SandboxOperationConflict();
        await lease.assertOwned();
      };
      const operation: SandboxOperation = {
        id: lease.token,
        previous,
        assertActive,
        checkpoint: async (next, fields = {}) => {
          await assertActive();
          const result = await MongoSandboxInstance.updateOne(filter, {
            $set: {
              ...fields,
              'operation.checkpoint': next,
              'operation.updatedAt': new Date(),
              'operation.failureDisposition': 'retryable',
              'operation.effectState': 'idle'
            }
          });
          if (result.matchedCount !== 1) throw new SandboxOperationConflict();
          for (const [key, value] of Object.entries(fields)) {
            if (key in filter) filter[key] = value;
          }
          checkpoint = next;
          await assertActive();
          failureDisposition = 'retryable';
        },
        remoteEffect: async (run) => {
          await assertActive();
          const previousFailureDisposition = failureDisposition;
          failureDisposition = 'unknown';
          const result = await MongoSandboxInstance.updateOne(filter, {
            $set: {
              'operation.failureDisposition': 'unknown',
              'operation.effectState': 'pending',
              'operation.updatedAt': new Date()
            }
          });
          if (result.matchedCount !== 1) throw new SandboxOperationConflict();
          await assertActive();
          try {
            const value = await run();
            // Persist only the returned effect receipt, even after lease loss; never grant ownership.
            const receipt = await MongoSandboxInstance.updateOne(
              { ...filter, 'operation.checkpoint': checkpoint, 'operation.effectState': 'pending' },
              { $set: { 'operation.effectState': 'completed', 'operation.updatedAt': new Date() } }
            );
            if (receipt.matchedCount !== 1) throw new SandboxOperationConflict();
            return value;
          } catch (error) {
            if (
              action === 'ensure' &&
              checkpoint === 'volume_ensure' &&
              error instanceof VolumeManagerAuthRejectedBeforeEffectError
            ) {
              failureDisposition = previousFailureDisposition;
            }
            throw error;
          }
        },
        remove: async () => {
          await assertActive();
          const result = await MongoSandboxInstance.deleteOne(filter);
          if (result.deletedCount !== 1) throw new SandboxOperationConflict();
        }
      };

      try {
        await run(operation);
      } catch (error) {
        try {
          await assertActive();
          await MongoSandboxInstance.updateOne(filter, {
            $set: {
              status:
                action === 'delete'
                  ? 'deleting'
                  : action === 'archive'
                    ? 'archiving'
                    : action === 'restore'
                      ? 'restoring'
                      : 'failed',
              ...(reservesCapacity &&
              !existingProviderRisk &&
              failureDisposition === 'retryable' &&
              ['pending', 'volume_ensure', 'provider_ensure'].includes(checkpoint)
                ? { capacityReserved: false }
                : {}),
              'operation.updatedAt': new Date(),
              'operation.failureDisposition': failureDisposition,
              'operation.error':
                error instanceof SandboxVolumeConfigurationError
                  ? { code: error.code, message: error.message }
                  : {
                      code:
                        action === 'ensure' ? 'sandbox_unavailable' : `sandbox_${action}_failed`,
                      message: `Sandbox ${action} failed at ${checkpoint}`
                    }
            }
          });
        } catch (stateError) {
          if (!(stateError instanceof SandboxOperationConflict)) {
            logger.warn('Failed to persist Sandbox operation failure', { sandboxId });
          }
        }
        throw error;
      }
    },
    {
      priority: options.priority,
      waitMs:
        options.priority === 'interactive' ? 8_000 : options.priority === 'agent' ? 125_000 : 45_000
    }
  );
};

export const recoverSandboxOperationCheckpoint = async (
  options: {
    provider: SandboxProviderType;
    sandboxId: string;
    operationId: string;
    assertAuthorized?: () => Promise<void>;
  },
  inspect: (instance: SandboxInstanceSchemaType) => Promise<SandboxOperationDiagnosis>
) =>
  withSandboxLease(`sandbox:lease:${options.provider}:${options.sandboxId}`, async (lease) => {
    await options.assertAuthorized?.();
    const instance = await MongoSandboxInstance.findOne({
      provider: options.provider,
      sandboxId: options.sandboxId
    }).lean();
    if (!instance?.operation || instance.operation.id !== options.operationId) {
      throw new SandboxOperationConflict('Recovery requires the exact current operationId');
    }
    await lease.assertOwned();
    const diagnosis = await inspect(instance);
    const preEffect = diagnosis.code === 'pre_effect_retry_confirmed';
    if (
      !preEffect &&
      diagnosis.code !== 'provider_stop_confirmed' &&
      diagnosis.code !== 'provider_release_confirmed' &&
      diagnosis.code !== 'provider_delete_confirmed'
    ) {
      throw new SandboxOperationConflict(diagnosis.code);
    }
    await lease.assertOwned();
    await options.assertAuthorized?.();
    const stopped = diagnosis.code === 'provider_stop_confirmed';
    const released = diagnosis.code === 'provider_release_confirmed';
    const now = new Date();
    const result = await MongoSandboxInstance.updateOne(
      {
        ...getInstanceBinding(instance, true),
        status: instance.status,
        deleteTime: instance.deleteTime ?? null,
        capacityReserved: instance.capacityReserved ?? { $exists: false },
        // Keep the literal first so Mongoose cannot reorder the persisted operation snapshot.
        $expr: { $eq: [{ $literal: instance.operation }, '$operation'] }
      },
      {
        $set: {
          status: preEffect ? 'failed' : stopped || released ? 'stopped' : 'deleting',
          ...(!preEffect ? { capacityReserved: false } : {}),
          ...(released ||
          (stopped &&
            instance.provider === 'opensandbox' &&
            instance.storage?.volumeManager?.ensured &&
            diagnosis.remote === null)
            ? { releasedAt: now }
            : {}),
          'operation.id': lease.token,
          'operation.recoveredFromOperationId': instance.operation.id,
          'operation.checkpoint': preEffect
            ? instance.operation.checkpoint
            : stopped
              ? 'provider_stopped'
              : released
                ? 'provider_released'
                : 'provider_deleted',
          'operation.failureDisposition': 'retryable',
          'operation.updatedAt': now,
          'operation.recoveredAt': now,
          ...(preEffect
            ? {
                'operation.error': {
                  code: 'sandbox_operation_interrupted',
                  message: 'Operation interrupted before provider dispatch; resources retained'
                }
              }
            : !stopped && !released
              ? {
                  'operation.error': {
                    code: 'sandbox_cleanup_pending',
                    message: 'Provider deletion confirmed; volume cleanup remains'
                  }
                }
              : {})
        },
        ...(stopped || released ? { $unset: { 'operation.error': 1 } } : {})
      }
    );
    if (result.matchedCount !== 1) throw new SandboxOperationConflict();
    return diagnosis;
  });
