import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import {
  getExistingSandboxClient,
  getSandboxClient
} from '@fastgpt/service/core/ai/sandbox/controller';
import { getSandboxProviderScope } from '@fastgpt/service/core/ai/sandbox/config';
import { getSandboxForceDeleteRevision } from '@fastgpt/service/core/ai/sandbox/forceDeletePolicy';
import { createLeaseRedisEval } from './leaseRedisMock';

const fake = vi.hoisted(() => ({
  redis: new Map<string, { token: string; expiresAt: number }>(),
  exists: true,
  baseUrl: 'http://sandbox.test',
  inspect: vi.fn(),
  deleteCompute: vi.fn(),
  connect: vi.fn(),
  create: vi.fn(),
  deleteVolume: vi.fn(),
  removeArchive: vi.fn()
}));
vi.mock('@fastgpt/service/env', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/env')>()),
  env: {
    AGENT_SANDBOX_PROVIDER: 'opensandbox',
    AGENT_SANDBOX_OPENSANDBOX_RUNTIME: 'docker',
    get AGENT_SANDBOX_OPENSANDBOX_BASEURL() {
      return fake.baseUrl;
    },
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
      return fake.exists ? 'original-compute' : undefined;
    }
    inspectExisting = fake.inspect;
    deleteExisting = fake.deleteCompute;
    connectExisting = fake.connect;
    ensureRunning = fake.create;
    getInfo = fake.inspect;
  }
  return { ...actual, OpenSandboxAdapter, createSandbox: () => new OpenSandboxAdapter() };
});
vi.mock('@fastgpt/service/core/ai/sandbox/config', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/ai/sandbox/config')>()),
  deleteSessionVolume: fake.deleteVolume
}));
vi.mock('@fastgpt/service/core/ai/sandbox/archiveStorage', () => ({
  getSandboxArchiveStorage: () => ({ remove: fake.removeArchive })
}));

const sandboxId = 'forced-delete-safety-workspace';
const archiveKey = 'sandbox/archive/forced-delete-safety/retained.tar.gz';
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
const forceDelete = async (
  instance: Awaited<ReturnType<typeof seed>>,
  assertAuthorized: () => Promise<void> = async () => {}
) =>
  getExistingSandboxClient(instance).forceDelete({
    deletionRevision: getSandboxForceDeleteRevision(instance),
    assertAuthorized
  });

beforeEach(async () => {
  vi.clearAllMocks();
  fake.redis.clear();
  fake.exists = true;
  fake.baseUrl = 'http://sandbox.test';
  fake.inspect.mockImplementation(async () =>
    fake.exists ? { id: 'original-compute', status: { state: 'Running' } } : null
  );
  fake.deleteCompute.mockImplementation(async () => {
    fake.exists = false;
  });
  fake.connect.mockRejectedValue(new Error('execd is unreachable'));
  fake.deleteVolume.mockResolvedValue(undefined);
  fake.removeArchive.mockResolvedValue(undefined);
  await MongoSandboxInstance.deleteMany({});
});

const expectNoRemoteEffects = () => {
  expect(fake.deleteCompute).not.toHaveBeenCalled();
  expect(fake.deleteVolume).not.toHaveBeenCalled();
  expect(fake.removeArchive).not.toHaveBeenCalled();
  expect(fake.connect).not.toHaveBeenCalled();
  expect(fake.create).not.toHaveBeenCalled();
};

describe('forced deletion safety and recovery', () => {
  it('retains files if the old ID is absent but the session owns another compute instance', async () => {
    const instance = await seed();
    fake.inspect.mockImplementation(async (id?: string) =>
      id
        ? null
        : {
            id: 'late-created-compute',
            status: { state: 'Running' }
          }
    );
    expect(await forceDelete(instance)).toMatchObject({
      status: 'pending',
      reason: 'ownership_conflict'
    });
    expectNoRemoteEffects();
    expect((await current()).storage).toEqual(storage);
  });

  it('retains deletion barriers for an unknown volume ensure within an old stop operation', async () => {
    const instance = await seed({
      operation: {
        id: 'old-stop',
        type: 'stop',
        checkpoint: 'volume_ensure',
        startedAt: new Date(0),
        updatedAt: new Date(0),
        effectState: 'pending',
        failureDisposition: 'unknown',
        error: { code: 'sandbox_stop_failed', message: 'volume ensure timed out' }
      }
    });
    expect(await forceDelete(instance)).toMatchObject({
      status: 'pending',
      reason: 'unknown_operation'
    });
    expectNoRemoteEffects();
    expect(await current()).toMatchObject({
      status: 'deleting',
      forceDeletion: { previousOperation: { id: 'old-stop' } }
    });
  });
  it('rejects an obsolete confirmation revision without changing the newer record', async () => {
    const instance = await seed();
    await MongoSandboxInstance.updateOne(
      { sandboxId },
      { $set: { 'operation.updatedAt': new Date() } }
    );
    const before = await current();

    const result = await forceDelete(instance);

    expect(result).toMatchObject({ success: false, status: 'pending', reason: 'stale' });
    expect(await current()).toEqual(before);
    expect(fake.inspect).not.toHaveBeenCalled();
    expectNoRemoteEffects();
  });

  it('rejects a changed workspace owner without changing the new owner record', async () => {
    const instance = await seed();
    await MongoSandboxInstance.updateOne(
      { sandboxId },
      { $set: { runtimeUserId: 'new-owner', userId: 'new-owner' } }
    );
    const before = await current();

    const result = await forceDelete(instance);

    expect(result).toMatchObject({
      success: false,
      status: 'pending',
      reason: 'ownership_conflict'
    });
    expect(await current()).toEqual(before);
    expect(fake.inspect).not.toHaveBeenCalled();
    expectNoRemoteEffects();
  });

  it.each([1, 2])(
    'has zero side effects when authorization is revoked at check %s',
    async (rejectAt) => {
      const instance = await seed();
      const before = await current();
      let checks = 0;
      const assertAuthorized = async () => {
        if (++checks === rejectAt) throw new Error('permission revoked');
      };

      const result = await forceDelete(instance, assertAuthorized);

      expect(result).toMatchObject({ success: false, status: 'pending' });
      expect(checks).toBe(rejectAt);
      expect(await current()).toEqual(before);
      expect(fake.inspect).not.toHaveBeenCalled();
      expectNoRemoteEffects();
    }
  );

  it('does not contact a replacement deployment after the current provider scope changes', async () => {
    const instance = await seed();
    const before = await current();
    fake.baseUrl = 'http://replacement-provider.test';

    const result = await forceDelete(instance);

    expect(result).toMatchObject({
      success: false,
      status: 'pending',
      reason: 'ownership_conflict'
    });
    expect(await current()).toEqual(before);
    expect(fake.inspect).not.toHaveBeenCalled();
    expectNoRemoteEffects();
  });

  it.each(['provider_ensure', 'volume_ensure'])(
    'retains files and deleting state when an original %s effect has an unknown outcome',
    async (checkpoint) => {
      const instance = await seed({
        operation: {
          id: 'unknown-create',
          type: 'provision',
          checkpoint,
          startedAt: new Date(0),
          updatedAt: new Date(0),
          heartbeatAt: new Date(0),
          effectState: 'pending',
          failureDisposition: 'unknown',
          error: { code: 'sandbox_unavailable', message: 'receipt missing' }
        }
      });

      const result = await forceDelete(instance);

      expect(result).toMatchObject({
        success: false,
        status: 'pending',
        reason: 'unknown_operation'
      });
      expect(await current()).toMatchObject({
        status: 'deleting',
        capacityReserved: true,
        storage,
        archiveKeys: [archiveKey],
        forceDeletion: {
          previousOperation: { id: 'unknown-create', checkpoint, effectState: 'pending' }
        }
      });
      expect(fake.inspect).not.toHaveBeenCalled();
      expectNoRemoteEffects();
    }
  );

  it('resumes volume cleanup from provider_deleted without deleting compute again', async () => {
    const instance = await seed();
    fake.deleteVolume.mockRejectedValueOnce(new Error('volume manager unavailable'));
    expect(await forceDelete(instance)).toMatchObject({ success: false, status: 'pending' });
    const pending = await current();
    expect(pending).toMatchObject({
      status: 'deleting',
      operation: { checkpoint: 'provider_deleted' }
    });
    expect(fake.removeArchive).not.toHaveBeenCalled();

    const result = await forceDelete(pending);

    expect(result).toMatchObject({ success: true, status: 'deleted' });
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toBeNull();
    expect(fake.deleteCompute).toHaveBeenCalledOnce();
    expect(fake.deleteVolume).toHaveBeenCalledTimes(2);
    expect(fake.removeArchive).toHaveBeenCalledWith(sandboxId, archiveKey);
    expect(fake.create).not.toHaveBeenCalled();
    expect(fake.connect).not.toHaveBeenCalled();
  });

  it('resumes archive cleanup from volume_deleted without deleting compute or volume again', async () => {
    const instance = await seed();
    fake.removeArchive.mockRejectedValueOnce(new Error('archive storage unavailable'));
    expect(await forceDelete(instance)).toMatchObject({ success: false, status: 'pending' });
    const pending = await current();
    expect(pending).toMatchObject({
      status: 'deleting',
      archiveKeys: [archiveKey],
      operation: { checkpoint: 'volume_deleted' }
    });

    const result = await forceDelete(pending);

    expect(result).toMatchObject({ success: true, status: 'deleted' });
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toBeNull();
    expect(fake.deleteCompute).toHaveBeenCalledOnce();
    expect(fake.deleteVolume).toHaveBeenCalledOnce();
    expect(fake.removeArchive).toHaveBeenCalledTimes(2);
    expect(fake.create).not.toHaveBeenCalled();
    expect(fake.connect).not.toHaveBeenCalled();
  });

  it('resumes file cleanup after DELETE times out and exact-id inspection confirms absence', async () => {
    const instance = await seed();
    fake.deleteCompute.mockImplementationOnce(async () => {
      fake.exists = false;
      throw new Error('provider DELETE timed out');
    });
    expect(await forceDelete(instance)).toMatchObject({ success: false, status: 'pending' });
    const pending = await current();
    expect(pending).toMatchObject({
      status: 'deleting',
      capacityReserved: true,
      operation: { checkpoint: 'provider_delete', providerSandboxId: 'original-compute' }
    });
    expect(fake.deleteVolume).not.toHaveBeenCalled();
    expect(fake.removeArchive).not.toHaveBeenCalled();

    const result = await forceDelete(pending);

    expect(result).toMatchObject({ success: true, status: 'deleted' });
    expect(fake.inspect).toHaveBeenCalledWith('original-compute');
    expect(fake.inspect).toHaveBeenLastCalledWith();
    expect(fake.deleteCompute).toHaveBeenCalledOnce();
    expect(fake.deleteVolume).toHaveBeenCalledOnce();
    expect(fake.removeArchive).toHaveBeenCalledWith(sandboxId, archiveKey);
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toBeNull();
    expect(fake.create).not.toHaveBeenCalled();
    expect(fake.connect).not.toHaveBeenCalled();
  });
});
