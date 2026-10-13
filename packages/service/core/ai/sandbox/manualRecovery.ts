import { createHash, randomUUID } from 'node:crypto';
import { OpenSandboxAdapter } from '@fastgpt-sdk/sandbox-adapter';
import type { SandboxWorkspaceActionResponse } from '@fastgpt/global/openapi/core/ai/sandbox/management';
import { env } from '../../../env';
import { SandboxClient, getExistingSandboxClient } from './controller';
import {
  getSandboxProviderScope,
  prepareVolumeManagerConfig,
  inspectSessionVolume,
  getVolumeManagerConfig
} from './config';
import { getSandboxArchiveStorage } from './archiveStorage';
import { installWorkspaceArchive } from './archiveIO';
import { SandboxOperationConflict, withSandboxLease } from './lease';
import { getInstanceBinding, runSandboxOperation } from './operation';
import { getSandboxOwnership } from './ownership';
import { SandboxMetadataSchema, type SandboxInstanceSchemaType } from './type';
import {
  getRuntimeSandboxWorkspaceRoot,
  disconnectFromProviderSandbox
} from '../../agentSkills/sandboxConfig';

export const canRecoverSandboxWorkspace = (instance: SandboxInstanceSchemaType): boolean => {
  const operation = instance.operation;
  if (
    instance.provider !== 'opensandbox' ||
    instance.sourceType !== 'appRuntime' ||
    instance.reuseScope !== 'user' ||
    !instance.runtimeUserId ||
    !instance.sourceId ||
    instance.deleteTime ||
    instance.forceDeletion ||
    !instance.metadata?.runtimeConfig?.recoverable ||
    !instance.storage?.volumeManager?.ensured ||
    !instance.storage.volumes?.[0]?.claimName ||
    operation?.failureDisposition === 'unknown' ||
    operation?.effectState === 'pending'
  )
    return false;
  if (instance.status === 'failed')
    return (
      operation?.type === 'start' &&
      operation.checkpoint === 'pending' &&
      operation.effectState === 'idle' &&
      operation.failureDisposition === 'retryable'
    );
  if (operation?.error) return false;
  if (instance.status === 'archived') return !operation || operation.checkpoint === 'archived';
  return (
    ['running', 'stopped'].includes(instance.status) &&
    (!operation ||
      ['ready', 'completed', 'provider_stopped', 'provider_released'].includes(
        operation.checkpoint
      ))
  );
};

const recoveryRevision = (instance: SandboxInstanceSchemaType) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        getInstanceBinding(instance, true),
        instance.status,
        instance.operation,
        instance.releasedAt,
        instance.workspaceGeneration,
        instance.metadata?.runtimeConfig,
        instance.archive,
        instance.archiveKeys,
        instance.forceDeletion
      ])
    )
    .digest('hex');

export const recoverSandboxWorkspace = async (
  instance: SandboxInstanceSchemaType,
  options: {
    rebuildEmpty?: boolean;
    recoveryRevision?: string;
    assertAuthorized: () => Promise<void>;
  }
): Promise<SandboxWorkspaceActionResponse> => {
  if (env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME !== 'docker')
    throw new SandboxOperationConflict('sandbox_recovery_unsupported');
  let result: SandboxWorkspaceActionResponse = { success: false };
  let strategy: 'original' | 'backup' | 'empty' = 'original';
  let buffer: Buffer | undefined;
  let remote: { id: string; status: { state: string } } | null = null;
  let client: SandboxClient | undefined;
  const execute = async () => {
    try {
      await runSandboxOperation(
        {
          provider: instance.provider,
          sandboxId: instance.sandboxId,
          action: 'restore',
          priority: 'interactive',
          expectedInstance: instance,
          assertAuthorized: options.assertAuthorized,
          shouldRun: async (current) => {
            if (
              !canRecoverSandboxWorkspace(current) ||
              current.providerScope !== getSandboxProviderScope(current.provider)
            )
              throw new SandboxOperationConflict('sandbox_recovery_blocked');
            getSandboxOwnership(current);
            SandboxMetadataSchema.shape.runtimeConfig.parse(current.metadata?.runtimeConfig);
            const revision = recoveryRevision(current);
            if (options.rebuildEmpty && revision !== options.recoveryRevision)
              throw new SandboxOperationConflict('sandbox_recovery_stale');
            const provider = getExistingSandboxClient(current, {
              requestTimeoutSeconds: 10
            }).provider;
            if (!(provider instanceof OpenSandboxAdapter))
              throw new SandboxOperationConflict('sandbox_recovery_unsupported');
            remote = await provider.inspectExisting(current.metadata?.providerSandboxId);
            if (remote && !['Running', 'Stopped'].includes(remote.status.state))
              throw new SandboxOperationConflict('sandbox_recovery_busy');
            const binding = prepareVolumeManagerConfig({
              sandboxId: current.sandboxId,
              previous: current
            });
            if (await inspectSessionVolume(current.sandboxId, binding)) {
              strategy = 'original';
              return true;
            }
            if (remote)
              throw new SandboxOperationConflict('sandbox_recovery_storage_missing_active');
            const keys = [
              ...new Set([
                ...(current.archive ? [current.archive.key] : []),
                ...(current.archiveKeys ?? [])
              ])
            ];
            if (keys.length > 100)
              throw new SandboxOperationConflict('sandbox_recovery_backup_unverified');
            for (const key of keys) {
              if (!(await getSandboxArchiveStorage().exists(current.sandboxId, key))) continue;
              if (!current.archive || key !== current.archive.key)
                throw new SandboxOperationConflict('sandbox_recovery_backup_unverified');
              buffer = await getSandboxArchiveStorage().download(
                current.sandboxId,
                key,
                env.AGENT_SANDBOX_ARCHIVE_MAX_BYTES
              );
              if (
                buffer.length !== current.archive.size ||
                createHash('sha256').update(new Uint8Array(buffer)).digest('hex') !==
                  current.archive.hash
              )
                throw new SandboxOperationConflict('sandbox_recovery_backup_unverified');
              strategy = 'backup';
              return true;
            }
            if (!options.rebuildEmpty) {
              result = {
                success: false,
                status: 'confirmation_required',
                recoveryRevision: revision
              };
              return false;
            }
            strategy = 'empty';
            return true;
          }
        },
        async (operation) => {
          const previous = operation.previous!;
          const saved = SandboxMetadataSchema.shape.runtimeConfig.parse(
            previous.metadata?.runtimeConfig
          );
          if (!saved) throw new SandboxOperationConflict('sandbox_recovery_config_missing');
          const root = getRuntimeSandboxWorkspaceRoot(previous);
          let binding = prepareVolumeManagerConfig({ sandboxId: instance.sandboxId, previous });
          if (strategy !== 'original') {
            const mountPath = binding?.mountPath;
            binding = prepareVolumeManagerConfig({
              sandboxId: instance.sandboxId,
              newGeneration: randomUUID().replaceAll('-', '').slice(0, 24)
            });
            if (!binding || !mountPath)
              throw new SandboxOperationConflict('sandbox_recovery_storage_missing');
            binding.mountPath = mountPath;
            binding.storage.mountPath = mountPath;
            await operation.checkpoint('volume_assigned', {
              storage: binding.storage,
              workspaceGeneration: randomUUID(),
              currentDeploymentHash: ''
            });
          }
          const volume = binding?.storage.volumes?.[0];
          const vm =
            strategy === 'original' && binding && volume?.claimName
              ? {
                  storage: previous.storage!,
                  volumes: [
                    {
                      name: volume.name,
                      mountPath: volume.mountPath,
                      ...(volume.subPath ? { subPath: volume.subPath } : {}),
                      pvc: {
                        claimName: volume.claimName,
                        createIfNotExists: false,
                        deleteOnSandboxTermination: false
                      }
                    }
                  ]
                }
              : await operation.remoteEffect(() =>
                  getVolumeManagerConfig(instance.sandboxId, binding)
                );
          if (!vm) throw new SandboxOperationConflict('sandbox_recovery_storage_missing');
          await operation.checkpoint('provider_ensure', { storage: vm.storage });
          client = new SandboxClient(
            { sandboxId: instance.sandboxId },
            {
              provider: instance.provider,
              vmConfig: vm,
              workspaceRoot: root,
              identity: {
                sourceType: 'appRuntime',
                sourceId: previous.sourceId!,
                runtimeUserId: previous.runtimeUserId!,
                reuseScope: 'user'
              },
              createConfig: {
                image: saved.image,
                entrypoint: saved.entrypoint,
                env: saved.env,
                metadata: saved.metadata,
                resourceLimits: saved.resourceLimits ?? previous.limit ?? undefined,
                timeoutSeconds: saved.timeoutSeconds
              }
            }
          );
          if (remote) {
            if (!(client.provider instanceof OpenSandboxAdapter))
              throw new SandboxOperationConflict('sandbox_recovery_unsupported');
            const bound = await client.provider.inspectExisting(remote.id);
            if (!bound || bound.id !== remote.id)
              throw new SandboxOperationConflict('sandbox_recovery_instance_unverified');
          }
          await operation.remoteEffect(() => client!.provider.ensureRunning());
          const info = await client.provider.getInfo();
          if (!info || info.status.state !== 'Running' || (remote && info.id !== remote.id))
            throw new SandboxOperationConflict('sandbox_recovery_instance_unverified');
          await operation.checkpoint('restore_connected', {
            'metadata.providerSandboxId': info.id
          });
          if (strategy === 'backup') {
            if (!buffer || !previous.archive)
              throw new SandboxOperationConflict('sandbox_recovery_backup_unverified');
            await operation.remoteEffect(() =>
              installWorkspaceArchive(
                client!.provider,
                root,
                buffer!,
                previous.archive!,
                env.AGENT_SANDBOX_ARCHIVE_MAX_BYTES,
                operation.assertActive
              )
            );
          }
          await operation.checkpoint('ready', {
            status: 'running',
            releasedAt: null,
            lastActiveAt: new Date(),
            ...(info.image ? { 'metadata.image': info.image } : {})
          });
          result = { success: true, status: 'recovered', strategy };
        }
      );
    } finally {
      if (client?.provider.id) await disconnectFromProviderSandbox(client.provider);
    }
  };
  await withSandboxLease(
    `skill-runtime-init:${instance.sandboxId}`,
    () =>
      withSandboxLease(`sandbox-source:appRuntime:${instance.sourceId}`, execute, {
        priority: 'interactive',
        waitMs: 8_000
      }),
    { priority: 'interactive', waitMs: 8_000 }
  );
  return result;
};
