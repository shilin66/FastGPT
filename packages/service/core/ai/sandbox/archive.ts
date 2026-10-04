import { randomUUID } from 'node:crypto';
import { OpenSandboxAdapter, type OpenSandboxConfigType } from '@fastgpt-sdk/sandbox-adapter';
import { SandboxClient, getExistingSandboxClient } from './controller';
import { MongoSandboxInstance } from './schema';
import type { SandboxInstanceSchemaType } from './type';
import { runSandboxOperation } from './operation';
import { SandboxOperationConflict } from './lease';
import {
  prepareVolumeManagerConfig,
  getVolumeManagerConfig,
  deleteSessionVolume,
  getSandboxProviderScope,
  buildOpenSandboxCreateConfig
} from './config';
import {
  getRuntimeSandboxWorkspaceRoot,
  disconnectFromProviderSandbox
} from '../../agentSkills/sandboxConfig';
import { createWorkspaceArchive, installWorkspaceArchive } from './archiveIO';
import { getSandboxArchiveStorage, getSandboxArchiveKey } from './archiveStorage';
import { env } from '../../../env';
import { assertSandboxSourceActive } from './sourceGuard';

const latest = async (provider: string, sandboxId: string) => {
  const instance = await MongoSandboxInstance.findOne({ provider, sandboxId }).lean();
  if (!instance) throw new SandboxOperationConflict('Sandbox workspace no longer exists');
  return instance;
};

const deleteProvider = async (
  instance: SandboxInstanceSchemaType,
  assertActive: () => Promise<void>
) => {
  const provider = getExistingSandboxClient(instance).provider;
  if (!(provider instanceof OpenSandboxAdapter))
    throw new Error('sandbox_archive_provider_unsupported');
  try {
    const exists = await provider.connectExisting();
    if (exists && provider.id !== instance.metadata?.providerSandboxId)
      throw new SandboxOperationConflict('Sandbox provider identity changed');
    await assertActive();
    if (exists) await provider.delete();
    await assertActive();
    if (await provider.inspectExisting(instance.metadata?.providerSandboxId))
      throw new SandboxOperationConflict('Sandbox provider deletion not confirmed');
  } finally {
    if (provider.id) await disconnectFromProviderSandbox(provider);
  }
};

export const upgradeSandboxImage = async (
  instance: SandboxInstanceSchemaType,
  createConfig?: OpenSandboxConfigType,
  assertAuthorized?: () => Promise<void>
) => {
  await assertAuthorized?.();
  if (instance.status === 'running') await getExistingSandboxClient(instance).stop();
  const stopped = await latest(instance.provider, instance.sandboxId);
  await archiveSandboxWorkspace(stopped, { assertAuthorized });
  await restoreSandboxWorkspace(
    await latest(instance.provider, instance.sandboxId),
    createConfig,
    assertAuthorized
  );
};

export const archiveSandboxWorkspace = async (
  instance: SandboxInstanceSchemaType,
  options: { inactiveBefore?: Date; assertAuthorized?: () => Promise<void> } = {}
) => {
  if (instance.provider !== 'opensandbox') throw new Error('sandbox_archive_provider_unsupported');
  const binding = prepareVolumeManagerConfig({ sandboxId: instance.sandboxId, previous: instance });
  if (!binding?.binding.ensured || !binding.storage.volumes?.[0]?.claimName)
    throw new Error('sandbox_storage_not_persistent');
  if (instance.status === 'archived') return;
  const root = getRuntimeSandboxWorkspaceRoot(instance);
  let client: SandboxClient | undefined;
  try {
    await runSandboxOperation(
      {
        provider: instance.provider,
        sandboxId: instance.sandboxId,
        action: 'archive',
        expectedInstance: instance,
        assertAuthorized:
          options.assertAuthorized ??
          (instance.sourceType
            ? async () => {
                await assertSandboxSourceActive(instance);
              }
            : undefined),
        shouldRun: options.inactiveBefore
          ? (current) =>
              current.status === 'stopped' && current.lastActiveAt < options.inactiveBefore!
          : (current) => {
              if (!['stopped', 'archiving'].includes(current.status))
                throw new SandboxOperationConflict('Archive requires a stopped workspace');
              return true;
            }
      },
      async (operation) => {
        let checkpoint =
          operation.previous?.operation?.type === 'archive'
            ? operation.previous.operation.checkpoint
            : 'pending';
        const previous = operation.previous!;
        if (
          !['archive_uploaded', 'provider_deleted', 'volume_deleted', 'archived'].includes(
            checkpoint
          )
        ) {
          const prepared = prepareVolumeManagerConfig({ sandboxId: instance.sandboxId, previous });
          const vm = await operation.remoteEffect(() =>
            getVolumeManagerConfig(instance.sandboxId, prepared)
          );
          client = new SandboxClient(
            { sandboxId: instance.sandboxId },
            {
              provider: instance.provider,
              vmConfig: vm,
              workspaceRoot: root,
              createConfig: {
                ...buildOpenSandboxCreateConfig(),
                ...(previous.metadata?.image ? { image: previous.metadata.image } : {}),
                entrypoint: ['/bin/sh', '-c', 'exec sleep infinity']
              }
            }
          );
          await operation.remoteEffect(() => client!.provider.ensureRunning());
          const info = await client.provider.getInfo();
          if (!info || info.status.state !== 'Running')
            throw new Error('Archive runtime is unavailable');
          await operation.checkpoint('archive_connected', {
            providerScope: getSandboxProviderScope(instance.provider),
            'metadata.providerSandboxId': info.id
          });
          const archive = await createWorkspaceArchive(
            client.provider,
            root,
            env.AGENT_SANDBOX_ARCHIVE_MAX_BYTES,
            operation.assertActive
          );
          const key = getSandboxArchiveKey(instance.sandboxId, operation.id);
          await operation.checkpoint('archive_prepared', {
            archive: { key, hash: archive.hash, size: archive.size, createdAt: new Date() },
            archiveKeys: [
              ...new Set([
                ...(previous.archiveKeys ?? []),
                ...(previous.archive ? [previous.archive.key] : []),
                key
              ])
            ]
          });
          await operation.remoteEffect(() =>
            getSandboxArchiveStorage().upload(instance.sandboxId, key, archive.buffer)
          );
          await operation.checkpoint('archive_uploaded');
          checkpoint = 'archive_uploaded';
        }
        if (checkpoint === 'archive_uploaded') {
          const current = await latest(instance.provider, instance.sandboxId);
          await operation.remoteEffect(() => deleteProvider(current, operation.assertActive));
          await operation.checkpoint('provider_deleted', {
            capacityReserved: false,
            releasedAt: new Date()
          });
          checkpoint = 'provider_deleted';
        }
        if (checkpoint === 'provider_deleted') {
          const current = await latest(instance.provider, instance.sandboxId);
          const prepared = prepareVolumeManagerConfig({
            sandboxId: instance.sandboxId,
            previous: current,
            action: 'delete'
          });
          await operation.remoteEffect(() => deleteSessionVolume(instance.sandboxId, prepared));
          await operation.checkpoint('volume_deleted');
        }
        await operation.checkpoint('archived', {
          status: 'archived',
          capacityReserved: false,
          archiveAt: new Date()
        });
      }
    );
  } finally {
    if (client?.provider.id) await disconnectFromProviderSandbox(client.provider);
  }
};

export const restoreSandboxWorkspace = async (
  instance: SandboxInstanceSchemaType,
  createConfig?: OpenSandboxConfigType,
  assertAuthorized?: () => Promise<void>
) => {
  if (instance.provider !== 'opensandbox' || !instance.archive)
    throw new Error('sandbox_archive_unavailable');
  const root = getRuntimeSandboxWorkspaceRoot(instance);
  let client: SandboxClient | undefined;
  try {
    await runSandboxOperation(
      {
        provider: instance.provider,
        sandboxId: instance.sandboxId,
        action: 'restore',
        expectedInstance: instance,
        priority: 'agent',
        assertAuthorized:
          assertAuthorized ??
          (instance.sourceType
            ? async () => {
                await assertSandboxSourceActive(instance);
              }
            : undefined)
      },
      async (operation) => {
        const previous = operation.previous!;
        const checkpoint =
          previous.operation?.type === 'restore' ? previous.operation.checkpoint : 'pending';
        const archive = previous.archive!;
        let storage = previous.storage;
        if (checkpoint === 'pending') {
          const prepared = prepareVolumeManagerConfig({
            sandboxId: instance.sandboxId,
            newGeneration: randomUUID().replaceAll('-', '').slice(0, 12)
          });
          if (!prepared) throw new Error('sandbox_storage_not_persistent');
          storage = prepared.storage;
          await operation.checkpoint('volume_assigned', {
            providerScope: getSandboxProviderScope(instance.provider),
            storage,
            workspaceGeneration: randomUUID()
          });
        }
        const current = await latest(instance.provider, instance.sandboxId);
        const prepared = prepareVolumeManagerConfig({
          sandboxId: instance.sandboxId,
          previous: current
        });
        const vm = await operation.remoteEffect(() =>
          getVolumeManagerConfig(instance.sandboxId, prepared)
        );
        client = new SandboxClient(
          { sandboxId: instance.sandboxId },
          {
            provider: instance.provider,
            vmConfig: vm,
            workspaceRoot: root,
            createConfig
          }
        );
        await operation.remoteEffect(() => client!.provider.ensureRunning());
        const info = await client.provider.getInfo();
        if (!info || info.status.state !== 'Running')
          throw new Error('Restore runtime is unavailable');
        await operation.checkpoint('restore_connected', {
          storage: vm?.storage ?? storage,
          'metadata.providerSandboxId': info.id
        });
        const buffer = await getSandboxArchiveStorage().download(
          instance.sandboxId,
          archive.key,
          env.AGENT_SANDBOX_ARCHIVE_MAX_BYTES
        );
        await operation.remoteEffect(() =>
          installWorkspaceArchive(
            client!.provider,
            root,
            buffer,
            archive,
            env.AGENT_SANDBOX_ARCHIVE_MAX_BYTES,
            operation.assertActive
          )
        );
        await operation.checkpoint('ready', {
          status: 'running',
          lastActiveAt: new Date(),
          releasedAt: null,
          ...(info.image ? { 'metadata.image': info.image } : {})
        });
      }
    );
  } finally {
    if (client?.provider.id) await disconnectFromProviderSandbox(client.provider);
  }
};
