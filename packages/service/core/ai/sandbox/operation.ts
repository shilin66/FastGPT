import { MongoSandboxInstance } from './schema';
import { SandboxOperationConflict, withSandboxLease, type SandboxLease } from './lease';
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

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);
type OperationAction = 'ensure' | 'stop' | 'delete';

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
        status: { $in: ['provisioning', 'stopping', 'deleting'] }
      },
      { $max: { 'operation.heartbeatAt': new Date() } }
    );
    return result.matchedCount === 1;
  });
};

const canClaimOperation = (instance: SandboxInstanceSchemaType, action: OperationAction) => {
  const { status, operation } = instance;
  if (isSandboxPublishRejected(instance)) return true;
  if (!operation) return status === 'running' || status === 'stopped';
  if (operation.type === 'resetWorkspace' && operation.checkpoint !== 'ready') return false;
  if (status === 'failed' && operation.error) return operation.failureDisposition === 'retryable';
  if (status === 'deleting') {
    return (
      action === 'delete' &&
      operation.type === 'delete' &&
      !!operation.error &&
      operation.failureDisposition === 'retryable'
    );
  }
  if (operation.error || operation.failureDisposition === 'unknown') return false;
  const completedInitialization =
    (['provision', 'start', 'editInitialize', 'publish', 'resetWorkspace', 'debug'].includes(
      operation.type
    ) &&
      operation.checkpoint === 'ready') ||
    (operation.type === 'deploy' && operation.checkpoint === 'completed');
  if (status === 'stopped') {
    // Old stop writers changed only status; permit resume without extending cleanup ownership.
    return (
      (operation.type === 'stop' && operation.checkpoint === 'provider_stopped') ||
      (action === 'ensure' && completedInitialization)
    );
  }
  return status === 'running' && completedInitialization;
};

const getInstanceBinding = (instance: SandboxInstanceSchemaType, includeStorage = false) => ({
  _id: instance._id,
  provider: instance.provider,
  sandboxId: instance.sandboxId,
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
        'appId',
        'userId',
        'chatId',
        'workspaceGeneration'
      ] as const
    ).map((key) => [key, instance[key] ?? null])
  )
});

type SandboxOperation = {
  previous: SandboxInstanceSchemaType | null;
  assertActive: () => Promise<void>;
  checkpoint: (checkpoint: string, fields?: Record<string, unknown>) => Promise<void>;
  remoteEffect: <T>(run: () => Promise<T>) => Promise<T>;
  remove: () => Promise<void>;
};

export const runSandboxActivity = async <T>(
  {
    provider,
    sandboxId,
    expectedInstance
  }: {
    provider: string;
    sandboxId: string;
    expectedInstance?: SandboxInstanceSchemaType;
  },
  run: () => Promise<T>
): Promise<T> =>
  withSandboxLease(`sandbox:lease:${provider}:${sandboxId}`, async (lease) => {
    const instance = await MongoSandboxInstance.findOne({ provider, sandboxId }).lean();
    if (!instance || instance.status !== 'running' || instance.deleteTime) {
      throw new SandboxOperationConflict('Sandbox is not available for file or tool activity');
    }
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
  });

export const runSandboxOperation = async (
  options: {
    provider: SandboxProviderType;
    sandboxId: string;
    action: OperationAction;
    insert?: Omit<Partial<SandboxInstanceSchemaType>, 'limit'> & {
      limit?: Partial<NonNullable<SandboxInstanceSchemaType['limit']>>;
    };
    shouldRun?: (doc: SandboxInstanceSchemaType) => boolean;
    expectedInstance?: SandboxInstanceSchemaType;
    assertAuthorized?: () => Promise<void>;
  },
  run: (operation: SandboxOperation) => Promise<void>
) => {
  const { provider, sandboxId, action } = options;
  await withSandboxLease(`sandbox:lease:${provider}:${sandboxId}`, async (lease) => {
    await options.assertAuthorized?.();
    const previous = await MongoSandboxInstance.findOne({ provider, sandboxId }).lean();
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
    if (previous && ['archived', 'archiving', 'restoring'].includes(previous.status)) {
      throw new SandboxOperationConflict(
        'Sandbox archive/restore lifecycle is not supported; existing resources are retained'
      );
    }
    if (previous && options.shouldRun && !options.shouldRun(previous)) return;
    if (action !== 'delete' && (previous?.status === 'deleting' || previous?.deleteTime)) {
      throw new SandboxOperationConflict();
    }
    if (previous && !canClaimOperation(previous, action)) {
      throw new SandboxOperationConflict(
        'An unfinished Sandbox operation requires explicit recovery; lease expiry does not permit takeover'
      );
    }

    const capacityType =
      getSandboxCapacityType(previous ?? {}) ?? getSandboxCapacityType(options.insert ?? {});
    if ((capacityType || previous?.capacityReserved) && provider !== 'opensandbox') {
      throw new Error('sandbox_capacity_provider_unsupported');
    }
    const existingProviderRisk = !!previous && hasSandboxCapacityReservation(previous);
    const inheritedReservation =
      existingProviderRisk && getSandboxCapacityType(previous ?? {}) === capacityType;
    const reservesCapacity = action === 'ensure' && !!capacityType;

    const now = new Date();
    let checkpoint =
      action === 'delete' && previous?.operation?.type === 'delete'
        ? previous.operation.checkpoint
        : 'pending';
    let failureDisposition: 'retryable' | 'unknown' = 'retryable';
    const state = {
      status: action === 'ensure' ? 'provisioning' : action === 'stop' ? 'stopping' : 'deleting',
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
        effectState: 'idle'
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

    const filter = {
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
            status: action === 'delete' ? 'deleting' : 'failed',
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
                    code: action === 'ensure' ? 'sandbox_unavailable' : `sandbox_${action}_failed`,
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
  });
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
      diagnosis.code !== 'provider_delete_confirmed'
    ) {
      throw new SandboxOperationConflict(diagnosis.code);
    }
    await lease.assertOwned();
    await options.assertAuthorized?.();
    const stopped = diagnosis.code === 'provider_stop_confirmed';
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
          status: preEffect ? 'failed' : stopped ? 'stopped' : 'deleting',
          ...(!preEffect ? { capacityReserved: false } : {}),
          'operation.id': lease.token,
          'operation.recoveredFromOperationId': instance.operation.id,
          'operation.checkpoint': preEffect
            ? instance.operation.checkpoint
            : stopped
              ? 'provider_stopped'
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
            : !stopped
              ? {
                  'operation.error': {
                    code: 'sandbox_cleanup_pending',
                    message: 'Provider deletion confirmed; volume cleanup remains'
                  }
                }
              : {})
        },
        ...(stopped ? { $unset: { 'operation.error': 1 } } : {})
      }
    );
    if (result.matchedCount !== 1) throw new SandboxOperationConflict();
    return diagnosis;
  });
