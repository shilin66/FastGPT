import {
  SandboxStatusEnum,
  SANDBOX_SUSPEND_MINUTES
} from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { env } from '../../../env';
import { MongoSandboxInstance } from './schema';
import {
  createSandbox,
  OpenSandboxAdapter,
  type ExecuteResult,
  type ISandbox,
  type ResourceLimits,
  type OpenSandboxConfigType
} from '@fastgpt-sdk/sandbox-adapter';
import {
  getOpenSandboxConnectionConfig,
  getSealosConnectionConfig,
  buildOpenSandboxCreateConfig,
  getVolumeManagerServiceConfig,
  prepareVolumeManagerConfig,
  getVolumeManagerConfig,
  deleteSessionVolume,
  type VolumeManagerResult
} from './config';
import { getLogger, LogCategories } from '../../../common/logger';
import { setCron } from '../../../common/system/cron';
import { checkTimerLock } from '../../../common/system/timerLock/utils';
import { subMinutes } from 'date-fns';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { recoverSandboxOperationCheckpoint, runSandboxOperation } from './operation';
import { SandboxOperationConflict } from './lease';
import { withSandboxLease } from './lease';
import { resolveAppSandboxIdentity } from './identity';
import { resolveSandboxWorkspacePath } from './workspace';
import { getSandboxCapacityType } from './capacity';
import type { SandboxIdentity } from '@fastgpt/global/core/ai/sandbox/type';
import {
  SandboxProviderSchema,
  type SandboxProviderType,
  type SandboxOperationDiagnosis,
  type SandboxInstanceSchemaType
} from './type';
const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

const isProviderNotFound = (error: unknown): boolean => {
  const visited = new Set<object>();
  while (error && typeof error === 'object' && !visited.has(error)) {
    visited.add(error);
    if (
      ('status' in error && error.status === 404) ||
      ('statusCode' in error && error.statusCode === 404) ||
      ('code' in error && error.code === 'SANDBOX_NOT_FOUND')
    ) {
      return true;
    }
    if (
      'response' in error &&
      error.response &&
      typeof error.response === 'object' &&
      'status' in error.response &&
      error.response.status === 404
    ) {
      return true;
    }
    error = 'cause' in error ? error.cause : undefined;
  }
  return false;
};

type UnionIdType = {
  appId: string;
  userId: string;
  chatId: string;
};

type SandboxClientIdentity = SandboxIdentity &
  Partial<Pick<SandboxInstanceSchemaType, 'teamId' | 'ownerTmbId' | 'runtimeUserId' | 'sessionId'>>;

export class SandboxClient {
  private appId?: string;
  private userId?: string;
  private chatId?: string;
  private sandboxId: string;
  private readonly providerName: SandboxProviderType;
  private providerInstance?: ISandbox;

  constructor(
    private readonly props: {
      sandboxId: string;
      appId?: string;
      userId?: string;
      chatId?: string;
    },
    private readonly opts: {
      resourceLimits?: ResourceLimits;
      vmConfig?: VolumeManagerResult | undefined;
      createConfig?: OpenSandboxConfigType;
      provider?: SandboxProviderType;
      existingOnly?: boolean;
      expectedInstance?: SandboxInstanceSchemaType;
      identity?: SandboxClientIdentity;
      workspaceRoot?: string;
    }
  ) {
    this.sandboxId = props.sandboxId;
    this.appId = props.appId;
    this.userId = props.userId;
    this.chatId = props.chatId;

    const providerName = opts.provider ?? env.AGENT_SANDBOX_PROVIDER;
    if (!providerName) {
      throw new Error(
        'AGENT_SANDBOX_PROVIDER is not configured. Please set it in your environment variables.'
      );
    }
    this.providerName = SandboxProviderSchema.parse(providerName);
    if (opts.workspaceRoot !== undefined) {
      opts.workspaceRoot = resolveSandboxWorkspacePath({
        workspaceRoot: opts.workspaceRoot,
        path: '.'
      });
    }
  }

  get provider(): ISandbox {
    this.providerInstance ??= this.createProvider();
    return this.providerInstance;
  }

  private createProvider(): ISandbox {
    const providerName = this.providerName;

    if (providerName === 'sealosdevbox') {
      const config = getSealosConnectionConfig(this.sandboxId);
      return createSandbox('sealosdevbox', config, undefined);
    } else if (providerName === 'opensandbox') {
      // volumes always come from vmConfig (ensures PVC binding is correct);
      // custom createConfig takes priority for image/entrypoint/env/metadata
      return createSandbox(
        'opensandbox',
        getOpenSandboxConnectionConfig({ sessionId: this.sandboxId }),
        this.opts.existingOnly
          ? undefined
          : buildOpenSandboxCreateConfig({
              resourceLimits: this.opts.resourceLimits,
              volumes: this.opts.vmConfig?.volumes,
              createConfig: this.opts.createConfig
            })
      );
    } else if (providerName === 'e2b') {
      if (!env.AGENT_SANDBOX_E2B_API_KEY) {
        throw new Error('AGENT_SANDBOX_E2B_API_KEY required');
      }
      return createSandbox('e2b', {
        apiKey: env.AGENT_SANDBOX_E2B_API_KEY,
        sandboxId: this.sandboxId
      });
    } else {
      throw new Error(`Unsupported sandbox provider: ${providerName}`);
    }
  }

  async ensureAvailable() {
    if (this.opts.existingOnly) {
      throw new Error('An existing-only Sandbox client cannot ensure or create a workspace');
    }
    getVolumeManagerServiceConfig();
    const capacityType = getSandboxCapacityType({
      sourceType: this.opts.identity?.sourceType,
      metadata: this.opts.createConfig?.metadata
    });
    await runSandboxOperation(
      {
        provider: this.providerName,
        sandboxId: this.sandboxId,
        action: 'ensure',
        insert: {
          ...this.opts.identity,
          ...(this.opts.workspaceRoot || capacityType
            ? {
                metadata: {
                  ...(this.opts.workspaceRoot ? { workspaceRoot: this.opts.workspaceRoot } : {}),
                  ...(capacityType ? { sandboxType: capacityType } : {})
                }
              }
            : {}),
          ...(this.appId ? { appId: this.appId } : {}),
          ...(this.userId ? { userId: this.userId } : {}),
          ...(this.chatId ? { chatId: this.chatId } : {}),
          ...(this.opts?.resourceLimits && {
            limit: {
              cpuCount: this.opts?.resourceLimits?.cpuCount,
              memoryMiB: this.opts?.resourceLimits?.memoryMiB,
              diskGiB: this.opts?.resourceLimits?.diskGiB
            }
          }),
          createdAt: new Date()
        }
      },
      async (operation) => {
        if (
          this.opts.workspaceRoot &&
          operation.previous?.metadata?.workspaceRoot &&
          operation.previous.metadata.workspaceRoot !== this.opts.workspaceRoot
        ) {
          throw new Error('Sandbox workspace root does not match the existing instance');
        }
        const preparedVolume = prepareVolumeManagerConfig({
          sandboxId: this.sandboxId,
          previous: operation.previous
        });
        await operation.checkpoint(
          'volume_ensure',
          preparedVolume ? { storage: preparedVolume.storage } : {}
        );
        this.opts.vmConfig = preparedVolume
          ? await operation.remoteEffect(() =>
              getVolumeManagerConfig(this.sandboxId, preparedVolume)
            )
          : undefined;
        await operation.checkpoint('provider_ensure', {
          ...(this.opts.vmConfig ? { storage: this.opts.vmConfig.storage } : {}),
          'metadata.volumeEnabled': !!this.opts.vmConfig
        });
        this.providerInstance = undefined;
        const provider = this.provider;
        await operation.remoteEffect(() => provider.ensureRunning());
        await operation.checkpoint('ready', {
          status: SandboxStatusEnum.running,
          lastActiveAt: new Date(),
          ...(this.provider.id ? { 'metadata.providerSandboxId': this.provider.id } : {})
        });
      }
    );
  }

  async maintainWorkspace({
    instance,
    createConfig,
    assertActive,
    checkpoint,
    remoteEffect,
    maintain
  }: {
    instance: SandboxInstanceSchemaType;
    createConfig: OpenSandboxConfigType;
    assertActive: () => Promise<void>;
    checkpoint: (phase: string, fields?: Record<string, unknown>) => Promise<void>;
    remoteEffect: <T>(run: () => Promise<T>) => Promise<T>;
    maintain: (provider: ISandbox) => Promise<void>;
  }): Promise<ISandbox> {
    if (
      this.providerName !== 'opensandbox' ||
      instance.provider !== 'opensandbox' ||
      instance.sandboxId !== this.sandboxId ||
      !instance.metadata?.providerSandboxId
    ) {
      throw new Error('workspace_reset_provider_unsupported');
    }
    const originalProviderId = instance.metadata.providerSandboxId;
    return withSandboxLease(
      `sandbox:lease:${this.providerName}:${this.sandboxId}`,
      async (lease) => {
        const assertOwned = async () => {
          await lease.assertOwned();
          await assertActive();
        };
        const connectExisting = async () => {
          const provider = createSandbox(
            'opensandbox',
            getOpenSandboxConnectionConfig({ sessionId: this.sandboxId })
          );
          if (!(provider instanceof OpenSandboxAdapter))
            throw new Error('workspace_reset_provider_unsupported');
          await assertOwned();
          const exists = await provider.connectExisting();
          return { provider, exists };
        };
        const old = await connectExisting();
        if (!old.exists || (await old.provider.getInfo())?.id !== originalProviderId)
          throw new Error('workspace_provider_changed');
        await checkpoint('provider_delete');
        await assertOwned();
        await remoteEffect(() => old.provider.delete());
        const deleted = await connectExisting();
        if (deleted.exists || (await deleted.provider.inspectExisting(originalProviderId)))
          throw new Error('workspace_provider_deletion_unconfirmed');
        await checkpoint('provider_deleted');
        const maintenance = createSandbox(
          'opensandbox',
          getOpenSandboxConnectionConfig({ sessionId: this.sandboxId }),
          {
            ...createConfig,
            entrypoint: ['/bin/sh', '-c', 'exec sleep infinity'],
            env: {},
            metadata: { sessionId: this.sandboxId, purpose: 'workspace-maintenance' }
          }
        );
        await assertOwned();
        await remoteEffect(() => maintenance.create());
        const maintenanceInfo = await maintenance.getInfo();
        if (!maintenanceInfo || maintenanceInfo.status.state !== 'Running')
          throw new Error('workspace_maintenance_unavailable');
        await checkpoint('maintenance_ready', { 'metadata.providerSandboxId': maintenanceInfo.id });
        await assertOwned();
        await maintain(maintenance);
        await assertOwned();
        await checkpoint('maintenance_delete');
        await remoteEffect(() => maintenance.delete());
        const maintenanceDeleted = await connectExisting();
        if (
          maintenanceDeleted.exists ||
          (await maintenanceDeleted.provider.inspectExisting(maintenanceInfo.id))
        )
          throw new Error('workspace_maintenance_deletion_unconfirmed');
        await checkpoint('maintenance_deleted');
        const editor = createSandbox(
          'opensandbox',
          getOpenSandboxConnectionConfig({ sessionId: this.sandboxId }),
          createConfig
        );
        await assertOwned();
        await remoteEffect(() => editor.create());
        const editorInfo = await editor.getInfo();
        if (!editorInfo || editorInfo.status.state !== 'Running')
          throw new Error('workspace_editor_unavailable');
        await checkpoint('editor_ready', { 'metadata.providerSandboxId': editorInfo.id });
        this.providerInstance = editor;
        return editor;
      }
    );
  }

  async exec(command: string, timeout?: number): Promise<ExecuteResult> {
    try {
      await this.ensureAvailable();
    } catch (err) {
      logger.error('Failed to ensure sandbox available', { sandboxId: this.sandboxId, error: err });
      throw err;
    }

    return await this.provider
      .execute(command, {
        timeoutMs: timeout ? timeout * 1000 : undefined
      })
      .catch((err) => {
        logger.error('Failed to execute sandbox', { sandboxId: this.sandboxId, error: err });
        throw err;
      });
  }

  async delete({ assertAuthorized }: { assertAuthorized?: () => Promise<void> } = {}) {
    await runSandboxOperation(
      {
        provider: this.providerName,
        sandboxId: this.sandboxId,
        action: 'delete',
        expectedInstance: this.opts.expectedInstance,
        assertAuthorized
      },
      async (operation) => {
        const verifyCapacity =
          !!getSandboxCapacityType(operation.previous ?? {}) ||
          operation.previous?.capacityReserved === true;
        const checkpoint =
          operation.previous?.operation?.type === 'delete'
            ? operation.previous.operation.checkpoint
            : undefined;
        const preparedVolume =
          checkpoint !== 'volume_deleted'
            ? prepareVolumeManagerConfig({
                sandboxId: this.sandboxId,
                previous: operation.previous,
                action: 'delete'
              })
            : undefined;
        if (checkpoint !== 'provider_deleted' && checkpoint !== 'volume_deleted') {
          await operation.checkpoint('provider_delete');
          const exists = await this.connectExistingProvider();
          const providerId = this.provider.id ?? operation.previous?.metadata?.providerSandboxId;
          await operation.assertActive();
          if (exists) {
            await operation.checkpoint('provider_delete', {
              ...(this.provider.id ? { 'operation.providerSandboxId': this.provider.id } : {})
            });
            try {
              await operation.remoteEffect(() => this.provider.delete());
            } catch (error) {
              if (!isProviderNotFound(error)) throw error;
            }
          }
          await operation.assertActive();
          if (verifyCapacity) {
            await this.confirmCapacityRelease(
              providerId,
              'delete',
              operation.previous?.capacityReserved === false && !exists
            );
          }
          await operation.checkpoint(
            'provider_deleted',
            verifyCapacity ? { capacityReserved: false } : {}
          );
        } else if (verifyCapacity && operation.previous?.capacityReserved !== false) {
          await this.confirmCapacityRelease(
            operation.previous?.operation?.providerSandboxId ??
              operation.previous?.metadata?.providerSandboxId,
            'delete'
          );
          await operation.checkpoint(checkpoint, { capacityReserved: false });
        }
        if (checkpoint !== 'volume_deleted') {
          await operation.assertActive();
          // The provider_deleted fence forbids resurrection; repeating this exact volume DELETE is safe.
          if (preparedVolume) await deleteSessionVolume(this.sandboxId, preparedVolume);
          await operation.checkpoint('volume_deleted');
        }
        await operation.remove();
      }
    );
  }

  async stop({ inactiveBefore }: { inactiveBefore?: Date } = {}) {
    await runSandboxOperation(
      {
        provider: this.providerName,
        sandboxId: this.sandboxId,
        action: 'stop',
        expectedInstance: this.opts.expectedInstance,
        shouldRun: inactiveBefore
          ? (doc) => doc.status === SandboxStatusEnum.running && doc.lastActiveAt < inactiveBefore
          : undefined
      },
      async (operation) => {
        const verifyCapacity =
          !!getSandboxCapacityType(operation.previous ?? {}) ||
          operation.previous?.capacityReserved === true;
        await operation.checkpoint('provider_stop');
        const exists = await this.connectExistingProvider();
        const providerId = this.provider.id ?? operation.previous?.metadata?.providerSandboxId;
        await operation.assertActive();
        if (exists) {
          await operation.checkpoint('provider_stop', {
            ...(this.provider.id ? { 'operation.providerSandboxId': this.provider.id } : {})
          });
          await operation.remoteEffect(() => this.provider.stop());
        }
        await operation.assertActive();
        if (verifyCapacity) {
          await this.confirmCapacityRelease(
            providerId,
            'stop',
            operation.previous?.capacityReserved === false && !exists
          );
        }
        await operation.checkpoint('provider_stopped', {
          status: SandboxStatusEnum.stopped,
          ...(verifyCapacity ? { capacityReserved: false } : {})
        });
      }
    );
  }

  private async confirmCapacityRelease(
    providerId: string | undefined,
    action: 'stop' | 'delete',
    knownAbsent = false
  ) {
    if (!(this.provider instanceof OpenSandboxAdapter)) {
      throw new Error('sandbox_capacity_release_verification_unsupported');
    }
    if (!providerId) {
      if (knownAbsent) return;
      throw new SandboxOperationConflict(
        'Sandbox capacity release requires a persisted provider target'
      );
    }
    const remote = await this.provider.inspectExisting(providerId);
    if (
      remote &&
      (remote.id !== providerId || action === 'delete' || remote.status.state !== 'Stopped')
    ) {
      throw new SandboxOperationConflict(
        'Sandbox capacity release requires a confirmed provider terminal state'
      );
    }
  }

  private async connectExistingProvider(): Promise<boolean> {
    if (this.providerName === 'e2b') {
      throw new Error('Sandbox provider e2b does not support non-creating lifecycle operations');
    }
    if (this.provider instanceof OpenSandboxAdapter) {
      const exists = await this.provider.connectExisting();
      const expectedId = this.opts.expectedInstance?.metadata?.providerSandboxId;
      if (expectedId && exists && expectedId !== this.provider.id) {
        throw new SandboxOperationConflict('Sandbox provider identity changed');
      }
      if (expectedId && !exists && (await this.provider.inspectExisting(expectedId))) {
        throw new SandboxOperationConflict('Sandbox lookup did not resolve the persisted provider');
      }
      return exists;
    }
    if (this.providerName === 'sealosdevbox') return true;
    throw new Error(
      `Sandbox provider ${this.providerName} does not support non-creating lifecycle operations`
    );
  }
}

export const getExistingSandboxClient = (doc: SandboxInstanceSchemaType) =>
  new SandboxClient(
    { sandboxId: doc.sandboxId },
    { provider: doc.provider, existingOnly: true, expectedInstance: doc }
  );

const diagnoseInstanceOperation = async (
  instance: SandboxInstanceSchemaType
): Promise<SandboxOperationDiagnosis> => {
  const result = {
    provider: instance.provider,
    sandboxId: instance.sandboxId,
    status: instance.status,
    operation: instance.operation
  };
  const operation = instance.operation;
  if (!operation)
    return {
      ...result,
      code: instance.status === 'failed' ? 'unclassified_failure' : 'not_required'
    };
  if (
    (instance.status === 'running' && ['ready', 'completed'].includes(operation.checkpoint)) ||
    (instance.status === 'stopped' && operation.checkpoint === 'provider_stopped')
  ) {
    return { ...result, code: 'not_required' };
  }
  const unknownCreate = ['provision', 'start'].includes(operation.type);
  if (
    instance.provider === 'opensandbox' &&
    unknownCreate &&
    instance.status === 'provisioning' &&
    !instance.deleteTime &&
    !operation.error &&
    operation.effectState === 'idle' &&
    operation.failureDisposition === 'retryable' &&
    ['pending', 'volume_ensure', 'provider_ensure'].includes(operation.checkpoint)
  )
    return { ...result, code: 'pre_effect_retry_confirmed' };
  const stopping =
    operation.type === 'stop' &&
    operation.checkpoint === 'provider_stop' &&
    ['stopping', 'failed'].includes(instance.status);
  const deleting =
    operation.type === 'delete' &&
    operation.checkpoint === 'provider_delete' &&
    instance.status === 'deleting';
  if (!unknownCreate && !stopping && !deleting) return { ...result, code: 'unsupported_operation' };
  if (!unknownCreate && !operation.providerSandboxId)
    return { ...result, code: 'provider_id_missing' };
  if (instance.provider !== 'opensandbox') return { ...result, code: 'unsupported_operation' };
  try {
    const provider = getExistingSandboxClient(instance).provider;
    if (!(provider instanceof OpenSandboxAdapter))
      return { ...result, code: 'unsupported_operation' };
    const remote = await provider.inspectExisting(operation.providerSandboxId);
    if (unknownCreate) return { ...result, remote, code: 'unknown_create_result' };
    if (remote && remote.id !== operation.providerSandboxId) {
      return { ...result, remote, code: 'remote_outcome_unknown' };
    }
    if (
      stopping &&
      (remote === null ||
        (remote.status.state === 'Stopped' && operation.effectState === 'completed'))
    )
      return { ...result, remote, code: 'provider_stop_confirmed' };
    if (deleting && remote === null)
      return { ...result, remote, code: 'provider_delete_confirmed' };
    return { ...result, remote, code: 'remote_outcome_unknown' };
  } catch {
    return { ...result, code: 'provider_lookup_failed' };
  }
};

export const diagnoseSandboxOperation = async ({
  provider,
  sandboxId,
  operationId
}: {
  provider: SandboxProviderType;
  sandboxId: string;
  operationId?: string;
}) => {
  const instance = await MongoSandboxInstance.findOne({ provider, sandboxId }).lean();
  if (!instance || (operationId && operationId !== instance.operation?.id)) {
    throw new SandboxOperationConflict('Diagnosis requires the current Sandbox operation');
  }
  return diagnoseInstanceOperation(instance);
};

export const recoverSandboxOperation = (options: {
  provider: SandboxProviderType;
  sandboxId: string;
  operationId: string;
  assertAuthorized?: () => Promise<void>;
}) => recoverSandboxOperationCheckpoint(options, diagnoseInstanceOperation);

export const getSandboxClient = async (
  props:
    | {
        sandboxId: string;
      }
    | UnionIdType,
  opts: {
    resourceLimits?: ResourceLimits;
    createConfig?: OpenSandboxConfigType;
    identity?: SandboxClientIdentity;
    workspaceRoot?: string;
  } = {}
) => {
  const { sandboxId, identity } =
    'sandboxId' in props
      ? { sandboxId: props.sandboxId, identity: opts.identity }
      : await resolveAppSandboxIdentity(props);
  const sandbox = new SandboxClient(
    { ...props, sandboxId },
    { ...opts, identity: identity ? { ...opts.identity, ...identity } : undefined }
  );
  await sandbox.ensureAvailable();
  return sandbox;
};

// ==== Delete Sandboxes ====
const findAppRuntimeSandboxes = async ({
  appId,
  chatIds
}: {
  appId: string;
  chatIds?: string[];
}) => {
  const instances = await MongoSandboxInstance.find({
    $or: [
      {
        sourceType: 'appRuntime',
        sourceId: appId,
        ...(chatIds ? { sessionId: { $in: chatIds } } : {})
      },
      {
        sourceType: { $exists: false },
        sourceId: { $exists: false },
        appId,
        ...(chatIds ? { chatId: { $in: chatIds } } : {})
      }
    ]
  }).lean();
  return instances.filter((doc) => {
    if (
      doc.metadata?.skillId !== undefined ||
      (doc.metadata?.sandboxType !== undefined &&
        doc.metadata.sandboxType !== SandboxTypeEnum.sessionRuntime)
    )
      return false;
    if (doc.sourceType === 'appRuntime') {
      return (
        !!doc.runtimeUserId &&
        !!doc.sessionId &&
        (doc.appId == null || doc.appId === appId) &&
        (doc.userId == null || doc.userId === doc.runtimeUserId) &&
        (doc.chatId == null || doc.chatId === doc.sessionId)
      );
    }
    return (
      doc.runtimeUserId === undefined &&
      doc.sessionId === undefined &&
      !!doc.userId &&
      !!doc.chatId &&
      doc.chatId !== 'edit-debug'
    );
  });
};

export const deleteSandboxesByChatIds = async ({
  appId,
  chatIds
}: {
  appId: string;
  chatIds: string[];
}) => {
  const instances = await findAppRuntimeSandboxes({ appId, chatIds });
  if (!instances.length) return;

  await Promise.allSettled(
    instances.map(async (doc) => {
      const client = getExistingSandboxClient(doc);
      await client.delete().catch((err) => {
        logger.error('Failed to delete sandbox', { sandboxId: doc.sandboxId, error: err });
        return Promise.reject(err);
      });
    })
  );
};
export const deleteSandboxesByAppId = async (appId: string) => {
  const instances = await findAppRuntimeSandboxes({ appId });
  if (!instances.length) return;

  await Promise.allSettled(
    instances.map(async (doc) => {
      const client = getExistingSandboxClient(doc);
      await client.delete().catch((err) => {
        logger.error('Failed to delete sandbox', { sandboxId: doc.sandboxId, error: err });
      });
    })
  );
};

// 5 分钟检查一遍，暂停
export const cronJob = async () => {
  setCron('*/5 * * * *', async () => {
    if (!(await checkTimerLock({ timerId: 'sandboxIdleStop', lockMinuted: 4 }))) return;
    const inactiveBefore = subMinutes(new Date(), SANDBOX_SUSPEND_MINUTES);
    const instances = await MongoSandboxInstance.find({
      status: SandboxStatusEnum.running,
      lastActiveAt: { $lt: inactiveBefore }
    }).lean();
    if (!instances.length) return;

    logger.info('Found running sandboxes inactive > 5 min', { count: instances.length });

    await batchRun(instances, async (doc) => {
      const client = getExistingSandboxClient(doc);
      await client.stop({ inactiveBefore }).catch((err) => {
        logger.error('Failed to stop sandbox', { sandboxId: doc.sandboxId, error: err });
      });
    });
  });
};
