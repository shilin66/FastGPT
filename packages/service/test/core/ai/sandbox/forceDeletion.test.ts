import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import {
  getExistingSandboxClient,
  getSandboxClient,
  SandboxClient
} from '@fastgpt/service/core/ai/sandbox/controller';
import { runSandboxOperation } from '@fastgpt/service/core/ai/sandbox/operation';
import type { PreparedVolumeManagerConfig } from '@fastgpt/service/core/ai/sandbox/config';
import { getSandboxProviderScope } from '@fastgpt/service/core/ai/sandbox/config';
import { getSandboxForceDeleteRevision } from '@fastgpt/service/core/ai/sandbox/forceDeletePolicy';
import { createLeaseRedisEval } from './leaseRedisMock';

const fake = vi.hoisted(() => ({
  redis: new Map<string, { token: string; expiresAt: number }>(),
  remote: null as { id: string; status: { state: string } } | null,
  inspect: vi.fn(),
  deleteCompute: vi.fn(),
  connect: vi.fn(),
  create: vi.fn(),
  ensureVolume: vi.fn(),
  deleteVolume: vi.fn(),
  removeArchive: vi.fn()
}));
vi.mock('@fastgpt/service/env', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/env')>()),
  env: {
    AGENT_SANDBOX_PROVIDER: 'opensandbox',
    AGENT_SANDBOX_OPENSANDBOX_RUNTIME: 'docker',
    AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://sandbox.test',
    AGENT_SANDBOX_ENABLE_VOLUME: true,
    AGENT_SANDBOX_VOLUME_MANAGER_URL: 'http://volume.test',
    AGENT_SANDBOX_VOLUME_MANAGER_PROTOCOL: 'claimName',
    AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH: '/workspace',
    AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: 'image'
  }
}));
vi.mock('@fastgpt/service/common/redis', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/common/redis')>()),
  getGlobalRedisConnection: () => ({ eval: createLeaseRedisEval(fake.redis) })
}));
vi.mock('@fastgpt-sdk/sandbox-adapter', async (original) => {
  const actual = await original<typeof import('@fastgpt-sdk/sandbox-adapter')>();
  class OpenSandboxAdapter {
    provider = 'opensandbox' as const;
    get id() {
      return fake.remote?.id;
    }
    inspectExisting = fake.inspect;
    deleteExisting = fake.deleteCompute;
    connectExisting = fake.connect;
    ensureRunning = fake.create;
    getInfo = async () => fake.remote;
  }
  return { ...actual, OpenSandboxAdapter, createSandbox: () => new OpenSandboxAdapter() };
});
vi.mock('@fastgpt/service/core/ai/sandbox/config', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/ai/sandbox/config')>()),
  deleteSessionVolume: fake.deleteVolume,
  getVolumeManagerConfig: fake.ensureVolume
}));
vi.mock('@fastgpt/service/core/ai/sandbox/sourceGuard', () => ({
  assertSandboxSourceActive: async () => ({
    teamId: '6aa000000000000000000002',
    ownerTmbId: '6aa000000000000000000003'
  })
}));
vi.mock('@fastgpt/service/core/ai/sandbox/archiveStorage', () => ({
  getSandboxArchiveStorage: () => ({ remove: fake.removeArchive })
}));

const sandboxId = 'forced-delete-workspace';
const archiveKey = 'sandbox/archive/forced-delete/retained.tar.gz';
const storage = {
  mountPath: '/workspace',
  volumes: [{ name: 'workspace', claimName: 'original-volume', mountPath: '/workspace' }],
  volumeManager: {
    protocol: 'claimName',
    baseUrl: 'http://volume.test',
    target: 'original-volume',
    ensured: true
  }
};
const seed = async (extra: Record<string, unknown> = {}) =>
  (
    await MongoSandboxInstance.create({
      sandboxId,
      provider: 'opensandbox',
      providerScope: getSandboxProviderScope('opensandbox'),
      sourceType: 'appRuntime',
      sourceId: '6aa000000000000000000001',
      appId: '6aa000000000000000000001',
      runtimeUserId: 'user-1',
      userId: 'user-1',
      teamId: '6aa000000000000000000002',
      reuseScope: 'user',
      status: 'failed',
      capacityReserved: true,
      storage,
      archiveKeys: [archiveKey],
      metadata: { providerSandboxId: 'original-compute', volumeEnabled: true },
      operation: {
        id: 'failed-operation',
        type: 'start',
        checkpoint: 'provider_ensure',
        startedAt: new Date(0),
        updatedAt: new Date(0),
        heartbeatAt: new Date(0),
        failureDisposition: 'unknown',
        effectState: 'completed',
        error: { code: 'sandbox_unavailable', message: 'ready query failed' }
      },
      ...extra
    })
  ).toObject();
const current = async () => {
  const instance = await MongoSandboxInstance.findOne({ sandboxId }).lean();
  if (!instance) throw new Error('Expected pending workspace');
  return instance;
};
const forceDelete = async (instance: Awaited<ReturnType<typeof seed>>) =>
  getExistingSandboxClient(instance).forceDelete({
    deletionRevision: getSandboxForceDeleteRevision(instance),
    assertAuthorized: async () => {}
  });

beforeEach(async () => {
  vi.clearAllMocks();
  fake.redis.clear();
  fake.remote = { id: 'original-compute', status: { state: 'Running' } };
  fake.inspect.mockImplementation(async () => fake.remote);
  fake.deleteCompute.mockImplementation(async () => {
    fake.remote = null;
  });
  fake.connect.mockRejectedValue(new Error('execd is unreachable'));
  fake.deleteVolume.mockResolvedValue(undefined);
  fake.removeArchive.mockResolvedValue(undefined);
  fake.ensureVolume.mockImplementation(
    async (_id: string, prepared: PreparedVolumeManagerConfig) => ({
      volumes: [
        { name: 'workspace', mountPath: '/workspace', pvc: { claimName: prepared.binding.target } }
      ],
      storage: { ...prepared.storage, volumeManager: { ...prepared.binding, ensured: true } }
    })
  );
  await MongoSandboxInstance.deleteMany({});
});

describe('forced Agent workspace deletion', () => {
  it('creates an empty volume on the next call using the original Agent identity', async () => {
    const instance = await seed();
    expect(await forceDelete(instance)).toMatchObject({ status: 'deleted' });
    fake.create.mockImplementation(async () => {
      fake.remote = { id: 'new-compute', status: { state: 'Running' } };
    });
    const client = new SandboxClient(
      { sandboxId },
      {
        provider: 'opensandbox',
        identity: {
          sourceType: 'appRuntime',
          sourceId: instance.sourceId!,
          runtimeUserId: 'user-1',
          reuseScope: 'user'
        }
      }
    );
    await client.ensureAvailable();
    const recreated = await current();
    expect(recreated.metadata?.providerSandboxId).toBe('new-compute');
    expect(recreated.storage?.volumeManager?.target).not.toBe('original-volume');
    expect(recreated.archiveKeys ?? []).toEqual([]);
    expect(recreated.forceDeletion).toBeUndefined();
    expect(fake.ensureVolume).toHaveBeenCalledOnce();
    const firstTarget = recreated.storage?.volumeManager?.target;
    expect(await forceDelete(recreated)).toMatchObject({ status: 'deleted' });
    const next = new SandboxClient(
      { sandboxId },
      {
        provider: 'opensandbox',
        identity: {
          sourceType: 'appRuntime',
          sourceId: instance.sourceId!,
          runtimeUserId: 'user-1',
          reuseScope: 'user'
        }
      }
    );
    await next.ensureAvailable();
    expect((await current()).storage?.volumeManager?.target).not.toBe(firstTarget);
  });

  it('records a late create receipt only in the deletion barrier and never publishes ready', async () => {
    const initial = await seed({ status: 'running', operation: undefined });
    let resolveEffect: (() => void) | undefined;
    let started: (() => void) | undefined;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const effect = new Promise<void>((resolve) => {
      resolveEffect = resolve;
    });
    const ready = vi.fn();
    const original = runSandboxOperation(
      { provider: 'opensandbox', sandboxId, action: 'ensure', expectedInstance: initial },
      async (operation) => {
        await operation.checkpoint('provider_ensure');
        await operation.remoteEffect(async () => {
          started?.();
          await effect;
        });
        await operation.checkpoint('ready', { status: 'running' });
        ready();
      }
    ).catch((error: unknown) => error);
    await startedPromise;
    fake.redis.clear();
    await MongoSandboxInstance.updateOne(
      { sandboxId },
      {
        $set: {
          status: 'failed',
          'operation.error': { code: 'sandbox_unavailable', message: 'owner disconnected' }
        }
      }
    );
    expect(await forceDelete(await current())).toMatchObject({
      status: 'pending',
      reason: 'unknown_operation'
    });
    const beforeReceipt = getSandboxForceDeleteRevision(await current());
    resolveEffect?.();
    expect(await original).toBeInstanceOf(Error);
    expect(ready).not.toHaveBeenCalled();
    expect(await current()).toMatchObject({
      status: 'deleting',
      forceDeletion: { previousOperation: { effectState: 'completed' } }
    });
    expect(getSandboxForceDeleteRevision(await current())).not.toBe(beforeReceipt);
    expect(await forceDelete(await current())).toMatchObject({ status: 'deleted' });
  });
  it('deletes a failed workspace and all files through the control plane when execd is unhealthy', async () => {
    const instance = await seed();
    const result = await forceDelete(instance);
    expect(result).toMatchObject({ success: true, status: 'deleted' });
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toBeNull();
    expect(fake.remote).toBeNull();
    expect(fake.deleteVolume).toHaveBeenCalledWith(
      sandboxId,
      expect.objectContaining({
        binding: expect.objectContaining({ target: 'original-volume' })
      })
    );
    expect(fake.removeArchive).toHaveBeenCalledWith(sandboxId, archiveKey);
    expect(fake.connect).not.toHaveBeenCalled();
    expect(fake.create).not.toHaveBeenCalled();
  });

  it('continues file cleanup when the exact compute instance is already absent', async () => {
    const instance = await seed();
    fake.remote = null;
    expect(await forceDelete(instance)).toMatchObject({ success: true, status: 'deleted' });
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toBeNull();
    expect(fake.deleteVolume).toHaveBeenCalledOnce();
  });

  it('retains the deletion checkpoint when volume cleanup fails', async () => {
    const instance = await seed();
    fake.deleteVolume.mockRejectedValueOnce(new Error('volume manager unavailable'));
    expect(await forceDelete(instance)).toMatchObject({ success: false, status: 'pending' });
    expect(await current()).toMatchObject({
      status: 'deleting',
      capacityReserved: false,
      storage,
      forceDeletion: { previousOperation: { id: 'failed-operation' } },
      operation: { type: 'delete', checkpoint: 'provider_deleted' }
    });
    expect(fake.removeArchive).not.toHaveBeenCalled();
    await expect(getSandboxClient({ sandboxId })).rejects.toThrow('operation_conflict');
  });
});
