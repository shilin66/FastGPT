import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import {
  getExistingSandboxClient,
  getSandboxClient
} from '@fastgpt/service/core/ai/sandbox/controller';
import { createLeaseRedisEval } from './leaseRedisMock';
import { sweepOrphanSandboxes } from '@fastgpt/service/core/ai/sandbox/orphan';
import { MongoApp } from '@fastgpt/service/core/app/schema';

const fake = vi.hoisted(() => ({
  remote: null as {
    id: string;
    status: { state: string };
    image?: { repository: string; tag?: string };
  } | null,
  events: [] as string[],
  redis: new Map<string, { token: string; expiresAt: number }>(),
  upload: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
  pack: vi.fn(),
  install: vi.fn(),
  ensureVolume: vi.fn(),
  deleteVolume: vi.fn(),
  lookupError: false
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
    AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: 'image',
    AGENT_SANDBOX_ARCHIVE_MAX_BYTES: 1024 * 1024
  }
}));
vi.mock('@fastgpt/service/common/redis', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/common/redis')>()),
  getGlobalRedisConnection: () => ({
    set: async (key: string, token: string, _mode: string, ttl: number) => {
      if (fake.redis.has(key)) return null;
      fake.redis.set(key, { token, expiresAt: Date.now() + ttl });
      return 'OK';
    },
    eval: createLeaseRedisEval(fake.redis)
  })
}));
vi.mock('@fastgpt-sdk/sandbox-adapter', async (original) => {
  const actual = await original<typeof import('@fastgpt-sdk/sandbox-adapter')>();
  class OpenSandboxAdapter {
    provider = 'opensandbox' as const;
    rootPath = '/workspace';
    constructor(private readonly image = { repository: 'image' }) {}
    get id() {
      return fake.remote?.id;
    }
    async connectExisting() {
      return !!fake.remote;
    }
    async inspectExisting() {
      if (fake.lookupError) throw new Error('provider lookup failed');
      return fake.remote;
    }
    async ensureRunning() {
      fake.events.push('provider-create');
      fake.remote = { id: 'remote', status: { state: 'Running' }, image: this.image };
    }
    async getInfo() {
      return fake.remote;
    }
    async delete() {
      fake.events.push('provider-delete');
      fake.remote = null;
    }
    async close() {}
  }
  return {
    ...actual,
    OpenSandboxAdapter,
    createSandbox: (
      _provider: unknown,
      _connection: unknown,
      config?: { image?: { repository: string; tag?: string } }
    ) => new OpenSandboxAdapter(config?.image)
  };
});
vi.mock('@fastgpt/service/core/ai/sandbox/archiveIO', () => ({
  createWorkspaceArchive: fake.pack,
  installWorkspaceArchive: fake.install
}));
vi.mock('@fastgpt/service/core/ai/sandbox/archiveStorage', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/ai/sandbox/archiveStorage')>()),
  getSandboxArchiveStorage: () => ({
    upload: fake.upload,
    download: fake.download,
    remove: fake.remove
  })
}));
vi.mock('@fastgpt/service/core/ai/sandbox/config', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/ai/sandbox/config')>()),
  getVolumeManagerConfig: fake.ensureVolume,
  ensureSessionVolume: vi.fn().mockResolvedValue('original-volume'),
  deleteSessionVolume: fake.deleteVolume
}));

const buffer = Buffer.from('verified-workspace-archive');
const hash = createHash('sha256').update(buffer).digest('hex');
const seed = async () =>
  (
    await MongoSandboxInstance.create({
      sandboxId: 'archive-test',
      provider: 'opensandbox',
      status: 'stopped',
      capacityReserved: false,
      releasedAt: new Date(),
      lastActiveAt: new Date('2026-01-01'),
      storage: {
        mountPath: '/workspace',
        volumes: [{ name: 'workspace', claimName: 'original-volume', mountPath: '/workspace' }],
        volumeManager: {
          protocol: 'claimName',
          baseUrl: 'http://volume.test',
          target: 'original-volume',
          ensured: true
        }
      },
      metadata: { volumeEnabled: true, workspaceRoot: '/workspace', providerSandboxId: 'remote' },
      operation: {
        id: 'original',
        type: 'release',
        checkpoint: 'provider_released',
        startedAt: new Date(),
        updatedAt: new Date(),
        failureDisposition: 'retryable'
      }
    })
  ).toObject();

beforeEach(async () => {
  vi.clearAllMocks();
  fake.events.length = 0;
  fake.remote = null;
  fake.lookupError = false;
  fake.redis.clear();
  await MongoSandboxInstance.deleteMany({});
  fake.pack.mockResolvedValue({ buffer, size: buffer.length, hash });
  fake.download.mockResolvedValue(buffer);
  fake.upload.mockImplementation(async () => {
    fake.events.push('upload-verified');
  });
  fake.install.mockImplementation(async () => {
    fake.events.push('installed');
  });
  fake.deleteVolume.mockImplementation(async () => {
    fake.events.push('volume-delete');
  });
  fake.ensureVolume.mockImplementation(
    async (
      _id: string,
      prepared: { storage: object; mountPath: string; binding: { target: string } }
    ) => ({
      storage: { ...prepared.storage, volumeManager: { ...prepared.binding, ensured: true } },
      volumes: [
        {
          name: 'workspace',
          pvc: { claimName: prepared.binding.target },
          mountPath: prepared.mountPath
        }
      ]
    })
  );
});

describe('cold archive lifecycle', () => {
  const providerScope = createHash('sha256')
    .update(JSON.stringify(['opensandbox', 'docker', 'http://sandbox.test']))
    .digest('hex');
  const appId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const sweepStart = new Date('2026-10-01');
  const sweepReady = new Date('2026-10-03');
  const sweep = (now: Date) =>
    sweepOrphanSandboxes({ provider: 'opensandbox', now, graceHours: 24, batchSize: 10 });
  const seedOrphan = async (fields: Record<string, unknown> = {}) => {
    await seed();
    await MongoSandboxInstance.updateOne(
      {},
      {
        $set: {
          sourceType: 'appRuntime',
          sourceId: appId,
          runtimeUserId: 'user',
          reuseScope: 'session',
          sessionId: 'missing-chat',
          ...fields
        }
      }
    );
  };

  it('retains a running orphan when this provider cannot resolve its persisted compute id', async () => {
    await seedOrphan({
      status: 'running',
      operation: {
        id: 'ready',
        type: 'start',
        checkpoint: 'ready',
        startedAt: sweepStart,
        updatedAt: sweepStart
      }
    });
    await sweep(sweepStart);
    await sweep(sweepReady);
    expect(await MongoSandboxInstance.countDocuments()).toBe(1);
    expect(fake.deleteVolume).not.toHaveBeenCalled();
  });

  it('cleans an inactive running orphan when the provider confirms its exact compute id', async () => {
    await seedOrphan({
      status: 'running',
      operation: {
        id: 'ready',
        type: 'start',
        checkpoint: 'ready',
        startedAt: sweepStart,
        updatedAt: sweepStart
      }
    });
    fake.remote = { id: 'remote', status: { state: 'Running' } };
    await sweep(sweepStart);
    await sweep(sweepReady);
    expect(fake.events).toEqual(['provider-delete', 'volume-delete']);
    expect(await MongoSandboxInstance.countDocuments()).toBe(0);
  });

  it('cleans volume and archives when the bound provider confirms compute is already absent', async () => {
    const archiveKey = 'sandbox/archive/archive-test/12345678-1234-1234-1234-123456789abc.tar.gz';
    await seedOrphan({
      status: 'running',
      capacityReserved: true,
      archiveKeys: [archiveKey],
      operation: {
        id: 'ready',
        type: 'start',
        checkpoint: 'ready',
        startedAt: sweepStart,
        updatedAt: sweepStart
      }
    });
    await MongoSandboxInstance.collection.updateOne({}, { $set: { providerScope } });
    await sweep(sweepStart);
    await sweep(sweepReady);
    expect(await MongoSandboxInstance.countDocuments()).toBe(0);
    expect(fake.events).toEqual(['volume-delete']);
    expect(fake.remove).toHaveBeenCalledWith('archive-test', archiveKey);
  });

  it('retains a provider-bound orphan after a lookup failure', async () => {
    await seedOrphan({
      status: 'running',
      capacityReserved: true,
      operation: {
        id: 'ready',
        type: 'start',
        checkpoint: 'ready',
        startedAt: sweepStart,
        updatedAt: sweepStart
      }
    });
    await MongoSandboxInstance.collection.updateOne({}, { $set: { providerScope } });
    fake.lookupError = true;
    await sweep(sweepStart);
    await sweep(sweepReady);
    expect(await MongoSandboxInstance.countDocuments()).toBe(1);
    expect(fake.deleteVolume).not.toHaveBeenCalled();
    expect(fake.remove).not.toHaveBeenCalled();
  });

  it('rejects a different provider deployment even when a remote id happens to match', async () => {
    await seedOrphan();
    await MongoSandboxInstance.collection.updateOne(
      {},
      { $set: { providerScope: 'another-deployment' } }
    );
    fake.remote = { id: 'remote', status: { state: 'Running' } };
    await sweep(sweepStart);
    await sweep(sweepReady);
    expect(await MongoSandboxInstance.countDocuments()).toBe(1);
    expect(fake.events).toEqual([]);
  });

  it('persists the provider deployment before a new compute instance is created', async () => {
    fake.ensureVolume.mockImplementationOnce(async (_id, prepared) => {
      expect(
        await MongoSandboxInstance.findOne({ sandboxId: 'new-workspace' }).lean()
      ).toMatchObject({ providerScope });
      return { storage: prepared.storage, volumes: [] };
    });
    await getSandboxClient({ sandboxId: 'new-workspace' });
    expect(await MongoSandboxInstance.findOne({ sandboxId: 'new-workspace' }).lean()).toMatchObject(
      { providerScope }
    );
  });

  it('attests legacy provider ownership before releasing its known compute instance', async () => {
    await seedOrphan({
      status: 'running',
      operation: {
        id: 'ready',
        type: 'start',
        checkpoint: 'ready',
        startedAt: sweepStart,
        updatedAt: sweepStart
      }
    });
    fake.remote = { id: 'remote', status: { state: 'Running' } };
    await getExistingSandboxClient((await MongoSandboxInstance.findOne().lean())!).stop();
    expect(await MongoSandboxInstance.findOne().lean()).toMatchObject({
      providerScope,
      status: 'stopped'
    });
  });

  it('recovers a confirmed provider delete receipt before resuming volume cleanup', async () => {
    await seedOrphan({
      providerScope,
      status: 'deleting',
      deleteTime: sweepStart,
      operation: {
        id: 'interrupted',
        type: 'delete',
        checkpoint: 'provider_delete',
        providerSandboxId: 'remote',
        startedAt: sweepStart,
        updatedAt: sweepStart,
        heartbeatAt: sweepStart,
        effectState: 'pending',
        failureDisposition: 'unknown'
      }
    });
    await sweep(sweepStart);
    await sweep(sweepReady);
    expect(fake.events).toEqual(['volume-delete']);
    expect(await MongoSandboxInstance.countDocuments()).toBe(0);
  });

  it('retains an uncertain legacy delete when provider absence has no deployment binding', async () => {
    await seedOrphan({
      status: 'deleting',
      deleteTime: sweepStart,
      operation: {
        id: 'legacy-interrupted',
        type: 'delete',
        checkpoint: 'provider_delete',
        providerSandboxId: 'remote',
        startedAt: sweepStart,
        updatedAt: sweepStart,
        heartbeatAt: sweepStart,
        effectState: 'pending',
        failureDisposition: 'unknown'
      }
    });
    await sweep(sweepStart);
    await sweep(sweepReady);
    expect(await MongoSandboxInstance.countDocuments()).toBe(1);
    expect(fake.deleteVolume).not.toHaveBeenCalled();
    expect(fake.remove).not.toHaveBeenCalled();
  });

  it('orphan sweep uses verified archive upload before releasing a legacy chat volume', async () => {
    await MongoApp.collection.insertOne({ _id: new MongoApp.base.Types.ObjectId(appId) });
    await seedOrphan();
    await sweep(sweepStart);
    await sweep(sweepReady);
    expect(fake.events).toEqual([
      'provider-create',
      'upload-verified',
      'provider-delete',
      'volume-delete'
    ]);
    expect(await MongoSandboxInstance.findOne().lean()).toMatchObject({
      status: 'archived',
      archive: { hash }
    });
    expect(fake.remove).not.toHaveBeenCalled();
  });

  it('orphan deletion retries an exact volume binding and all S3 archives after partial failure', async () => {
    const archiveKey = 'sandbox/archive/archive-test/12345678-1234-1234-1234-123456789abc.tar.gz';
    await seedOrphan({ archiveKeys: [archiveKey] });
    await sweep(sweepStart);
    fake.deleteVolume.mockRejectedValueOnce(new Error('volume unavailable'));
    await sweep(sweepReady);
    expect(await MongoSandboxInstance.findOne().lean()).toMatchObject({
      status: 'deleting',
      operation: { checkpoint: 'provider_deleted', failureDisposition: 'retryable' }
    });
    expect(fake.remove).not.toHaveBeenCalled();
    await sweep(sweepReady);
    expect(fake.deleteVolume).toHaveBeenLastCalledWith(
      'archive-test',
      expect.objectContaining({ binding: expect.objectContaining({ target: 'original-volume' }) })
    );
    expect(fake.remove).toHaveBeenCalledWith('archive-test', archiveKey);
    expect(await MongoSandboxInstance.countDocuments()).toBe(0);
  });

  it('orphan deletion retains the S3 receipt and retries when archive removal fails', async () => {
    const archiveKey = 'sandbox/archive/archive-test/12345678-1234-1234-1234-123456789abc.tar.gz';
    await seedOrphan({ archiveKeys: [archiveKey] });
    await sweep(sweepStart);
    fake.remove.mockRejectedValueOnce(new Error('S3 unavailable'));
    await sweep(sweepReady);
    expect(await MongoSandboxInstance.findOne().lean()).toMatchObject({
      archiveKeys: [archiveKey],
      operation: { checkpoint: 'volume_deleted' }
    });
    await sweep(sweepReady);
    expect(fake.remove).toHaveBeenCalledTimes(2);
    expect(fake.deleteVolume).toHaveBeenCalledOnce();
    expect(await MongoSandboxInstance.countDocuments()).toBe(0);
  });

  it('verifies the archive before deleting provider and volume and keeps lastActiveAt', async () => {
    const before = await seed();
    await getExistingSandboxClient(before).archive();
    expect(fake.events).toEqual([
      'provider-create',
      'upload-verified',
      'provider-delete',
      'volume-delete'
    ]);
    const saved = await MongoSandboxInstance.findOne({ sandboxId: before.sandboxId }).lean();
    expect(saved).toMatchObject({
      status: 'archived',
      capacityReserved: false,
      lastActiveAt: before.lastActiveAt,
      archive: { hash, size: buffer.length }
    });
  });

  it('retains the online volume when upload verification fails', async () => {
    const before = await seed();
    fake.upload.mockRejectedValueOnce(new Error('upload rejected'));
    await expect(getExistingSandboxClient(before).archive()).rejects.toThrow('upload rejected');
    expect(fake.deleteVolume).not.toHaveBeenCalled();
    expect(fake.events).not.toContain('provider-delete');
    expect(
      await MongoSandboxInstance.findOne({ sandboxId: before.sandboxId }).lean()
    ).toMatchObject({ status: 'archiving', storage: before.storage });
  });

  it('restores into a new persisted volume and retains the source archive', async () => {
    const before = await seed();
    await getExistingSandboxClient(before).archive();
    fake.events.length = 0;
    await getSandboxClient({ sandboxId: before.sandboxId });
    const saved = await MongoSandboxInstance.findOne({ sandboxId: before.sandboxId }).lean();
    expect(saved?.status).toBe('running');
    expect(saved?.storage?.volumes?.[0]?.claimName).not.toBe('original-volume');
    expect(saved?.archive?.hash).toBe(hash);
    expect(fake.install).toHaveBeenCalledOnce();
    expect(fake.remove).not.toHaveBeenCalled();
  });

  it('idle stop deletes only compute and retains the persistent workspace', async () => {
    const before = await seed();
    await MongoSandboxInstance.updateOne(
      { sandboxId: before.sandboxId },
      {
        $set: {
          status: 'running',
          capacityReserved: true,
          'operation.type': 'start',
          'operation.checkpoint': 'ready'
        }
      }
    );
    fake.remote = { id: 'remote', status: { state: 'Running' }, image: { repository: 'image' } };
    const running = await MongoSandboxInstance.findOne({ sandboxId: before.sandboxId }).lean();
    await getExistingSandboxClient(running!).stop();
    expect(fake.events).toEqual(['provider-delete']);
    expect(fake.deleteVolume).not.toHaveBeenCalled();
    expect(
      await MongoSandboxInstance.findOne({ sandboxId: before.sandboxId }).lean()
    ).toMatchObject({ status: 'stopped', storage: before.storage, capacityReserved: false });
  });

  it('reuses the assigned generation after interrupted restoration without removing the archive', async () => {
    const before = await seed();
    await getExistingSandboxClient(before).archive();
    fake.install.mockRejectedValueOnce(new Error('installation interrupted'));
    await expect(getSandboxClient({ sandboxId: before.sandboxId })).rejects.toThrow(
      'installation interrupted'
    );
    const failed = await MongoSandboxInstance.findOne({ sandboxId: before.sandboxId }).lean();
    expect(failed?.status).toBe('restoring');
    const target = failed?.storage?.volumes?.[0]?.claimName;
    await MongoSandboxInstance.updateOne(
      { sandboxId: before.sandboxId },
      { $set: { 'operation.heartbeatAt': new Date(Date.now() - 46 * 60000) } }
    );
    await getSandboxClient({ sandboxId: before.sandboxId });
    const restored = await MongoSandboxInstance.findOne({ sandboxId: before.sandboxId }).lean();
    expect(restored?.status).toBe('running');
    expect(restored?.storage?.volumes?.[0]?.claimName).toBe(target);
    expect(restored?.archive?.hash).toBe(hash);
    expect(fake.remove).not.toHaveBeenCalled();
    expect(target!.length).toBeLessThanOrEqual(63);
  });

  it('archives the old image workspace before rebuilding with the requested image', async () => {
    const before = await seed();
    await MongoSandboxInstance.updateOne(
      { sandboxId: before.sandboxId },
      {
        $set: {
          status: 'running',
          'metadata.image': { repository: 'old-image' },
          'operation.type': 'start',
          'operation.checkpoint': 'ready'
        }
      }
    );
    fake.remote = {
      id: 'remote',
      status: { state: 'Running' },
      image: { repository: 'old-image' }
    };
    fake.pack.mockImplementationOnce(async () => {
      expect(fake.remote?.image?.repository).toBe('old-image');
      return { buffer, size: buffer.length, hash };
    });
    const { upgradeSandboxImage } = await import('@fastgpt/service/core/ai/sandbox/archive');
    await upgradeSandboxImage(
      (await MongoSandboxInstance.findOne({ sandboxId: before.sandboxId }).lean())!,
      { image: { repository: 'new-image' } }
    );
    const upgraded = await MongoSandboxInstance.findOne({ sandboxId: before.sandboxId }).lean();
    expect(upgraded).toMatchObject({
      status: 'running',
      metadata: { image: { repository: 'new-image' } },
      archive: { hash }
    });
    expect(fake.events.indexOf('upload-verified')).toBeLessThan(fake.events.indexOf('installed'));
    expect(fake.remote?.image?.repository).toBe('new-image');
  });

  it('removes archive after online resources and before the database record', async () => {
    const before = await seed();
    await getExistingSandboxClient(before).archive();
    const saved = await MongoSandboxInstance.findOne({ sandboxId: before.sandboxId }).lean();
    fake.remove.mockImplementationOnce(async () => {
      expect(await MongoSandboxInstance.exists({ sandboxId: before.sandboxId })).not.toBeNull();
      fake.events.push('archive-delete');
    });
    await getExistingSandboxClient(saved!).delete();
    expect(fake.events.at(-1)).toBe('archive-delete');
    expect(await MongoSandboxInstance.exists({ sandboxId: before.sandboxId })).toBeNull();
  });
});
