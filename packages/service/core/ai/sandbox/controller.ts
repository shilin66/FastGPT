import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
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
  getSandboxProviderScope,
  getSealosConnectionConfig,
  buildOpenSandboxCreateConfig,
  getVolumeManagerServiceConfig,
  prepareVolumeManagerConfig,
  getVolumeManagerConfig,
  ensureSessionVolume,
  deleteSessionVolume,
  type VolumeManagerResult
} from './config';
import { getLogger, LogCategories } from '../../../common/logger';
import { setCron } from '../../../common/system/cron';
import { checkTimerLock } from '../../../common/system/timerLock/utils';
import { subMinutes } from 'date-fns';
import { batchRun } from '@fastgpt/global/common/system/utils';
import {
  recoverSandboxOperationCheckpoint,
  runSandboxOperation,
  runSandboxActivity,
  getInstanceBinding
} from './operation';
export { runSandboxActivity } from './operation';
import { SandboxBusyBeforeEffectError, SandboxOperationConflict } from './lease';
import { withSandboxLease } from './lease';
import { resolveAppSandboxIdentity } from './identity';
import { assertSandboxSourceActive } from './sourceGuard';
import {
  getSandboxWorkspaceRoot,
  resolveSandboxWorkspacePath,
  getSandboxSessionDirectory,
  prepareSandboxSessionDirectory
} from './workspace';
import { getRuntimeSandboxWorkspaceRoot } from '../../agentSkills/sandboxConfig';
import { getSandboxCapacityType } from './capacity';
import { getSandboxOwnershipMetadata } from './display';
import { getLegacySourceChatId } from './ownership';
import { createHash } from 'node:crypto';
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
  Partial<
    Pick<
      SandboxInstanceSchemaType,
      'teamId' | 'ownerTmbId' | 'runtimeUserId' | 'sessionId' | 'sourceChatId' | 'reuseScope'
    >
  >;

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
      sessionDirectory?: string;
      requestTimeoutSeconds?: number;
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

  get workspaceRoot(): string {
    return (
      this.opts.sessionDirectory ??
      this.opts.workspaceRoot ??
      getSandboxWorkspaceRoot(this.provider)
    );
  }

  get id(): string {
    return this.sandboxId;
  }

  get workspaceGeneration(): string | undefined {
    return this.opts.expectedInstance?.workspaceGeneration;
  }

  private createProvider(): ISandbox {
    const providerName = this.providerName;

    if (providerName === 'sealosdevbox') {
      const config = getSealosConnectionConfig(this.sandboxId);
      return createSandbox('sealosdevbox', config, undefined);
    } else if (providerName === 'opensandbox') {
      // volumes always come from vmConfig (ensures PVC binding is correct);
      // custom createConfig takes priority for image/entrypoint/env/metadata
      const createConfig = this.opts.existingOnly
        ? undefined
        : buildOpenSandboxCreateConfig({
            resourceLimits: this.opts.resourceLimits,
            volumes: this.opts.vmConfig?.volumes,
            createConfig: this.opts.createConfig
          });
      const identity = this.opts.identity;
      if (createConfig && identity?.sourceType === 'appRuntime' && this.opts.workspaceRoot) {
        createConfig.env = { ...createConfig.env, FASTGPT_WORKDIR: this.opts.workspaceRoot };
        // Ordinary Agent images may not initialize a workspace through their own entrypoint.
        createConfig.entrypoint ??= [
          '/bin/sh',
          '-c',
          'mkdir -p -- "$FASTGPT_WORKDIR" && exec sleep infinity'
        ];
      }
      if (
        createConfig &&
        env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME === 'docker' &&
        identity?.sourceType &&
        identity.sourceId
      ) {
        createConfig.metadata = {
          ...createConfig.metadata,
          ...getSandboxOwnershipMetadata({
            sourceType: identity.sourceType,
            sourceId: identity.sourceId,
            runtimeUserId: identity.runtimeUserId,
            reuseScope: identity.reuseScope,
            sourceChatId: identity.sourceChatId,
            sessionId: identity.sessionId,
            sandboxId: this.sandboxId
          })
        };
      }
      return createSandbox(
        'opensandbox',
        {
          ...getOpenSandboxConnectionConfig({ sessionId: this.sandboxId }),
          ...(this.opts.requestTimeoutSeconds
            ? { requestTimeoutSeconds: this.opts.requestTimeoutSeconds }
            : {})
        },
        createConfig
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

  async ensureAvailable(priority: 'agent' | 'lifecycle' | 'interactive' = 'lifecycle') {
    if (this.opts.existingOnly) {
      throw new Error('An existing-only Sandbox client cannot ensure or create a workspace');
    }
    getVolumeManagerServiceConfig();
    if (this.opts.identity?.sourceType) {
      await assertSandboxSourceActive(this.opts.identity);
    }
    let lifecycle = await MongoSandboxInstance.findOne({
      provider: this.providerName,
      sandboxId: this.sandboxId
    }).lean();
    if (
      lifecycle?.providerScope &&
      lifecycle.providerScope !== getSandboxProviderScope(lifecycle.provider)
    )
      throw new SandboxOperationConflict('Sandbox provider deployment changed');
    if (
      lifecycle?.reuseScope === 'user' &&
      lifecycle.provider === 'opensandbox' &&
      lifecycle.metadata?.image &&
      ['running', 'stopped'].includes(lifecycle.status)
    ) {
      const desired = buildOpenSandboxCreateConfig({ createConfig: this.opts.createConfig }).image;
      const image = lifecycle.metadata.image;
      if (
        image.repository !== desired.repository ||
        (image.tag ?? 'latest') !== (desired.tag ?? 'latest')
      ) {
        if (!lifecycle.storage?.volumeManager?.ensured)
          throw new Error('sandbox_image_upgrade_requires_persistent_volume');
        const { upgradeSandboxImage } = await import('./archive');
        await upgradeSandboxImage(lifecycle, this.opts.createConfig, async () => {
          await assertSandboxSourceActive(lifecycle!);
        });
        lifecycle = await MongoSandboxInstance.findOne({
          provider: this.providerName,
          sandboxId: this.sandboxId
        }).lean();
        if (!lifecycle) throw new SandboxOperationConflict();
        this.opts.expectedInstance = lifecycle;
        this.providerInstance = undefined;
      }
    }
    if (lifecycle?.status === 'archiving') {
      const { archiveSandboxWorkspace } = await import('./archive');
      await archiveSandboxWorkspace(lifecycle, {
        assertAuthorized: lifecycle.sourceType
          ? async () => {
              await assertSandboxSourceActive(lifecycle!);
            }
          : undefined
      });
      lifecycle = await MongoSandboxInstance.findOne({
        provider: this.providerName,
        sandboxId: this.sandboxId
      }).lean();
    }
    if (lifecycle && ['archived', 'restoring'].includes(lifecycle.status)) {
      const { restoreSandboxWorkspace } = await import('./archive');
      await restoreSandboxWorkspace(
        lifecycle,
        this.opts.createConfig,
        lifecycle.sourceType
          ? async () => {
              await assertSandboxSourceActive(lifecycle!);
            }
          : undefined
      );
      {
        const restored = await MongoSandboxInstance.findOne({
          provider: this.providerName,
          sandboxId: this.sandboxId
        }).lean();
        if (!restored) throw new SandboxOperationConflict();
        this.opts.expectedInstance = restored;
        this.opts.workspaceRoot ??= restored.metadata?.workspaceRoot;
      }
      this.providerInstance = undefined;
    }
    // File browsing may run alongside Agent deployment; avoid replacing its operation with start.
    const selected = this.opts.expectedInstance;
    const latest = selected
      ? await MongoSandboxInstance.findOne({
          _id: selected._id,
          provider: selected.provider,
          sandboxId: selected.sandboxId,
          deleteTime: null
        }).lean()
      : null;
    if (
      latest?.status === SandboxStatusEnum.provisioning &&
      latest.operation?.type === 'deploy' &&
      latest.operation.checkpoint === 'deploying'
    ) {
      // The file request can retry with a fresh authorized instance after deployment.
      throw new SandboxBusyBeforeEffectError();
    }
    if (
      selected?.status === SandboxStatusEnum.provisioning &&
      latest?.status === SandboxStatusEnum.running
    ) {
      // Re-select the now-ready workspace using the file request's authorization scope.
      throw new SandboxBusyBeforeEffectError();
    }
    if (
      selected?.status === SandboxStatusEnum.running &&
      selected.metadata?.providerSandboxId &&
      this.providerName === 'opensandbox'
    ) {
      const current = await MongoSandboxInstance.findOne({
        ...getInstanceBinding(selected, true),
        status: SandboxStatusEnum.running,
        deleteTime: null,
        $or: [
          {
            'operation.type': {
              $in: [
                'provision',
                'start',
                'restore',
                'editInitialize',
                'publish',
                'resetWorkspace',
                'debug'
              ]
            },
            'operation.checkpoint': 'ready'
          },
          { 'operation.type': 'deploy', 'operation.checkpoint': 'completed' }
        ],
        'operation.failureDisposition': { $ne: 'unknown' },
        'operation.error': { $exists: false }
      }).lean();
      if (current) {
        prepareVolumeManagerConfig({ sandboxId: this.sandboxId, previous: current });
        if (await this.connectExistingProvider()) {
          const info = await this.provider.getInfo();
          if (info?.status.state === 'Running') {
            if (info.id !== current.metadata?.providerSandboxId)
              throw new SandboxOperationConflict('Sandbox provider identity changed');
            const fields = {
              ...(!current.providerScope
                ? { providerScope: getSandboxProviderScope(this.providerName) }
                : {}),
              ...(!current.metadata?.image && info.image ? { 'metadata.image': info.image } : {})
            };
            if (Object.keys(fields).length) {
              const result = await MongoSandboxInstance.findOneAndUpdate(
                {
                  ...getInstanceBinding(current, true),
                  status: 'running',
                  deleteTime: null,
                  'operation.id': current.operation?.id
                },
                { $set: fields },
                { new: true }
              ).lean();
              if (!result) throw new SandboxBusyBeforeEffectError();
              this.opts.expectedInstance = result;
            }
            return;
          }
        }
      } else if (
        latest?.status === SandboxStatusEnum.running &&
        latest.operation?.type === 'deploy' &&
        latest.operation.checkpoint === 'completed'
      ) {
        // Deployment may have updated the binding after this file request selected it.
        throw new SandboxBusyBeforeEffectError();
      }
    }
    const capacityType = getSandboxCapacityType({
      sourceType: this.opts.identity?.sourceType,
      provider: this.providerName,
      metadata: this.opts.createConfig?.metadata
    });
    await runSandboxOperation(
      {
        provider: this.providerName,
        sandboxId: this.sandboxId,
        action: 'ensure',
        priority,
        expectedInstance: this.opts.expectedInstance,
        assertAuthorized: this.opts.identity?.sourceType
          ? async () => {
              await assertSandboxSourceActive(this.opts.identity!);
            }
          : undefined,
        insert: {
          ...(this.providerName === 'opensandbox'
            ? { providerScope: getSandboxProviderScope(this.providerName) }
            : {}),
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
          ...(this.chatId &&
          this.opts.identity?.sourceType === 'appRuntime' &&
          this.opts.identity.reuseScope === 'user'
            ? {}
            : this.chatId
              ? { chatId: this.chatId }
              : {}),
          ...(this.opts?.resourceLimits && {
            limit: {
              cpuCount: this.opts?.resourceLimits?.cpuCount,
              memoryMiB: this.opts?.resourceLimits?.memoryMiB,
              diskGiB: this.opts?.resourceLimits?.diskGiB
            }
          }),
          ...(this.opts.identity?.sourceType === 'appRuntime' &&
          this.opts.identity.reuseScope === 'user'
            ? { schemaVersion: 3 }
            : {}),
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
        if (
          this.opts.expectedInstance &&
          !(await this.connectExistingProvider()) &&
          !operation.previous?.releasedAt
        ) {
          throw new SandboxOperationConflict('Selected Sandbox provider no longer exists');
        }
        const preparedVolume = prepareVolumeManagerConfig({
          sandboxId: this.sandboxId,
          previous: operation.previous,
          ...(this.opts.identity?.sourceType === 'appRuntime' &&
          this.opts.identity.reuseScope === 'user' &&
          !operation.previous?.storage
            ? { newGeneration: '0' }
            : {})
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
          'metadata.volumeEnabled': !!this.opts.vmConfig,
          ...(this.opts.workspaceRoot ? { 'metadata.workspaceRoot': this.opts.workspaceRoot } : {})
        });
        this.providerInstance = undefined;
        const provider = this.provider;
        await operation.remoteEffect(() => provider.ensureRunning());
        const info = this.providerName === 'opensandbox' ? await provider.getInfo() : undefined;
        await operation.checkpoint('ready', {
          status: SandboxStatusEnum.running,
          releasedAt: null,
          lastActiveAt: new Date(),
          ...(this.provider.id ? { 'metadata.providerSandboxId': this.provider.id } : {}),
          ...(info?.image ? { 'metadata.image': info.image } : {}),
          ...(this.providerName === 'opensandbox' &&
          (!operation.previous ||
            operation.previous.releasedAt ||
            this.provider.id === operation.previous.metadata?.providerSandboxId)
            ? { providerScope: getSandboxProviderScope(this.providerName) }
            : {})
        });
        if (this.opts.expectedInstance) {
          const available = await MongoSandboxInstance.findOne({
            provider: this.providerName,
            sandboxId: this.sandboxId
          }).lean();
          if (!available)
            throw new SandboxOperationConflict('Selected Sandbox workspace disappeared');
          this.opts.expectedInstance = available;
        }
      }
    );
  }

  /** Attach to a selected running workspace without claiming a start operation. */
  async connectRunning() {
    const selected = this.opts.expectedInstance;
    if (!selected) throw new SandboxOperationConflict('Selected Sandbox workspace is required');
    const current = await MongoSandboxInstance.findOne({
      ...getInstanceBinding(selected, true),
      status: SandboxStatusEnum.running,
      deleteTime: null,
      $or: [
        { operation: { $exists: false } },
        {
          'operation.type': {
            $in: [
              'provision',
              'start',
              'restore',
              'editInitialize',
              'publish',
              'resetWorkspace',
              'debug'
            ]
          },
          'operation.checkpoint': 'ready'
        },
        { 'operation.type': 'deploy', 'operation.checkpoint': 'completed' }
      ],
      'operation.failureDisposition': { $ne: 'unknown' },
      'operation.error': { $exists: false }
    }).lean();
    if (!current) throw new SandboxBusyBeforeEffectError();
    prepareVolumeManagerConfig({ sandboxId: this.sandboxId, previous: current });
    if (!(await this.connectExistingProvider())) throw new SandboxBusyBeforeEffectError();
    const info = await this.provider.getInfo();
    if (info?.status.state !== 'Running') throw new SandboxBusyBeforeEffectError();
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

    return this.withActivity(() =>
      this.provider
        .execute(command, {
          ...(this.opts.workspaceRoot || this.opts.sessionDirectory
            ? { workingDirectory: this.workspaceRoot }
            : {}),
          timeoutMs: timeout ? timeout * 1000 : undefined
        })
        .catch((err) => {
          logger.error('Failed to execute sandbox', { sandboxId: this.sandboxId, error: err });
          throw err;
        })
    );
  }

  withActivity<T>(run: () => Promise<T>, mode: 'read' | 'write' = 'write'): Promise<T> {
    return runSandboxActivity(
      {
        provider: this.providerName,
        sandboxId: this.sandboxId,
        expectedInstance: this.opts.expectedInstance,
        mode,
        priority: 'interactive'
      },
      run
    );
  }

  async delete({
    assertAuthorized,
    shouldRun
  }: {
    assertAuthorized?: () => Promise<void>;
    shouldRun?: (doc: SandboxInstanceSchemaType) => boolean | Promise<boolean>;
  } = {}) {
    await runSandboxOperation(
      {
        provider: this.providerName,
        sandboxId: this.sandboxId,
        action: 'delete',
        expectedInstance: this.opts.expectedInstance,
        assertAuthorized,
        shouldRun
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
              ...(this.providerName === 'opensandbox'
                ? { providerScope: getSandboxProviderScope(this.providerName) }
                : {}),
              ...(this.provider.id ? { 'operation.providerSandboxId': this.provider.id } : {})
            });
            if (this.opts.expectedInstance && this.providerName === 'opensandbox')
              this.opts.expectedInstance = {
                ...this.opts.expectedInstance,
                providerScope: getSandboxProviderScope(this.providerName)
              };
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
        const archiveKeys = [
          ...new Set([
            ...(operation.previous?.archiveKeys ?? []),
            ...(operation.previous?.archive ? [operation.previous.archive.key] : [])
          ])
        ];
        if (archiveKeys.length) {
          const { getSandboxArchiveStorage } = await import('./archiveStorage');
          for (const key of archiveKeys) {
            await operation.assertActive();
            await getSandboxArchiveStorage().remove(this.sandboxId, key);
          }
        }
        await operation.remove();
      }
    );
  }

  async stop({
    inactiveBefore,
    assertAuthorized
  }: { inactiveBefore?: Date; assertAuthorized?: () => Promise<void> } = {}) {
    await runSandboxOperation(
      {
        provider: this.providerName,
        sandboxId: this.sandboxId,
        action: 'stop',
        expectedInstance: this.opts.expectedInstance,
        assertAuthorized,
        shouldRun: inactiveBefore
          ? async (doc) => {
              const retryingStop =
                doc.status === SandboxStatusEnum.failed &&
                doc.operation?.type === 'stop' &&
                doc.operation.failureDisposition === 'retryable';
              if (
                (!retryingStop && doc.status !== SandboxStatusEnum.running) ||
                doc.lastActiveAt >= inactiveBefore
              )
                return false;
              if (this.providerName !== 'opensandbox') return true;
              const providerId = doc.metadata?.providerSandboxId;
              if (!providerId) return false;
              const remote = await (this.provider as OpenSandboxAdapter).inspectExisting(
                providerId
              );
              // The MongoDB may be shared by deployments backed by different OpenSandbox servers.
              // Absence on this server does not prove that the other server paused the container.
              return (
                remote?.id === providerId ||
                (remote === null && doc.providerScope === getSandboxProviderScope(doc.provider))
              );
            }
          : undefined
      },
      async (operation) => {
        const verifyCapacity =
          !!getSandboxCapacityType(operation.previous ?? {}) ||
          operation.previous?.capacityReserved === true;
        const persistent =
          this.providerName === 'opensandbox' &&
          operation.previous?.storage?.volumeManager?.ensured === true &&
          !!operation.previous.storage.volumes?.[0]?.claimName;
        if (persistent) {
          const prepared = prepareVolumeManagerConfig({
            sandboxId: this.sandboxId,
            previous: operation.previous
          });
          await operation.checkpoint('volume_ensure');
          await operation.remoteEffect(() => ensureSessionVolume(this.sandboxId, prepared));
        }
        await operation.checkpoint('provider_stop');
        const exists = await this.connectExistingProvider();
        const providerId = this.provider.id ?? operation.previous?.metadata?.providerSandboxId;
        await operation.assertActive();
        if (exists) {
          await operation.checkpoint('provider_stop', {
            ...(this.providerName === 'opensandbox'
              ? { providerScope: getSandboxProviderScope(this.providerName) }
              : {}),
            ...(this.provider.id ? { 'operation.providerSandboxId': this.provider.id } : {})
          });
          if (this.opts.expectedInstance && this.providerName === 'opensandbox')
            this.opts.expectedInstance = {
              ...this.opts.expectedInstance,
              providerScope: getSandboxProviderScope(this.providerName)
            };
          await operation.remoteEffect(() =>
            persistent ? this.provider.delete() : this.provider.stop()
          );
        }
        await operation.assertActive();
        if (verifyCapacity || persistent) {
          await this.confirmCapacityRelease(
            providerId,
            persistent ? 'delete' : 'stop',
            operation.previous?.capacityReserved === false && !exists
          );
        }
        await operation.checkpoint('provider_stopped', {
          status: SandboxStatusEnum.stopped,
          ...(persistent ? { releasedAt: new Date() } : {}),
          ...(verifyCapacity || persistent ? { capacityReserved: false } : {})
        });
      }
    );
  }

  async archive(options: { inactiveBefore?: Date; assertAuthorized?: () => Promise<void> } = {}) {
    const instance =
      this.opts.expectedInstance ??
      (await MongoSandboxInstance.findOne({
        provider: this.providerName,
        sandboxId: this.sandboxId
      }).lean());
    if (!instance) throw new SandboxOperationConflict('Sandbox workspace no longer exists');
    const { archiveSandboxWorkspace } = await import('./archive');
    await archiveSandboxWorkspace(instance, options);
  }

  async release({ assertAuthorized }: { assertAuthorized?: () => Promise<void> } = {}) {
    if (this.providerName !== 'opensandbox' || env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME !== 'docker') {
      throw new Error('sandbox_release_provider_unsupported');
    }
    const assertPersistentStorage = (instance: SandboxInstanceSchemaType) => {
      const volume = prepareVolumeManagerConfig({
        sandboxId: this.sandboxId,
        previous: instance
      });
      if (
        !volume?.binding.ensured ||
        !instance.storage?.volumes?.[0]?.claimName ||
        instance.storage.volumes.length !== 1
      ) {
        throw new Error('sandbox_storage_not_persistent');
      }
      return volume;
    };
    const selected =
      this.opts.expectedInstance ??
      (await MongoSandboxInstance.findOne({
        provider: this.providerName,
        sandboxId: this.sandboxId
      }).lean());
    if (!selected) throw new SandboxOperationConflict('Sandbox workspace no longer exists');
    assertPersistentStorage(selected);
    await runSandboxOperation(
      {
        provider: this.providerName,
        sandboxId: this.sandboxId,
        action: 'release',
        expectedInstance: this.opts.expectedInstance,
        assertAuthorized
      },
      async (operation) => {
        const previous = operation.previous;
        if (!previous) throw new SandboxOperationConflict('Sandbox workspace no longer exists');
        const volume = assertPersistentStorage(previous);
        await ensureSessionVolume(this.sandboxId, volume);
        await operation.assertActive();
        const providerId = previous.metadata?.providerSandboxId;
        if (!providerId) throw new SandboxOperationConflict('Sandbox provider target is missing');
        if (!(await this.connectExistingProvider())) {
          throw new SandboxOperationConflict('Sandbox provider target cannot be confirmed');
        }
        const remote = await (this.provider as OpenSandboxAdapter).inspectExisting(providerId);
        if (!remote || remote.id !== providerId) {
          throw new SandboxOperationConflict('Sandbox provider target cannot be confirmed');
        }
        await operation.checkpoint('provider_delete', {
          providerScope: getSandboxProviderScope(this.providerName),
          'operation.providerSandboxId': providerId
        });
        if (this.opts.expectedInstance)
          this.opts.expectedInstance = {
            ...this.opts.expectedInstance,
            providerScope: getSandboxProviderScope(this.providerName)
          };
        await operation.remoteEffect(() => this.provider.delete());
        await operation.assertActive();
        await this.confirmCapacityRelease(providerId, 'delete');
        await operation.checkpoint('provider_released', {
          status: SandboxStatusEnum.stopped,
          capacityReserved: false,
          releasedAt: new Date()
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
    const bound = this.opts.expectedInstance;
    if (bound?.providerScope && bound.providerScope !== getSandboxProviderScope(bound.provider))
      throw new SandboxOperationConflict('Sandbox provider deployment changed');
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

export const getExistingSandboxClient = (
  doc: SandboxInstanceSchemaType,
  options: { requestTimeoutSeconds?: number } = {}
) =>
  new SandboxClient(
    { sandboxId: doc.sandboxId },
    { provider: doc.provider, existingOnly: true, expectedInstance: doc, ...options }
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
  if (
    instance.providerScope &&
    instance.providerScope !== getSandboxProviderScope(instance.provider)
  )
    throw new SandboxOperationConflict('Sandbox provider deployment changed');
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
  // These stop checkpoints precede compute dispatch, including legacy volume checks at pending.
  if (
    instance.provider === 'opensandbox' &&
    operation.type === 'stop' &&
    ['stopping', 'failed'].includes(instance.status) &&
    !instance.deleteTime &&
    ['pending', 'volume_ensure'].includes(operation.checkpoint)
  )
    return { ...result, code: 'pre_effect_retry_confirmed' };
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
  const releasing =
    operation.type === 'release' &&
    operation.checkpoint === 'provider_delete' &&
    ['stopping', 'failed'].includes(instance.status);
  if (!unknownCreate && !stopping && !releasing && !deleting)
    return { ...result, code: 'unsupported_operation' };
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
    if (releasing && remote === null)
      return { ...result, remote, code: 'provider_release_confirmed' };
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
    priority?: 'agent' | 'lifecycle';
  } = {}
) => {
  const { sandboxId, identity, instance } =
    'sandboxId' in props
      ? { sandboxId: props.sandboxId, identity: opts.identity, instance: undefined }
      : await resolveAppSandboxIdentity(props);
  const acquire = async () => {
    const workspaceRoot =
      opts.workspaceRoot ??
      instance?.metadata?.workspaceRoot ??
      (!('sandboxId' in props) && env.AGENT_SANDBOX_PROVIDER === 'opensandbox'
        ? getRuntimeSandboxWorkspaceRoot(instance)
        : !('sandboxId' in props) && env.AGENT_SANDBOX_PROVIDER === 'sealosdevbox'
          ? '/home/devbox/workspace'
          : undefined);
    const sessionDirectory =
      identity?.sourceType === 'appRuntime' &&
      identity.reuseScope === 'user' &&
      'chatId' in props &&
      workspaceRoot
        ? getSandboxSessionDirectory(workspaceRoot, props.chatId)
        : undefined;
    const shared = identity?.sourceType === 'appRuntime' && identity.reuseScope === 'user';
    const source = shared
      ? await assertSandboxSourceActive({ ...opts.identity, ...identity })
      : undefined;
    const sandbox = new SandboxClient(
      { ...props, sandboxId },
      {
        ...opts,
        workspaceRoot,
        sessionDirectory,
        expectedInstance: instance?.toObject(),
        identity: identity ? { ...source, ...opts.identity, ...identity } : undefined
      }
    );
    await sandbox.ensureAvailable(opts.priority);
    if (sessionDirectory && workspaceRoot) {
      await sandbox.withActivity(() =>
        prepareSandboxSessionDirectory(sandbox.provider, workspaceRoot, sessionDirectory)
      );
    }
    return sandbox;
  };
  return identity?.sourceType === 'appRuntime' && identity.reuseScope === 'user'
    ? withSandboxLease(`sandbox-source:${identity.sourceType}:${identity.sourceId}`, acquire)
    : acquire();
};

// ==== Delete Sandboxes ====
const findAppRuntimeSandboxes = async ({
  appId,
  chatIds,
  runtimeUserId,
  onIdentityConflict
}: {
  appId: string;
  chatIds?: string[];
  runtimeUserId?: string;
  onIdentityConflict?: (error: Error) => void;
}) => {
  if (chatIds?.length === 0) return [];
  const matchesChat = (field: 'sessionId' | 'chatId') =>
    chatIds
      ? {
          $or: [
            { sourceChatId: { $in: chatIds } },
            {
              sourceChatId: { $exists: false },
              $or: [{ [field]: { $in: chatIds } }, { [field]: { $regex: '^\\["(test|debug)",' } }]
            }
          ]
        }
      : {};
  const instances = await MongoSandboxInstance.find({
    $or: [
      {
        sourceType: 'appRuntime',
        sourceId: appId,
        ...matchesChat('sessionId')
      },
      {
        sourceType: { $exists: false },
        sourceId: { $exists: false },
        appId,
        ...matchesChat('chatId')
      }
    ]
  }).lean();
  const requestedChats = chatIds ? new Set(chatIds) : undefined;
  return instances.filter((doc) => {
    if (runtimeUserId !== undefined && (doc.runtimeUserId ?? doc.userId) !== runtimeUserId)
      return false;
    if (
      doc.metadata?.skillId !== undefined ||
      (doc.metadata?.sandboxType !== undefined &&
        doc.metadata.sandboxType !== SandboxTypeEnum.sessionRuntime)
    )
      return false;
    const sessionId = doc.sourceType === 'appRuntime' ? doc.sessionId : doc.chatId;
    if (
      requestedChats &&
      (!sessionId ||
        !requestedChats.has(doc.sourceChatId ?? getLegacySourceChatId(appId, sessionId)))
    )
      return false;
    if (doc.sourceType === 'appRuntime') {
      if (doc.reuseScope === 'user') {
        const valid =
          !requestedChats &&
          !!doc.runtimeUserId &&
          doc.sessionId === undefined &&
          doc.chatId == null &&
          (doc.appId == null || doc.appId === appId) &&
          (doc.userId == null || doc.userId === doc.runtimeUserId);
        if (!valid && !requestedChats) onIdentityConflict?.(new Error('sandbox_identity_conflict'));
        return valid;
      }
      const valid =
        !!doc.runtimeUserId &&
        !!doc.sessionId &&
        (doc.appId == null || doc.appId === appId) &&
        (doc.userId == null || doc.userId === doc.runtimeUserId) &&
        (doc.chatId == null || doc.chatId === doc.sessionId);
      if (!valid) onIdentityConflict?.(new Error('sandbox_identity_conflict'));
      return valid;
    }
    const valid =
      doc.runtimeUserId === undefined &&
      doc.sessionId === undefined &&
      !!doc.userId &&
      !!doc.chatId &&
      doc.chatId !== 'edit-debug';
    if (!valid) onIdentityConflict?.(new Error('sandbox_identity_conflict'));
    return valid;
  });
};

type ChatSandboxFileScope = UnionIdType & { sandboxId?: string };

export const findChatSandboxInstance = async ({
  appId,
  userId,
  chatId,
  sandboxId
}: ChatSandboxFileScope) => {
  const [legacy, shared] = await Promise.all([
    findAppRuntimeSandboxes({ appId, chatIds: [chatId] }),
    MongoSandboxInstance.find({
      sourceType: 'appRuntime',
      sourceId: appId,
      reuseScope: 'user',
      runtimeUserId: userId
    }).lean()
  ]);
  const instances = [...shared, ...legacy];
  return instances
    .filter(
      (doc) =>
        doc.provider === env.AGENT_SANDBOX_PROVIDER &&
        (doc.runtimeUserId ?? doc.userId) === userId &&
        (doc.reuseScope !== 'user' ||
          (doc.sessionId === undefined &&
            doc.chatId == null &&
            (doc.appId == null || doc.appId === appId) &&
            (doc.userId == null || doc.userId === userId) &&
            !doc.metadata?.skillId &&
            (!doc.metadata?.sandboxType ||
              doc.metadata.sandboxType === SandboxTypeEnum.sessionRuntime))) &&
        !doc.deleteTime &&
        doc.status !== SandboxStatusEnum.deleting &&
        (sandboxId === undefined || doc.sandboxId === sandboxId)
    )
    .sort(
      (a, b) =>
        Number(b.reuseScope === 'user') - Number(a.reuseScope === 'user') ||
        b.lastActiveAt.getTime() - a.lastActiveAt.getTime() ||
        b.createdAt.getTime() - a.createdAt.getTime() ||
        a.sandboxId.localeCompare(b.sandboxId)
    )[0];
};

export const getChatSandboxClient = async (scope: ChatSandboxFileScope) => {
  const instance = await findChatSandboxInstance(scope);
  if (!instance) throw new Error('Sandbox workspace not found');
  const sessionId =
    instance.reuseScope === 'user' ? scope.chatId : instance.sessionId ?? instance.chatId;
  if (!sessionId) throw new Error('Sandbox workspace not found');
  return new SandboxClient(
    {
      sandboxId: instance.sandboxId,
      appId: scope.appId,
      userId: scope.userId,
      chatId: sessionId
    },
    {
      provider: instance.provider,
      expectedInstance: instance,
      identity: {
        sourceType: 'appRuntime',
        sourceId: scope.appId,
        runtimeUserId: scope.userId,
        ...(instance.reuseScope === 'user' ? { reuseScope: 'user' as const } : { sessionId }),
        sourceChatId: instance.sourceChatId,
        teamId: instance.teamId,
        ownerTmbId: instance.ownerTmbId
      },
      ...(instance.reuseScope === 'user'
        ? {
            sessionDirectory: getSandboxSessionDirectory(
              getRuntimeSandboxWorkspaceRoot(instance),
              scope.chatId
            )
          }
        : {}),
      workspaceRoot:
        instance.provider === 'opensandbox'
          ? getRuntimeSandboxWorkspaceRoot(instance)
          : instance.metadata?.workspaceRoot ??
            (instance.metadata?.sandboxType === SandboxTypeEnum.sessionRuntime
              ? '/home/sandbox/workspace'
              : undefined)
    }
  );
};

export const deleteSandboxesByChatIds = async ({
  appId,
  chatIds,
  runtimeUserId
}: {
  appId: string;
  chatIds: string[];
  runtimeUserId?: string;
}) => {
  const errors: Error[] = [];
  const instances = await findAppRuntimeSandboxes({
    appId,
    chatIds,
    runtimeUserId,
    onIdentityConflict: (error) => errors.push(error)
  });
  await deleteSandboxInstances(
    instances.filter((doc) => doc.reuseScope !== 'user'),
    errors
  );
};
export const deleteSandboxesByAppId = async (appId: string) => {
  await withSandboxLease(`sandbox-source:appRuntime:${appId}`, async () => {
    const errors: Error[] = [];
    const instances = await findAppRuntimeSandboxes({
      appId,
      onIdentityConflict: (error) => errors.push(error)
    });
    await deleteSandboxInstances(instances, errors);
  });
};

const deleteSandboxInstances = async (
  instances: SandboxInstanceSchemaType[],
  identityErrors: Error[]
) => {
  const results = await Promise.allSettled(
    instances.map(async (doc) => {
      const client = getExistingSandboxClient(doc);
      await client.delete().catch((err) => {
        logger.error('Failed to delete sandbox', { sandboxId: doc.sandboxId, error: err });
        throw err;
      });
    })
  );
  const errors = [
    ...identityErrors,
    ...results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []))
  ];
  if (errors.length)
    throw new AggregateError(errors, 'Failed to delete sandbox resources; retry cleanup');
};

const lifecycleProviderScope = () => {
  const provider = env.AGENT_SANDBOX_PROVIDER ?? 'opensandbox';
  const url =
    provider === 'sealosdevbox'
      ? env.AGENT_SANDBOX_SEALOS_BASEURL
      : env.AGENT_SANDBOX_OPENSANDBOX_BASEURL;
  const scope = createHash('sha256')
    .update(`${provider}:${env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME}:${url ?? ''}`)
    .digest('hex')
    .slice(0, 16);
  return { provider, scope };
};

export const cronJob = async () => {
  setCron('*/10 * * * *', async () => {
    const { provider, scope } = lifecycleProviderScope();
    if (!(await checkTimerLock({ timerId: `sandboxIdleStop:${scope}`, lockMinuted: 9 }))) return;
    const inactiveBefore = subMinutes(new Date(), env.AGENT_SANDBOX_SUSPEND_MINUTES);
    const instances = await MongoSandboxInstance.find({
      provider,
      deleteTime: null,
      status: SandboxStatusEnum.running,
      lastActiveAt: { $lt: inactiveBefore }
    }).lean();
    await batchRun(instances, async (doc) => {
      const stop = () => getExistingSandboxClient(doc).stop({ inactiveBefore });
      const stopping =
        doc.sourceType === 'skillEdit' && doc.sourceId
          ? withSandboxLease(`skill-edit-activity:${doc.sourceId}`, async () => {
              const { assertSkillWorkspaceTerminalIdle } = await import('./terminal');
              await assertSkillWorkspaceTerminalIdle(doc);
              await stop();
            })
          : stop();
      await stopping.catch((error) => {
        if (!(error instanceof SandboxOperationConflict))
          logger.error('Failed to stop sandbox', { sandboxId: doc.sandboxId, error });
      });
    });
  });
  setCron('0 */12 * * *', async () => {
    const { provider, scope } = lifecycleProviderScope();
    if (
      provider !== 'opensandbox' ||
      !(await checkTimerLock({ timerId: `sandboxColdArchive:${scope}`, lockMinuted: 60 }))
    )
      return;
    const inactiveBefore = subMinutes(
      new Date(),
      env.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS * 24 * 60
    );
    const instances = await MongoSandboxInstance.find({
      provider,
      deleteTime: null,
      status: SandboxStatusEnum.stopped,
      lastActiveAt: { $lt: inactiveBefore },
      'storage.volumeManager.ensured': true,
      $or: [{ reuseScope: 'user' }, { sourceType: 'skillEdit' }]
    }).lean();
    await batchRun(instances, async (doc) => {
      const archive = () => getExistingSandboxClient(doc).archive({ inactiveBefore });
      try {
        if (doc.sourceType === 'skillEdit' && doc.sourceId)
          await withSandboxLease(`skill-edit-activity:${doc.sourceId}`, archive);
        else await archive();
      } catch (error) {
        if (!(error instanceof SandboxOperationConflict))
          logger.error('Failed to archive sandbox', { sandboxId: doc.sandboxId, error });
      }
    });
  });
  setCron('*/10 * * * *', async () => {
    const { provider, scope } = lifecycleProviderScope();
    if (!(await checkTimerLock({ timerId: `sandboxLifecycleRecovery:${scope}`, lockMinuted: 9 })))
      return;
    const instances = await MongoSandboxInstance.find({
      provider,
      deleteTime: null,
      status: { $in: ['archiving', 'stopping', 'failed'] },
      $or: [
        {
          'operation.type': 'archive',
          'operation.heartbeatAt': { $lt: subMinutes(new Date(), 45) }
        },
        { 'operation.type': 'stop', 'operation.heartbeatAt': { $lt: subMinutes(new Date(), 15) } }
      ]
    }).lean();
    await batchRun(instances, async (doc) => {
      try {
        if (doc.operation?.type === 'archive') await getExistingSandboxClient(doc).archive();
        else if (doc.operation?.id) {
          const operationId = doc.operation.id;
          const recover = async () => {
            const result = await recoverSandboxOperation({
              provider: doc.provider,
              sandboxId: doc.sandboxId,
              operationId
            });
            if (result.code !== 'pre_effect_retry_confirmed') return;
            const recovered = await MongoSandboxInstance.findOne({
              _id: doc._id,
              status: 'failed',
              'operation.type': 'stop',
              'operation.recoveredFromOperationId': operationId,
              deleteTime: null
            }).lean();
            const inactiveBefore = subMinutes(new Date(), env.AGENT_SANDBOX_SUSPEND_MINUTES);
            if (!recovered || recovered.lastActiveAt >= inactiveBefore) return;
            if (recovered.sourceType === 'skillEdit') {
              const { assertSkillWorkspaceTerminalIdle } = await import('./terminal');
              await assertSkillWorkspaceTerminalIdle(recovered);
            }
            await getExistingSandboxClient(recovered).stop({ inactiveBefore });
          };
          if (doc.sourceType === 'skillEdit' && doc.sourceId)
            await withSandboxLease(`skill-edit-activity:${doc.sourceId}`, recover);
          else await recover();
        }
      } catch (error) {
        if (!(error instanceof SandboxOperationConflict))
          logger.error('Failed to recover sandbox lifecycle', { sandboxId: doc.sandboxId, error });
      }
    });
  });
  setCron('0 * * * *', async () => {
    if (!env.AGENT_SANDBOX_ORPHAN_SWEEP_ENABLED) return;
    const { provider, scope } = lifecycleProviderScope();
    if (!(await checkTimerLock({ timerId: `sandboxOrphanSweep:${scope}`, lockMinuted: 55 })))
      return;
    try {
      // The renewable lock also prevents overlap if a large scan takes longer than an hour.
      await withSandboxLease(`sandbox-orphan-sweep:${scope}`, async (lease) => {
        const tasks: [string, () => Promise<unknown>][] = [
          ['instances', async () => (await import('./orphan')).sweepOrphanSandboxes({ provider })],
          [
            'deletedApps',
            async () => (await import('./orphanMaintenance')).retryDeletedAppCleanup()
          ],
          ['archives', async () => (await import('./orphanMaintenance')).auditSandboxArchives()]
        ];
        for (const [task, run] of tasks) {
          await lease.assertOwned();
          try {
            await run();
          } catch (error) {
            logger.error('Sandbox orphan maintenance failed', { task, provider, error });
          }
        }
      });
    } catch (error) {
      if (!(error instanceof SandboxOperationConflict))
        logger.error('Failed to run sandbox orphan sweep', { provider, error });
    }
  });
};
