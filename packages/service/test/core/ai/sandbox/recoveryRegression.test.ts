import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import {
  cronJob,
  getExistingSandboxClient,
  recoverSandboxOperation
} from '@fastgpt/service/core/ai/sandbox/controller';
import { createLeaseRedisEval } from './leaseRedisMock';

const fake = vi.hoisted(() => ({
  redis: new Map<string, { token: string; expiresAt: number }>(),
  remote: null as { id: string; status: { state: string } } | null,
  inspect: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  stop: vi.fn(),
  ensureVolume: vi.fn(),
  deleteVolume: vi.fn(),
  removeArchive: vi.fn(),
  setCron: vi.fn(),
  checkTimerLock: vi.fn()
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
    AGENT_SANDBOX_SUSPEND_MINUTES: 60
  }
}));
vi.mock('@fastgpt/service/common/system/cron', () => ({ setCron: fake.setCron }));
vi.mock('@fastgpt/service/common/system/timerLock/utils', () => ({
  checkTimerLock: fake.checkTimerLock
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
    get id() {
      return fake.remote?.id;
    }
    async connectExisting() {
      return !!fake.remote;
    }
    inspectExisting = fake.inspect;
    ensureRunning = fake.create;
    delete = fake.delete;
    stop = fake.stop;
    async getInfo() {
      return fake.remote;
    }
    async close() {}
  }
  return { ...actual, OpenSandboxAdapter, createSandbox: () => new OpenSandboxAdapter() };
});
vi.mock('@fastgpt/service/core/ai/sandbox/config', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/ai/sandbox/config')>()),
  ensureSessionVolume: fake.ensureVolume,
  deleteSessionVolume: fake.deleteVolume
}));
vi.mock('@fastgpt/service/core/ai/sandbox/archiveStorage', () => ({
  getSandboxArchiveStorage: () => ({ remove: fake.removeArchive })
}));

const sandboxId = 'recovery-regression';
const archiveKey = 'sandbox/archive/recovery-regression/retained.tar.gz';
const storage = {
  mountPath: '/workspace',
  volumes: [{ name: 'workspace', claimName: 'persisted-volume', mountPath: '/workspace' }],
  volumeManager: {
    protocol: 'claimName',
    baseUrl: 'http://volume.test',
    target: 'persisted-volume',
    ensured: true
  }
};
const seed = async (extra: Record<string, unknown> = {}) =>
  (
    await MongoSandboxInstance.create({
      sandboxId,
      provider: 'opensandbox',
      status: 'running',
      capacityReserved: true,
      storage,
      metadata: {
        volumeEnabled: true,
        workspaceRoot: '/workspace',
        providerSandboxId: 'persisted-provider'
      },
      ...extra
    })
  ).toObject();

const interruptedDeletion = async (checkpoint: string, interruptedAt: Date) =>
  seed({
    status: 'deleting',
    deleteTime: interruptedAt,
    archiveKeys: [archiveKey],
    capacityReserved: !['provider_deleted', 'volume_deleted'].includes(checkpoint),
    operation: {
      id: 'interrupted-delete',
      type: 'delete',
      checkpoint,
      startedAt: interruptedAt,
      updatedAt: interruptedAt,
      heartbeatAt: interruptedAt,
      failureDisposition: 'retryable',
      effectState: 'idle'
    }
  });

const currentInstance = async () => {
  const instance = await MongoSandboxInstance.findOne({ sandboxId }).lean();
  if (!instance) throw new Error('Expected retained sandbox');
  return instance;
};

beforeEach(async () => {
  vi.clearAllMocks();
  fake.redis.clear();
  fake.remote = { id: 'persisted-provider', status: { state: 'Running' } };
  fake.inspect.mockImplementation(async () => fake.remote);
  fake.delete.mockImplementation(async () => {
    fake.remote = null;
  });
  fake.ensureVolume.mockResolvedValue('persisted-volume');
  fake.deleteVolume.mockResolvedValue(undefined);
  fake.removeArchive.mockResolvedValue(undefined);
  fake.checkTimerLock.mockResolvedValue(true);
  await MongoSandboxInstance.deleteMany({});
});

describe('interrupted sandbox lifecycle recovery regressions', () => {
  it.each(['pending', 'provider_delete', 'provider_deleted', 'volume_deleted'])(
    'continues a quarantined deletion at %s without requiring a recorded exception',
    async (checkpoint) => {
      const instance = await interruptedDeletion(checkpoint, new Date(Date.now() - 46 * 60_000));
      if (['provider_deleted', 'volume_deleted'].includes(checkpoint)) fake.remote = null;

      await getExistingSandboxClient(instance).delete();

      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toBeNull();
      expect(fake.delete).toHaveBeenCalledTimes(
        ['pending', 'provider_delete'].includes(checkpoint) ? 1 : 0
      );
      expect(fake.deleteVolume).toHaveBeenCalledTimes(checkpoint === 'volume_deleted' ? 0 : 1);
      if (checkpoint !== 'volume_deleted') {
        expect(fake.deleteVolume).toHaveBeenCalledWith(
          sandboxId,
          expect.objectContaining({
            binding: expect.objectContaining({ target: 'persisted-volume', ensured: true })
          })
        );
      }
      expect(fake.removeArchive).toHaveBeenCalledExactlyOnceWith(sandboxId, archiveKey);
      expect(fake.create).not.toHaveBeenCalled();
      expect(fake.ensureVolume).not.toHaveBeenCalled();
    }
  );

  it.each(['pending', 'provider_delete', 'provider_deleted', 'volume_deleted'])(
    'does not take over a fresh deletion at %s just because its Redis lease is absent',
    async (checkpoint) => {
      const instance = await interruptedDeletion(checkpoint, new Date());

      await expect(getExistingSandboxClient(instance).delete()).rejects.toThrow(
        'operation_conflict'
      );

      expect(await currentInstance()).toMatchObject({
        status: 'deleting',
        operation: { id: 'interrupted-delete', checkpoint }
      });
      expect(fake.delete).not.toHaveBeenCalled();
      expect(fake.deleteVolume).not.toHaveBeenCalled();
      expect(fake.removeArchive).not.toHaveBeenCalled();
    }
  );

  it('requires exact remote absence before continuing an unknown provider deletion', async () => {
    await interruptedDeletion('provider_delete', new Date(Date.now() - 46 * 60_000));
    await MongoSandboxInstance.updateOne(
      { sandboxId },
      {
        $set: {
          'operation.providerSandboxId': 'persisted-provider',
          'operation.effectState': 'pending',
          'operation.failureDisposition': 'unknown'
        }
      }
    );
    const instance = await currentInstance();
    const target = {
      provider: 'opensandbox' as const,
      sandboxId,
      operationId: 'interrupted-delete'
    };

    await expect(getExistingSandboxClient(instance).delete()).rejects.toThrow('operation_conflict');
    await expect(recoverSandboxOperation(target)).rejects.toThrow('remote_outcome_unknown');
    expect(fake.inspect).toHaveBeenCalledWith('persisted-provider');
    expect(fake.deleteVolume).not.toHaveBeenCalled();
    expect(fake.removeArchive).not.toHaveBeenCalled();

    fake.remote = null;
    await expect(recoverSandboxOperation(target)).resolves.toMatchObject({
      code: 'provider_delete_confirmed'
    });
    await getExistingSandboxClient(await currentInstance()).delete();
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toBeNull();
    expect(fake.delete).not.toHaveBeenCalled();
    expect(fake.deleteVolume).toHaveBeenCalledOnce();
    expect(fake.removeArchive).toHaveBeenCalledExactlyOnceWith(sandboxId, archiveKey);
  });

  it('recovers a failed persisted-volume check before stop without releasing capacity or stopping compute', async () => {
    const instance = await seed();
    fake.ensureVolume.mockRejectedValueOnce(new Error('volume check timed out'));
    await expect(getExistingSandboxClient(instance).stop()).rejects.toThrow(
      'volume check timed out'
    );
    const failed = await currentInstance();
    expect(failed).toMatchObject({
      status: 'failed',
      capacityReserved: true,
      operation: { type: 'stop', failureDisposition: 'unknown' }
    });
    if (!failed.operation) throw new Error('Expected failed stop operation');
    fake.ensureVolume.mockClear();

    await expect(
      recoverSandboxOperation({
        provider: 'opensandbox',
        sandboxId,
        operationId: failed.operation.id
      })
    ).resolves.toMatchObject({ code: 'pre_effect_retry_confirmed' });

    const recovered = await currentInstance();
    expect(recovered).toMatchObject({
      status: 'failed',
      capacityReserved: true,
      storage,
      operation: {
        failureDisposition: 'retryable',
        recoveredFromOperationId: failed.operation.id
      }
    });
    expect(fake.ensureVolume).not.toHaveBeenCalled();
    expect(fake.delete).not.toHaveBeenCalled();
    expect(fake.stop).not.toHaveBeenCalled();
    expect(fake.deleteVolume).not.toHaveBeenCalled();

    await getExistingSandboxClient(recovered).stop();
    expect(fake.ensureVolume).toHaveBeenCalledWith(
      sandboxId,
      expect.objectContaining({
        binding: expect.objectContaining({ target: 'persisted-volume', ensured: true })
      })
    );
    expect(fake.delete).toHaveBeenCalledOnce();
    expect(await currentInstance()).toMatchObject({
      status: 'stopped',
      capacityReserved: false,
      storage,
      operation: { checkpoint: 'provider_stopped' }
    });
    expect(fake.create).not.toHaveBeenCalled();
    expect(fake.deleteVolume).not.toHaveBeenCalled();
  });

  it('recovers a legacy pending stop whose only dispatched effect was persisted-volume validation', async () => {
    const interruptedAt = new Date(Date.now() - 46 * 60_000);
    await seed({
      status: 'failed',
      operation: {
        id: 'legacy-pending-stop',
        type: 'stop',
        checkpoint: 'pending',
        startedAt: interruptedAt,
        updatedAt: interruptedAt,
        heartbeatAt: interruptedAt,
        effectState: 'pending',
        failureDisposition: 'unknown',
        error: { code: 'sandbox_stop_failed', message: 'volume check timed out' }
      }
    });

    await expect(
      recoverSandboxOperation({
        provider: 'opensandbox',
        sandboxId,
        operationId: 'legacy-pending-stop'
      })
    ).resolves.toMatchObject({ code: 'pre_effect_retry_confirmed' });

    expect(await currentInstance()).toMatchObject({
      status: 'failed',
      capacityReserved: true,
      storage,
      operation: { failureDisposition: 'retryable' }
    });
    expect(fake.ensureVolume).not.toHaveBeenCalled();
    expect(fake.delete).not.toHaveBeenCalled();
    expect(fake.stop).not.toHaveBeenCalled();
  });

  it.each([
    ['inactive', 90, true],
    ['recently active', 0, false]
  ] as const)(
    'scheduled recovery completes an interrupted stop only when the sandbox is %s',
    async (_activity, lastActiveMinutesAgo, shouldStop) => {
      const interruptedAt = new Date(Date.now() - 46 * 60_000);
      await seed({
        status: 'failed',
        lastActiveAt: new Date(Date.now() - lastActiveMinutesAgo * 60_000),
        operation: {
          id: 'scheduled-interrupted-stop',
          type: 'stop',
          checkpoint: 'pending',
          startedAt: interruptedAt,
          updatedAt: interruptedAt,
          heartbeatAt: interruptedAt,
          effectState: 'pending',
          failureDisposition: 'unknown',
          error: { code: 'sandbox_stop_failed', message: 'volume check timed out' }
        }
      });
      await cronJob();
      const recovery = fake.setCron.mock.calls.filter(
        ([schedule]) => schedule === '*/10 * * * *'
      )[1];
      if (!recovery) throw new Error('Expected scheduled lifecycle recovery');

      await recovery[1]();

      expect(fake.checkTimerLock).toHaveBeenCalledWith({
        timerId: expect.stringMatching(/^sandboxLifecycleRecovery:/),
        lockMinuted: 9
      });
      expect(await currentInstance()).toMatchObject({
        status: shouldStop ? 'stopped' : 'failed',
        capacityReserved: !shouldStop,
        storage
      });
      expect(fake.ensureVolume).toHaveBeenCalledTimes(shouldStop ? 1 : 0);
      expect(fake.delete).toHaveBeenCalledTimes(shouldStop ? 1 : 0);
      expect(fake.create).not.toHaveBeenCalled();
      expect(fake.deleteVolume).not.toHaveBeenCalled();
      expect(fake.removeArchive).not.toHaveBeenCalled();
    }
  );
});
