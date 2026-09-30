import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { MongoTimerLock } from '@fastgpt/service/common/system/timerLock/schema';
import {
  getSandboxClient,
  getChatSandboxClient,
  getExistingSandboxClient,
  deleteSandboxesByAppId,
  deleteSandboxesByChatIds,
  diagnoseSandboxOperation,
  recoverSandboxOperation,
  runSandboxActivity,
  cronJob
} from '@fastgpt/service/core/ai/sandbox/controller';
import { withSandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';
import { runSandboxOperation } from '@fastgpt/service/core/ai/sandbox/operation';
import { generateSandboxIdentityId } from '@fastgpt/service/core/ai/sandbox/identity';

const {
  providerEnsure,
  providerStop,
  providerDelete,
  providerExecute,
  providerInspect,
  providerConnect,
  volumeEnsure,
  volumeDelete,
  redisSet,
  redisEval,
  redisStorage,
  createProvider,
  setCron,
  volumeSettings
} = vi.hoisted(() => ({
  providerEnsure: vi.fn(),
  providerStop: vi.fn(),
  providerDelete: vi.fn(),
  providerExecute: vi.fn(),
  providerInspect: vi.fn(),
  providerConnect: vi.fn(),
  volumeEnsure: vi.fn(),
  volumeDelete: vi.fn(),
  redisSet: vi.fn(),
  redisEval: vi.fn(),
  redisStorage: new Map<string, { token: string; expiresAt: number }>(),
  createProvider: vi.fn(),
  setCron: vi.fn(),
  volumeSettings: { enabled: true }
}));

vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/env')>();
  return {
    env: {
      ...original.env,
      AGENT_SANDBOX_PROVIDER: 'opensandbox',
      get AGENT_SANDBOX_ENABLE_VOLUME() {
        return volumeSettings.enabled;
      },
      AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://sandbox.example.test',
      AGENT_SANDBOX_VOLUME_MANAGER_URL: 'http://volume.test',
      AGENT_SANDBOX_SEALOS_BASEURL: 'http://sandbox.example.test',
      AGENT_SANDBOX_SEALOS_TOKEN: 'test-token',
      AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: 'test-image'
    }
  };
});
vi.mock('@fastgpt-sdk/sandbox-adapter', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt-sdk/sandbox-adapter')>();
  class OpenSandboxAdapter {
    readonly provider = 'opensandbox';
    readonly id = 'provider-instance';
    ensureRunning = providerEnsure;
    stop = providerStop;
    delete = providerDelete;
    execute = providerExecute;
    inspectExisting = providerInspect;
    connectExisting = providerConnect;
    getInfo = async () => ({ id: 'provider-instance', status: { state: 'Running' } });
    close = async () => {};
  }
  return {
    ...original,
    OpenSandboxAdapter,
    createSandbox: (...args: unknown[]) => {
      createProvider(...args);
      if (args[0] === 'e2b') return { provider: 'e2b', stop: providerStop, delete: providerDelete };
      if (args[0] === 'sealosdevbox')
        return { provider: 'sealosdevbox', stop: providerStop, delete: providerDelete };
      return new OpenSandboxAdapter();
    }
  };
});
vi.mock('@fastgpt/service/common/system/cron', () => ({ setCron }));
vi.mock('@fastgpt/service/core/ai/sandbox/config', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/config')>();
  return { ...original, getVolumeManagerConfig: volumeEnsure, deleteSessionVolume: volumeDelete };
});
vi.mock('@fastgpt/service/common/redis', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/common/redis')>();
  return {
    ...original,
    getGlobalRedisConnection: () => ({ set: redisSet, eval: redisEval })
  };
});

const sandboxId = 'lifecycle-session';

describe('file browser instance binding', () => {
  const scope = { appId: 'app', userId: 'reader', chatId: 'chat' };
  const seedBrowser = async () => {
    await getSandboxClient(scope, { workspaceRoot: '/workspace' });
    const selected = await getChatSandboxClient(scope);
    providerEnsure.mockClear();
    volumeEnsure.mockClear();
    return selected;
  };

  it('does not recreate a workspace deleted after the file browser selected it', async () => {
    const client = await seedBrowser();
    await MongoSandboxInstance.deleteMany({ sandboxId: client.id });
    await expect(client.ensureAvailable()).rejects.toThrow('operation_conflict');
    expect(await MongoSandboxInstance.countDocuments()).toBe(0);
    expect(providerEnsure).not.toHaveBeenCalled();
    expect(volumeEnsure).not.toHaveBeenCalled();
  });
  it('does not provision an empty container when the selected remote workspace is gone', async () => {
    const client = await seedBrowser();
    providerConnect.mockResolvedValue(false);
    providerInspect.mockResolvedValue(null);
    await expect(client.ensureAvailable()).rejects.toThrow('operation_conflict');
    expect(providerEnsure).not.toHaveBeenCalled();
    expect(volumeEnsure).not.toHaveBeenCalled();
  });

  it('can read a legacy workspace after ensure records its provider binding', async () => {
    await getSandboxClient(scope, { workspaceRoot: '/workspace' });
    await MongoSandboxInstance.updateOne(
      { appId: scope.appId, userId: scope.userId, chatId: scope.chatId },
      { $unset: { 'metadata.providerSandboxId': '' } }
    );
    const client = await getChatSandboxClient(scope);
    await client.ensureAvailable();
    await expect(client.withActivity(async () => 'existing file')).resolves.toBe('existing file');
  });

  it.each([
    { sourceChatId: 'another-chat' },
    { runtimeUserId: 'another-user', userId: 'another-user' },
    { 'metadata.workspaceRoot': '/different-root' }
  ])('rejects a changed workspace binding before connecting: %j', async (changes) => {
    const client = await seedBrowser();
    await MongoSandboxInstance.updateOne({ sandboxId: client.id }, { $set: changes });
    await expect(client.ensureAvailable()).rejects.toThrow('operation_conflict');
    expect(providerEnsure).not.toHaveBeenCalled();
    expect(volumeEnsure).not.toHaveBeenCalled();
  });
});

describe('workspace root persistence', () => {
  it('uses the saved Skills workspace when the legacy Shell path is selected on a later turn', async () => {
    const scope = { appId: 'app', userId: 'owner', chatId: 'chat' };
    await getSandboxClient(scope, { workspaceRoot: '/workspace/custom' });
    const client = await getSandboxClient(scope);
    await client.exec('pwd', 5);
    expect(providerExecute).toHaveBeenLastCalledWith('pwd', {
      timeoutMs: 5000,
      workingDirectory: '/workspace/custom'
    });
  });
  it('records the workspace root before provider creation fails', async () => {
    providerEnsure.mockRejectedValueOnce(new Error('provider failed'));
    await expect(
      getSandboxClient({ sandboxId }, { workspaceRoot: '/workspace/edit' })
    ).rejects.toThrow('provider failed');
    const instance = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    expect(instance?.metadata?.workspaceRoot).toBe('/workspace/edit');
    expect(instance?.status).toBe('failed');
  });

  it('does not silently rebind an existing workspace to a different directory', async () => {
    await getSandboxClient({ sandboxId }, { workspaceRoot: '/workspace/edit' });
    volumeEnsure.mockClear();
    providerEnsure.mockClear();
    await expect(
      getSandboxClient({ sandboxId }, { workspaceRoot: '/home/sandbox/workspace' })
    ).rejects.toThrow('Sandbox workspace root does not match the existing instance');
    expect(volumeEnsure).not.toHaveBeenCalled();
    expect(providerEnsure).not.toHaveBeenCalled();
  });
});

const deferred = () => {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const volumeConfig = {
  volumes: [{ name: 'workspace', pvc: { claimName: 'session-volume' }, mountPath: '/workspace' }],
  storage: {
    volumes: [{ name: 'workspace', claimName: 'session-volume', mountPath: '/workspace' }],
    mountPath: '/workspace'
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  volumeSettings.enabled = true;
  redisStorage.clear();
  providerEnsure.mockReset().mockResolvedValue(undefined);
  providerStop.mockReset().mockResolvedValue(undefined);
  providerDelete.mockReset().mockResolvedValue(undefined);
  providerExecute
    .mockReset()
    .mockResolvedValue({ stdout: '', stderr: 'command failed', exitCode: 1 });
  providerInspect
    .mockReset()
    .mockResolvedValue({ id: 'provider-instance', status: { state: 'Stopped' } });
  providerConnect.mockReset().mockResolvedValue(true);
  volumeEnsure.mockReset().mockResolvedValue(volumeConfig);
  volumeDelete.mockReset().mockResolvedValue(undefined);
  redisSet
    .mockReset()
    .mockImplementation(async (key: string, token: string, _mode: string, ttl: number) => {
      const current = redisStorage.get(key);
      if (current && current.expiresAt > Date.now()) return null;
      redisStorage.set(key, { token, expiresAt: Date.now() + ttl });
      return 'OK';
    });
  redisEval
    .mockReset()
    .mockImplementation(
      async (script: string, _keys: number, key: string, token: string, ttl?: number) => {
        const current = redisStorage.get(key);
        if (!current || current.token !== token || current.expiresAt <= Date.now()) return 0;
        if (script.includes('pexpire') && ttl) {
          current.expiresAt = Date.now() + ttl;
        } else {
          redisStorage.delete(key);
        }
        return 1;
      }
    );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Sandbox lifecycle provisioning', () => {
  it('propagates provider transport errors and preserves actual nonzero command results', async () => {
    const client = await getSandboxClient({ sandboxId });
    const error = Object.assign(new Error('connection failed'), { code: 'ECONNRESET' });
    providerExecute.mockRejectedValueOnce(error);
    await expect(client.exec('work')).rejects.toBe(error);
    await expect(client.exec('work')).resolves.toEqual({
      stdout: '',
      stderr: 'command failed',
      exitCode: 1
    });
    providerEnsure.mockRejectedValueOnce(error);
    await expect(client.exec('work')).rejects.toBe(error);
  });
  it('does not redispatch ensure after a provider timeout even if the lease is available', async () => {
    providerEnsure.mockRejectedValueOnce(new Error('request timed out'));
    await expect(getSandboxClient({ sandboxId })).rejects.toThrow('request timed out');
    const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    await expect(getSandboxClient({ sandboxId })).rejects.toThrow('explicit recovery');
    expect(providerEnsure).toHaveBeenCalledTimes(1);
    expect(volumeEnsure).toHaveBeenCalledTimes(1);
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
  });

  it('persists explicit Skill Edit ownership before provider provisioning', async () => {
    const identity = {
      sourceType: 'skillEdit' as const,
      sourceId: 'skill',
      teamId: '507f1f77bcf86cd799439011',
      ownerTmbId: '507f1f77bcf86cd799439012',
      runtimeUserId: 'skillEdit',
      sessionId: 'edit-debug'
    };
    providerEnsure.mockImplementationOnce(async () => {
      const instance = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      expect(instance).toMatchObject({
        sourceType: 'skillEdit',
        sourceId: 'skill',
        runtimeUserId: 'skillEdit',
        sessionId: 'edit-debug'
      });
      expect(String(instance?.teamId)).toBe(identity.teamId);
      expect(String(instance?.ownerTmbId)).toBe(identity.ownerTmbId);
    });
    await getSandboxClient({ sandboxId }, { identity });
  });

  it('uses canonical app identity and records ownership on first provisioning', async () => {
    const identity = {
      sourceType: 'appRuntime' as const,
      sourceId: 'app',
      runtimeUserId: 'user',
      sessionId: 'chat'
    };
    const expectedId = generateSandboxIdentityId(identity);
    providerEnsure.mockImplementationOnce(async () => {
      expect(await MongoSandboxInstance.findOne({ sandboxId: expectedId }).lean()).toMatchObject({
        ...identity,
        appId: 'app',
        userId: 'user',
        chatId: 'chat',
        status: 'provisioning'
      });
    });
    await getSandboxClient({ appId: 'app', userId: 'user', chatId: 'chat' });
    expect(await MongoSandboxInstance.countDocuments({ sandboxId: expectedId })).toBe(1);
  });

  it('reuses a unique legacy generic instance without rewriting its identity', async () => {
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: 'legacy-id',
      appId: 'app',
      userId: 'user',
      chatId: 'chat',
      status: 'stopped'
    });
    await getSandboxClient({ appId: 'app', userId: 'user', chatId: 'chat' });
    expect(await MongoSandboxInstance.countDocuments()).toBe(1);
    expect(await MongoSandboxInstance.findOne({ sandboxId: 'legacy-id' }).lean()).toMatchObject({
      status: 'running'
    });
  });

  it('marks running only after provider success and keeps volume preparation inside provisioning', async () => {
    volumeEnsure.mockImplementationOnce(async () => {
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
        status: 'provisioning',
        operation: { checkpoint: 'volume_ensure' }
      });
      return volumeConfig;
    });
    providerEnsure.mockImplementationOnce(async () => {
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
        status: 'provisioning',
        storage: volumeConfig.storage,
        operation: { checkpoint: 'provider_ensure' }
      });
    });

    await getSandboxClient(
      { sandboxId },
      { resourceLimits: { cpuCount: 2, memoryMiB: 512, diskGiB: 1 } }
    );

    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'running',
      metadata: { providerSandboxId: 'provider-instance', volumeEnabled: true },
      operation: { checkpoint: 'ready' },
      limit: { cpuCount: 2, memoryMiB: 512, diskGiB: 1 }
    });
    expect(createProvider).toHaveBeenCalledWith(
      'opensandbox',
      expect.anything(),
      expect.objectContaining({ volumes: volumeConfig.volumes })
    );
  });

  it('records provider failure with its retry checkpoint', async () => {
    const failure = new Error('Provider capacity exhausted');
    providerEnsure.mockRejectedValueOnce(failure);

    await expect(getSandboxClient({ sandboxId })).rejects.toBe(failure);

    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'failed',
      operation: { checkpoint: 'provider_ensure', error: { code: 'sandbox_unavailable' } }
    });
    expect(volumeDelete).not.toHaveBeenCalled();
  });

  it('records volume failure before any provider call', async () => {
    const failure = new Error('Volume manager unavailable');
    volumeEnsure.mockRejectedValueOnce(failure);

    await expect(getSandboxClient({ sandboxId })).rejects.toBe(failure);

    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'failed',
      operation: { checkpoint: 'volume_ensure', error: { code: 'sandbox_unavailable' } }
    });
    expect(providerEnsure).not.toHaveBeenCalled();
  });

  it('does not resume an existing volume-backed instance without its volume binding', async () => {
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId,
      status: 'stopped',
      storage: volumeConfig.storage
    });
    volumeSettings.enabled = false;
    await expect(getSandboxClient({ sandboxId })).rejects.toThrow('volume');
    expect(providerEnsure).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'failed',
      storage: volumeConfig.storage,
      operation: { checkpoint: 'pending', failureDisposition: 'retryable' }
    });
  });

  it('rejects a concurrent lifecycle operation before it touches the provider or volume', async () => {
    const entered = deferred();
    const finish = deferred();
    providerEnsure.mockImplementationOnce(async () => {
      entered.resolve();
      await finish.promise;
    });
    const first = getSandboxClient({ sandboxId });
    await entered.promise;
    try {
      await expect(getSandboxClient({ sandboxId })).rejects.toThrow('operation_conflict');
      expect(volumeEnsure).toHaveBeenCalledTimes(1);
      expect(providerEnsure).toHaveBeenCalledTimes(1);
    } finally {
      finish.resolve();
      await first;
    }
  });

  it('does not overwrite a newer Mongo operation after provider completion', async () => {
    providerEnsure.mockImplementationOnce(async () => {
      await MongoSandboxInstance.updateOne(
        { sandboxId },
        {
          $set: {
            status: 'stopped',
            'operation.id': 'new-operation',
            'operation.checkpoint': 'provider_stopped'
          }
        }
      );
    });

    await expect(getSandboxClient({ sandboxId })).rejects.toThrow('operation_conflict');

    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'stopped',
      operation: { id: 'new-operation', checkpoint: 'provider_stopped' }
    });
  });

  it('does not mark running after losing the Redis lease', async () => {
    providerEnsure.mockImplementationOnce(async () => {
      redisStorage.clear();
    });

    await expect(getSandboxClient({ sandboxId })).rejects.toThrow('operation_conflict');

    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'provisioning',
      operation: { checkpoint: 'provider_ensure' }
    });
  });

  it('does not revive a sandbox whose deletion has started', async () => {
    await MongoSandboxInstance.create({ provider: 'opensandbox', sandboxId, status: 'deleting' });

    await expect(getSandboxClient({ sandboxId })).rejects.toThrow('operation_conflict');

    expect(providerEnsure).not.toHaveBeenCalled();
    expect(volumeEnsure).not.toHaveBeenCalled();
  });

  it('does not ensure a provider after losing the lease during the provider checkpoint write', async () => {
    const updateOne = MongoSandboxInstance.collection.updateOne.bind(
      MongoSandboxInstance.collection
    );
    const updateSpy = vi
      .spyOn(MongoSandboxInstance.collection, 'updateOne')
      .mockImplementation((...args) => {
        const update = args[1];
        if (
          update &&
          '$set' in update &&
          update.$set?.['operation.checkpoint'] === 'provider_ensure'
        )
          redisStorage.clear();
        return updateOne(...args);
      });
    try {
      await expect(getSandboxClient({ sandboxId })).rejects.toThrow('operation_conflict');
      expect(providerEnsure).not.toHaveBeenCalled();
    } finally {
      updateSpy.mockRestore();
    }
  });
});

const seedInstance = async (extra: Record<string, unknown> = {}) => {
  const doc = await MongoSandboxInstance.create({
    provider: 'opensandbox',
    sandboxId,
    status: 'running',
    storage: volumeConfig.storage,
    ...extra
  });
  return doc.toObject();
};

describe('guarded lifecycle recovery', () => {
  it.each(['pending', 'volume_ensure', 'provider_ensure'])(
    'recovers a lost owner at %s before dispatch without releasing its reservation',
    async (checkpoint) => {
      await expect(
        runSandboxOperation(
          {
            provider: 'opensandbox',
            sandboxId,
            action: 'ensure',
            insert: { capacityReserved: true, storage: volumeConfig.storage }
          },
          async (op) => {
            if (checkpoint !== 'pending') await op.checkpoint(checkpoint);
            redisStorage.clear();
            await op.assertActive();
          }
        )
      ).rejects.toThrow('operation_conflict');
      const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      if (!before?.operation) throw new Error('Missing interrupted operation');
      const target = {
        provider: 'opensandbox' as const,
        sandboxId,
        operationId: before.operation.id
      };
      await expect(recoverSandboxOperation(target)).resolves.toMatchObject({
        code: 'pre_effect_retry_confirmed'
      });
      const recovered = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      expect(recovered).toMatchObject({
        status: 'failed',
        operation: {
          checkpoint,
          failureDisposition: 'retryable',
          recoveredFromOperationId: target.operationId
        }
      });
      expect(recovered?.operation?.id).not.toBe(target.operationId);
      expect(recovered?.capacityReserved).toBe(before.capacityReserved);
      expect(recovered?.storage).toEqual(before.storage);
      expect(providerEnsure).not.toHaveBeenCalled();
      expect(volumeEnsure).not.toHaveBeenCalled();
      await expect(getSandboxClient({ sandboxId })).resolves.toBeDefined();
      expect(providerEnsure).toHaveBeenCalledOnce();
    }
  );

  it('blocks a delayed unknown marker after pre-effect recovery wins the CAS', async () => {
    const entered = deferred();
    const release = deferred();
    const remote = vi.fn().mockResolvedValue(undefined);
    const update = MongoSandboxInstance.collection.updateOne.bind(MongoSandboxInstance.collection);
    const spy = vi
      .spyOn(MongoSandboxInstance.collection, 'updateOne')
      .mockImplementation(async (...args) => {
        if (
          !Array.isArray(args[1]) &&
          args[1].$set?.['operation.failureDisposition'] === 'unknown'
        ) {
          entered.resolve();
          await release.promise;
        }
        return update(...args);
      });
    const running = runSandboxOperation(
      { provider: 'opensandbox', sandboxId, action: 'ensure' },
      async (op) => {
        await op.checkpoint('provider_ensure');
        await op.remoteEffect(remote);
      }
    ).then(
      () => undefined,
      (error: unknown) => error
    );
    try {
      await entered.promise;
      redisStorage.clear();
      spy.mockRestore();
      const instance = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      if (!instance?.operation) throw new Error('Missing pending operation');
      await recoverSandboxOperation({
        provider: 'opensandbox',
        sandboxId,
        operationId: instance.operation.id
      });
      const recovered = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      release.resolve();
      await expect(running).resolves.toBeInstanceOf(Error);
      expect(remote).not.toHaveBeenCalled();
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(recovered);
    } finally {
      release.resolve();
      spy.mockRestore();
      await running;
    }
  });

  it('keeps a still-in-flight pause fenced until its exact call has returned', async () => {
    const instance = await seedInstance({
      status: 'stopped',
      metadata: { providerSandboxId: 'provider-instance' }
    });
    const entered = deferred();
    const release = deferred();
    providerStop.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
    });
    const stopping = getExistingSandboxClient(instance)
      .stop()
      .then(
        () => undefined,
        (error: unknown) => error
      );
    try {
      await entered.promise;
      redisStorage.clear();
      const pending = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      if (!pending?.operation) throw new Error('Missing pause operation');
      const target = {
        provider: 'opensandbox' as const,
        sandboxId,
        operationId: pending.operation.id
      };
      await expect(recoverSandboxOperation(target)).rejects.toThrow('remote_outcome_unknown');
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(pending);
      release.resolve();
      await expect(stopping).resolves.toBeInstanceOf(Error);
      await expect(recoverSandboxOperation(target)).resolves.toMatchObject({
        code: 'provider_stop_confirmed'
      });
      expect(providerStop).toHaveBeenCalledOnce();
    } finally {
      release.resolve();
      await stopping;
    }
  });

  it('rotates recovery ownership so a delayed old Mongo write cannot match', async () => {
    const client = await getSandboxClient({ sandboxId });
    const entered = deferred();
    const release = deferred();
    const update = MongoSandboxInstance.collection.updateOne.bind(MongoSandboxInstance.collection);
    let staleMatched: number | undefined;
    const spy = vi
      .spyOn(MongoSandboxInstance.collection, 'updateOne')
      .mockImplementation(async (...args) => {
        const isStoppedCheckpoint =
          !Array.isArray(args[1]) && args[1].$set?.['operation.checkpoint'] === 'provider_stopped';
        if (!isStoppedCheckpoint) return update(...args);
        entered.resolve();
        await release.promise;
        const result = await update(...args);
        staleMatched = result.matchedCount;
        return result;
      });
    const stopped = client.stop().then(
      () => undefined,
      (error: unknown) => error
    );
    try {
      await entered.promise;
      redisStorage.clear();
      spy.mockRestore();
      const instance = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      if (!instance?.operation) throw new Error('Missing interrupted stop');
      await recoverSandboxOperation({
        provider: 'opensandbox',
        sandboxId,
        operationId: instance.operation.id
      });
      const recovered = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      release.resolve();
      await expect(stopped).resolves.toBeInstanceOf(Error);
      expect(staleMatched).toBe(0);
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(recovered);
    } finally {
      release.resolve();
      spy.mockRestore();
      await stopped;
    }
  });
});

describe('explicit lifecycle recovery', () => {
  const seedUnknown = (
    type: string,
    checkpoint: string,
    providerSandboxId?: string,
    stopReturned = true
  ) =>
    seedInstance({
      status: type === 'delete' ? 'deleting' : 'failed',
      operation: {
        id: 'unknown-operation',
        type,
        checkpoint,
        providerSandboxId,
        startedAt: new Date(0),
        updatedAt: new Date(0),
        failureDisposition: 'unknown',
        ...(type === 'stop' && stopReturned ? { effectState: 'completed' } : {}),
        error: { code: 'sandbox_unavailable', message: 'request timed out' }
      }
    });
  const target = { provider: 'opensandbox' as const, sandboxId, operationId: 'unknown-operation' };

  it('does not use an already paused provider as proof that an unknown stop has returned', async () => {
    await seedUnknown('stop', 'provider_stop', 'provider-instance', false);
    const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    await expect(recoverSandboxOperation(target)).rejects.toThrow('remote_outcome_unknown');
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
    expect(providerStop).not.toHaveBeenCalled();
  });

  it('reports unknown creates and retains them even if a session instance is running', async () => {
    await seedUnknown('provision', 'provider_ensure');
    providerInspect.mockResolvedValue({ id: 'provider-instance', status: { state: 'Running' } });
    const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    await expect(diagnoseSandboxOperation(target)).resolves.toMatchObject({
      code: 'unknown_create_result'
    });
    await expect(recoverSandboxOperation(target)).rejects.toThrow('unknown_create_result');
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
    expect(providerEnsure).not.toHaveBeenCalled();
    expect(volumeDelete).not.toHaveBeenCalled();
  });

  it.each([undefined, 'pending'] as const)(
    'recovers an exact deleted stop target with %s receipt without deleting its draft',
    async (effectState) => {
      const before = await seedUnknown('stop', 'provider_stop', 'provider-instance', false);
      if (effectState)
        await MongoSandboxInstance.updateOne(
          { sandboxId },
          { $set: { 'operation.effectState': effectState } }
        );
      providerInspect.mockResolvedValueOnce(null);
      await expect(recoverSandboxOperation(target)).resolves.toMatchObject({
        code: 'provider_stop_confirmed'
      });
      const recovered = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      expect(recovered).toMatchObject({
        status: 'stopped',
        capacityReserved: false,
        storage: before.storage
      });
      expect(recovered?.operation?.id).not.toBe(target.operationId);
      expect(providerStop).not.toHaveBeenCalled();
      expect(volumeDelete).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, 'pending', 'completed'] as const)(
    'does not infer a pre-effect retry from %s create receipt',
    async (effectState) => {
      await seedUnknown('provision', 'provider_ensure');
      await MongoSandboxInstance.updateOne(
        { sandboxId },
        {
          $set: {
            status: 'provisioning',
            'operation.failureDisposition': 'retryable',
            ...(effectState ? { 'operation.effectState': effectState } : {})
          },
          $unset: { 'operation.error': 1 }
        }
      );
      const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      await expect(recoverSandboxOperation(target)).rejects.toThrow('unknown_create_result');
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
    }
  );

  it('refuses pre-effect recovery when the old unknown marker commits before recovery', async () => {
    await seedUnknown('provision', 'provider_ensure');
    await MongoSandboxInstance.updateOne(
      { sandboxId },
      {
        $set: {
          status: 'provisioning',
          'operation.failureDisposition': 'retryable',
          'operation.effectState': 'idle'
        },
        $unset: { 'operation.error': 1 }
      }
    );
    let checks = 0;
    await expect(
      recoverSandboxOperation({
        ...target,
        assertAuthorized: async () => {
          if (++checks === 2)
            await MongoSandboxInstance.updateOne(
              { sandboxId, 'operation.id': target.operationId },
              {
                $set: {
                  'operation.effectState': 'pending',
                  'operation.failureDisposition': 'unknown'
                }
              }
            );
        }
      })
    ).rejects.toThrow('operation_conflict');
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'provisioning',
      operation: { id: target.operationId, effectState: 'pending', failureDisposition: 'unknown' }
    });
    expect(providerEnsure).not.toHaveBeenCalled();
  });

  it('confirms a returned stop on the exact target and retains its volume and audit link', async () => {
    await seedUnknown('stop', 'provider_stop', 'provider-instance');
    await expect(recoverSandboxOperation(target)).resolves.toMatchObject({
      code: 'provider_stop_confirmed'
    });
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'stopped',
      storage: volumeConfig.storage,
      operation: {
        recoveredFromOperationId: target.operationId,
        checkpoint: 'provider_stopped',
        failureDisposition: 'retryable'
      }
    });
    expect(providerStop).not.toHaveBeenCalled();
    expect(volumeDelete).not.toHaveBeenCalled();
  });

  it.each(['stop', 'delete'] as const)(
    'recovers a %s claimed through the real lifecycle after its lease owner was lost',
    async (action) => {
      const identity = {
        sourceType: 'skillEdit' as const,
        sourceId: '6aa000000000000000000001',
        teamId: '6aa000000000000000000002',
        ownerTmbId: '6aa000000000000000000003',
        runtimeUserId: 'skillEdit',
        sessionId: 'edit-debug'
      };
      const id = generateSandboxIdentityId(identity);
      const client = await getSandboxClient(
        { sandboxId: id },
        { identity, workspaceRoot: '/workspace/edit' }
      );
      const effect = action === 'stop' ? providerStop : providerDelete;
      effect.mockImplementationOnce(async () => {
        redisStorage.clear();
      });
      await expect(client[action]()).rejects.toThrow('operation_conflict');
      const before = await MongoSandboxInstance.findOne({ sandboxId: id }).lean();
      expect(before).toMatchObject({
        status: action === 'stop' ? 'stopping' : 'deleting',
        operation: {
          type: action,
          checkpoint: `provider_${action}`,
          failureDisposition: 'unknown',
          providerSandboxId: 'provider-instance'
        }
      });
      if (!before?.operation) throw new Error('Expected a retained lifecycle operation');
      if (action === 'delete') providerInspect.mockResolvedValueOnce(null);
      await expect(
        recoverSandboxOperation({
          provider: 'opensandbox',
          sandboxId: id,
          operationId: before.operation.id
        })
      ).resolves.toMatchObject({
        code: action === 'stop' ? 'provider_stop_confirmed' : 'provider_delete_confirmed'
      });
      const recovered = await MongoSandboxInstance.findOne({ sandboxId: id }).lean();
      expect(recovered).toMatchObject({
        status: action === 'stop' ? 'stopped' : 'deleting',
        storage: before.storage,
        operation: {
          recoveredFromOperationId: before.operation.id,
          checkpoint: action === 'stop' ? 'provider_stopped' : 'provider_deleted',
          failureDisposition: 'retryable'
        }
      });
      expect(effect).toHaveBeenCalledOnce();
      expect(volumeDelete).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['operation.heartbeatAt', new Date(1)],
    ['operation.providerSandboxId', 'replacement-provider'],
    ['operation.failureDisposition', 'retryable'],
    ['operation.error.message', 'changed after inspection began'],
    ['operation.recoveredAt', new Date(1)],
    ['operation.recoveredAt', null]
  ] as const)(
    'refuses recovery if %s changes without changing the operation ID',
    async (field, value) => {
      await seedUnknown('stop', 'provider_stop', 'provider-instance');
      providerInspect.mockImplementationOnce(async () => {
        await MongoSandboxInstance.updateOne({ sandboxId }, { $set: { [field]: value } });
        return { id: 'provider-instance', status: { state: 'Stopped' } };
      });
      await expect(recoverSandboxOperation(target)).rejects.toThrow('operation_conflict');
      const retained = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      expect(retained).toMatchObject({
        status: 'failed',
        operation: { id: target.operationId, checkpoint: 'provider_stop' }
      });
      expect(retained).toHaveProperty(field, value);
      expect(providerStop).not.toHaveBeenCalled();
      expect(volumeDelete).not.toHaveBeenCalled();
    }
  );

  it('retains a same-ID operation when an unknown stored field is added during inspection', async () => {
    await seedUnknown('stop', 'provider_stop', 'provider-instance');
    providerInspect.mockImplementationOnce(async () => {
      await MongoSandboxInstance.collection.updateOne(
        { sandboxId },
        { $set: { 'operation.futureField': '$untrustedExpression' } }
      );
      return { id: 'provider-instance', status: { state: 'Stopped' } };
    });
    await expect(recoverSandboxOperation(target)).rejects.toThrow('operation_conflict');
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'failed',
      operation: {
        id: target.operationId,
        checkpoint: 'provider_stop',
        futureField: '$untrustedExpression'
      }
    });
    expect(providerStop).not.toHaveBeenCalled();
    expect(volumeDelete).not.toHaveBeenCalled();
  });

  it('preserves existing unknown fields and dollar-prefixed values in the recovery snapshot', async () => {
    await seedUnknown('stop', 'provider_stop', 'provider-instance');
    const futureField = { marker: '$operation.id', nested: { expression: '$literal' } };
    await MongoSandboxInstance.collection.updateOne(
      { sandboxId },
      {
        $set: {
          'operation.futureField': futureField,
          'operation.error.message': '$operation.providerSandboxId'
        }
      }
    );
    await expect(recoverSandboxOperation(target)).resolves.toMatchObject({
      code: 'provider_stop_confirmed'
    });
    const recovered = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    expect(recovered).toMatchObject({
      status: 'stopped',
      operation: { recoveredFromOperationId: target.operationId, checkpoint: 'provider_stopped' }
    });
    expect(recovered).toHaveProperty('operation.futureField', futureField);
    expect(recovered?.operation?.error).toBeUndefined();
    expect(providerStop).not.toHaveBeenCalled();
    expect(volumeDelete).not.toHaveBeenCalled();
  });

  it('confirms an exact deleted target and allows only remaining volume cleanup', async () => {
    await seedUnknown('delete', 'provider_delete', 'provider-instance');
    providerInspect.mockResolvedValueOnce(null);
    await expect(recoverSandboxOperation(target)).resolves.toMatchObject({
      code: 'provider_delete_confirmed'
    });
    expect(volumeDelete).not.toHaveBeenCalled();
    const recovered = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    if (!recovered) throw new Error('Missing retained instance');
    await getExistingSandboxClient(recovered).delete();
    expect(providerDelete).not.toHaveBeenCalled();
    expect(volumeDelete).toHaveBeenCalledExactlyOnceWith(
      sandboxId,
      expect.objectContaining({
        binding: expect.objectContaining({ protocol: 'sessionId', target: sandboxId })
      })
    );
  });

  it('rejects stale operationId before reading the provider', async () => {
    await seedUnknown('stop', 'provider_stop', 'provider-instance');
    await expect(recoverSandboxOperation({ ...target, operationId: 'stale' })).rejects.toThrow(
      'operation_conflict'
    );
    expect(providerInspect).not.toHaveBeenCalled();
  });

  it.each(['Running', 'Stopping', 'Error'])(
    'retains a stop with remote %s outcome',
    async (state) => {
      await seedUnknown('stop', 'provider_stop', 'provider-instance');
      providerInspect.mockResolvedValueOnce({ id: 'provider-instance', status: { state } });
      const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      await expect(recoverSandboxOperation(target)).rejects.toThrow('remote_outcome_unknown');
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
    }
  );

  it('cannot recover when a lookup fails or when the operation changes during inspection', async () => {
    await seedUnknown('delete', 'provider_delete', 'provider-instance');
    providerInspect.mockRejectedValueOnce(new Error('lookup failed'));
    await expect(recoverSandboxOperation(target)).rejects.toThrow('provider_lookup_failed');
    providerInspect.mockImplementationOnce(async () => {
      await MongoSandboxInstance.updateOne(
        { sandboxId },
        { $set: { 'operation.id': 'replacement' } }
      );
      return null;
    });
    await expect(recoverSandboxOperation(target)).rejects.toThrow('operation_conflict');
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      operation: { id: 'replacement', checkpoint: 'provider_delete', failureDisposition: 'unknown' }
    });
  });

  it('refuses terminal recovery without a persisted remote target id', async () => {
    await seedUnknown('stop', 'provider_stop');
    await expect(recoverSandboxOperation(target)).rejects.toThrow('provider_id_missing');
    expect(providerInspect).not.toHaveBeenCalled();
  });
});

describe('Sandbox lifecycle cleanup', () => {
  it('refuses a physical provider id that differs from the persisted target', async () => {
    const client = getExistingSandboxClient(
      await seedInstance({
        metadata: { providerSandboxId: 'expected-provider' }
      })
    );
    await expect(client.delete()).rejects.toThrow('operation_conflict');
    expect(providerDelete).not.toHaveBeenCalled();
    expect(volumeDelete).not.toHaveBeenCalled();
  });

  it.each(['stop', 'delete'] as const)('does not retry an uncertain %s request', async (action) => {
    const remote = action === 'stop' ? providerStop : providerDelete;
    remote.mockRejectedValueOnce(new Error('request timed out'));
    const client = getExistingSandboxClient(await seedInstance());
    await expect(client[action]()).rejects.toThrow('request timed out');
    const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    expect(before?.operation?.failureDisposition).toBe('unknown');
    await expect(client[action]()).rejects.toThrow('explicit recovery');
    expect(remote).toHaveBeenCalledOnce();
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
  });

  it('refuses a rebound resource before claiming or calling the provider', async () => {
    const client = getExistingSandboxClient(
      await seedInstance({ sourceType: 'skillEdit', sourceId: 'skill-a' })
    );
    await MongoSandboxInstance.updateOne({ sandboxId }, { $set: { sourceId: 'skill-b' } });
    const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    await expect(client.delete()).rejects.toThrow('operation_conflict');
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
    expect(providerDelete).not.toHaveBeenCalled();
    expect(volumeDelete).not.toHaveBeenCalled();
  });

  it('rechecks deletion authorization before volume cleanup after provider completion', async () => {
    let authorized = true;
    const assertAuthorized = vi.fn(async () => {
      if (!authorized) throw new Error('authorization revoked');
    });
    providerDelete.mockImplementationOnce(async () => {
      authorized = false;
    });
    const client = getExistingSandboxClient(await seedInstance());
    await expect(client.delete({ assertAuthorized })).rejects.toThrow('authorization revoked');
    expect(providerDelete).toHaveBeenCalledOnce();
    expect(volumeDelete).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'deleting',
      operation: { checkpoint: 'provider_delete', failureDisposition: 'unknown' }
    });
  });

  it('retains volume and operation if identity changes during a provider delete', async () => {
    providerDelete.mockImplementationOnce(async () => {
      await MongoSandboxInstance.updateOne({ sandboxId }, { $set: { sourceId: 'replacement' } });
    });
    const client = getExistingSandboxClient(
      await seedInstance({ sourceType: 'skillEdit', sourceId: 'skill-a' })
    );
    await expect(client.delete()).rejects.toThrow('operation_conflict');
    expect(volumeDelete).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      sourceId: 'replacement',
      status: 'deleting',
      operation: { failureDisposition: 'unknown' }
    });
  });

  it('constructs an existing client without preparing a volume or provider', async () => {
    const client = getExistingSandboxClient(await seedInstance());
    expect(client).toBeDefined();
    expect(createProvider).not.toHaveBeenCalled();
    expect(volumeEnsure).not.toHaveBeenCalled();
    await expect(client.ensureAvailable()).rejects.toThrow('existing-only');
    expect(providerEnsure).not.toHaveBeenCalled();
  });

  it('stops an existing provider without ensure and retains its volume', async () => {
    providerStop.mockImplementationOnce(async () => {
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
        status: 'stopping',
        operation: { checkpoint: 'provider_stop' }
      });
    });
    await getExistingSandboxClient(await seedInstance()).stop();
    expect(providerConnect).toHaveBeenCalledTimes(1);
    expect(providerStop).toHaveBeenCalledTimes(1);
    expect(providerEnsure).not.toHaveBeenCalled();
    expect(volumeEnsure).not.toHaveBeenCalled();
    expect(volumeDelete).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'stopped',
      storage: volumeConfig.storage,
      operation: { checkpoint: 'provider_stopped' }
    });
  });

  it('retains stop failure and its checkpoint', async () => {
    providerStop.mockRejectedValueOnce(new Error('provider failure'));
    await expect(getExistingSandboxClient(await seedInstance()).stop()).rejects.toThrow(
      'provider failure'
    );
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'failed',
      operation: { checkpoint: 'provider_stop', error: { code: 'sandbox_stop_failed' } }
    });
  });

  it.each(['missing', '404'] as const)(
    'treats provider %s as successful delete without creating',
    async (mode) => {
      if (mode === 'missing') providerConnect.mockResolvedValueOnce(false);
      else
        providerDelete.mockRejectedValueOnce(new Error('wrapped', { cause: { statusCode: 404 } }));
      await getExistingSandboxClient(await seedInstance()).delete();
      expect(volumeDelete).toHaveBeenCalledExactlyOnceWith(
        sandboxId,
        expect.objectContaining({
          binding: expect.objectContaining({ protocol: 'sessionId', target: sandboxId })
        })
      );
      expect(providerEnsure).not.toHaveBeenCalled();
      expect(volumeEnsure).not.toHaveBeenCalled();
      expect(await MongoSandboxInstance.exists({ sandboxId })).toBeNull();
    }
  );

  it('retains deleting after volume failure and retries only the remaining volume cleanup', async () => {
    volumeDelete.mockRejectedValueOnce(new Error('PVC busy'));
    const client = getExistingSandboxClient(await seedInstance());
    await expect(client.delete()).rejects.toThrow('PVC busy');
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'deleting',
      operation: { checkpoint: 'provider_deleted', error: { code: 'sandbox_delete_failed' } }
    });
    await client.delete();
    expect(providerConnect).toHaveBeenCalledTimes(1);
    expect(providerDelete).toHaveBeenCalledTimes(1);
    expect(volumeDelete).toHaveBeenCalledTimes(2);
    expect(await MongoSandboxInstance.exists({ sandboxId })).toBeNull();
  });

  it('retains a persistent volume record when the volume manager is disabled', async () => {
    volumeSettings.enabled = false;
    await expect(getExistingSandboxClient(await seedInstance()).delete()).rejects.toThrow('volume');
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'deleting',
      operation: { checkpoint: 'pending', failureDisposition: 'retryable' }
    });
    expect(providerDelete).not.toHaveBeenCalled();
    expect(volumeDelete).not.toHaveBeenCalled();
  });

  it('does not treat a provider failure as deleted or delete its volume', async () => {
    providerDelete.mockRejectedValueOnce(new Error('wrapped', { cause: { statusCode: 500 } }));
    await expect(getExistingSandboxClient(await seedInstance()).delete()).rejects.toThrow(
      'wrapped'
    );
    expect(volumeDelete).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'deleting',
      operation: { checkpoint: 'provider_delete' }
    });
  });

  it('does not interpret a failed provider lookup endpoint as a missing sandbox', async () => {
    providerConnect.mockRejectedValueOnce(
      new Error('lookup endpoint failure', { cause: { statusCode: 404 } })
    );
    await expect(getExistingSandboxClient(await seedInstance()).delete()).rejects.toThrow(
      'lookup endpoint failure'
    );
    expect(providerDelete).not.toHaveBeenCalled();
    expect(volumeDelete).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'deleting',
      operation: { checkpoint: 'provider_delete' }
    });
  });

  it('stops before provider deletion if the lease is lost while connecting', async () => {
    providerConnect.mockImplementationOnce(async () => {
      redisStorage.clear();
      return true;
    });
    await expect(getExistingSandboxClient(await seedInstance()).delete()).rejects.toThrow(
      'operation_conflict'
    );
    expect(providerDelete).not.toHaveBeenCalled();
    expect(volumeDelete).not.toHaveBeenCalled();
  });

  it('stops before volume deletion if the lease is lost while deleting provider', async () => {
    providerDelete.mockImplementationOnce(async () => {
      redisStorage.clear();
    });
    await expect(getExistingSandboxClient(await seedInstance()).delete()).rejects.toThrow(
      'operation_conflict'
    );
    expect(volumeDelete).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.exists({ sandboxId })).not.toBeNull();
  });

  it('does not delete Mongo after losing the lease during volume deletion', async () => {
    volumeDelete.mockImplementationOnce(async () => {
      redisStorage.clear();
    });
    await expect(getExistingSandboxClient(await seedInstance()).delete()).rejects.toThrow(
      'operation_conflict'
    );
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'deleting',
      operation: { checkpoint: 'provider_deleted' }
    });
  });

  it('does not delete a Mongo record owned by a newer operation', async () => {
    volumeDelete.mockImplementationOnce(async () => {
      await MongoSandboxInstance.updateOne(
        { sandboxId },
        { $set: { 'operation.id': 'newer-operation' } }
      );
    });
    await expect(getExistingSandboxClient(await seedInstance()).delete()).rejects.toThrow(
      'operation_conflict'
    );
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      operation: { id: 'newer-operation' }
    });
  });

  it('does not connect or delete anything when the record was already removed', async () => {
    const client = getExistingSandboxClient(await seedInstance());
    await MongoSandboxInstance.deleteOne({ sandboxId });
    await client.delete();
    expect(createProvider).not.toHaveBeenCalled();
    expect(volumeDelete).not.toHaveBeenCalled();
  });

  it('rejects cleanup when a provider cannot connect without creating', async () => {
    await expect(
      getExistingSandboxClient(await seedInstance({ provider: 'e2b' })).delete()
    ).rejects.toThrow('non-creating');
    expect(providerEnsure).not.toHaveBeenCalled();
    expect(providerDelete).not.toHaveBeenCalled();
    expect(volumeDelete).not.toHaveBeenCalled();
  });

  it('uses the persisted Sealos provider without creating or connecting a new sandbox', async () => {
    await getExistingSandboxClient(await seedInstance({ provider: 'sealosdevbox' })).stop();
    expect(createProvider).toHaveBeenCalledWith(
      'sealosdevbox',
      expect.objectContaining({ sandboxId }),
      undefined
    );
    expect(providerStop).toHaveBeenCalledTimes(1);
    expect(providerConnect).not.toHaveBeenCalled();
    expect(providerEnsure).not.toHaveBeenCalled();
    expect(volumeEnsure).not.toHaveBeenCalled();
  });

  it.each(['app', 'chat'] as const)('deletes matching %s records without ensure', async (mode) => {
    await seedInstance({ appId: 'app', userId: 'user', chatId: 'chat' });
    await seedInstance({ sandboxId: 'other', appId: 'other-app', userId: 'user', chatId: 'chat' });
    if (mode === 'app') await deleteSandboxesByAppId('app');
    else await deleteSandboxesByChatIds({ appId: 'app', chatIds: ['chat'] });
    expect(await MongoSandboxInstance.exists({ sandboxId })).toBeNull();
    expect(await MongoSandboxInstance.exists({ sandboxId: 'other' })).not.toBeNull();
    expect(providerEnsure).not.toHaveBeenCalled();
    expect(volumeEnsure).not.toHaveBeenCalled();
  });

  it('cron suspends only idle instances without ensure or volume mutation', async () => {
    await seedInstance({ lastActiveAt: new Date(Date.now() - 600_000) });
    await seedInstance({ sandboxId: 'active', lastActiveAt: new Date() });
    await cronJob();
    await setCron.mock.calls[0][1]();
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'stopped'
    });
    expect(await MongoSandboxInstance.findOne({ sandboxId: 'active' }).lean()).toMatchObject({
      status: 'running'
    });
    expect(providerStop).toHaveBeenCalledTimes(1);
    expect(providerEnsure).not.toHaveBeenCalled();
    expect(volumeEnsure).not.toHaveBeenCalled();
    expect(volumeDelete).not.toHaveBeenCalled();
  });

  it('rechecks idle activity under the operation lease before stop', async () => {
    const doc = await seedInstance({ lastActiveAt: new Date(Date.now() - 600_000) });
    await MongoSandboxInstance.updateOne({ sandboxId }, { $set: { lastActiveAt: new Date() } });
    await getExistingSandboxClient(doc).stop({ inactiveBefore: new Date(Date.now() - 300_000) });
    expect(providerConnect).not.toHaveBeenCalled();
    expect(providerStop).not.toHaveBeenCalled();
  });

  it('does not idle-stop a Skill workspace while a chat or publish owns its activity lease', async () => {
    await seedInstance({
      sourceType: 'skillEdit',
      sourceId: 'editing-skill',
      lastActiveAt: new Date(Date.now() - 600_000)
    });
    await cronJob();
    await withSandboxLease('skill-edit-activity:editing-skill', async () => {
      await setCron.mock.calls[0][1]();
    });
    expect(providerStop).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'running'
    });
  });

  it.each(['busy', 'unknown', 'idle'])(
    'checks Terminal activity before idle-stop: %s',
    async (state) => {
      await seedInstance({
        sourceType: 'skillEdit',
        sourceId: 'editing-skill',
        lastActiveAt: new Date(Date.now() - 600_000)
      });
      providerExecute.mockResolvedValue({
        stdout:
          state === 'busy'
            ? '80 15 80 81 pts/0 Ss bash\n81 80 81 81 pts/0 S+ sleep'
            : state === 'idle'
              ? '1 0 1 -1 ? Ss bootstrap.sh'
              : '',
        stderr: '',
        exitCode: 0
      });
      await cronJob();
      await setCron.mock.calls[0][1]();
      expect(providerStop).toHaveBeenCalledTimes(state === 'idle' ? 1 : 0);
      expect((await MongoSandboxInstance.findOne({ sandboxId }).lean())?.status).toBe(
        state === 'idle' ? 'stopped' : 'running'
      );
    }
  );

  it.each(['idle', 'manual'] as const)(
    'honors a heartbeat arriving before the %s stop claim without overriding manual intent',
    async (mode) => {
      const doc = await seedInstance({ lastActiveAt: new Date(Date.now() - 600_000) });
      const heartbeatAt = new Date();
      const findOneAndUpdate = MongoSandboxInstance.collection.findOneAndUpdate.bind(
        MongoSandboxInstance.collection
      );
      const claimSpy = vi
        .spyOn(MongoSandboxInstance.collection, 'findOneAndUpdate')
        .mockImplementation(async (...args) => {
          await MongoSandboxInstance.updateOne(
            { sandboxId },
            { $max: { lastActiveAt: heartbeatAt } }
          );
          return findOneAndUpdate(...args);
        });
      try {
        const stopping = getExistingSandboxClient(doc).stop(
          mode === 'idle' ? { inactiveBefore: new Date(Date.now() - 300_000) } : {}
        );
        if (mode === 'idle') {
          await expect(stopping).rejects.toThrow('operation_conflict');
          expect(providerConnect).not.toHaveBeenCalled();
          expect(providerStop).not.toHaveBeenCalled();
          expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
            status: 'running',
            lastActiveAt: heartbeatAt
          });
        } else {
          await stopping;
          expect(providerStop).toHaveBeenCalledOnce();
          expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
            status: 'stopped',
            lastActiveAt: heartbeatAt
          });
        }
      } finally {
        claimSpy.mockRestore();
      }
    }
  );

  it('uses the global timer lock to suppress a duplicate node scan without changing the schedule', async () => {
    await MongoTimerLock.collection.createIndex({ timerId: 1 }, { unique: true });
    await seedInstance({ lastActiveAt: new Date(Date.now() - 600_000) });
    await cronJob();
    expect(setCron.mock.calls[0][0]).toBe('*/5 * * * *');
    await setCron.mock.calls[0][1]();
    await MongoSandboxInstance.updateOne(
      { sandboxId },
      {
        $set: {
          status: 'running',
          lastActiveAt: new Date(Date.now() - 600_000),
          'operation.type': 'start',
          'operation.checkpoint': 'ready'
        }
      }
    );
    await setCron.mock.calls[0][1]();
    expect(providerStop).toHaveBeenCalledTimes(1);
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'running'
    });
    const timerLock = await MongoTimerLock.findOne({ timerId: 'sandboxIdleStop' }).lean();
    expect(timerLock?.expiredTime.getTime()).toBeGreaterThan(Date.now() + 230_000);
    expect(timerLock?.expiredTime.getTime()).toBeLessThanOrEqual(Date.now() + 240_000);
  });
});

describe('Sandbox token lease', () => {
  it('renews a long operation and releases only its own token', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    await withSandboxLease('test-lease', async ({ token, assertOwned }) => {
      expect(redisStorage.get('test-lease')?.token).toBe(token);
      await vi.advanceTimersByTimeAsync(40_000);
      await assertOwned();
      expect(redisStorage.get('test-lease')?.expiresAt).toBeGreaterThan(Date.now());
    });
    expect(redisStorage.has('test-lease')).toBe(false);
  });

  it('cannot renew or release a replacement owner token', async () => {
    await withSandboxLease('test-lease', async ({ assertOwned }) => {
      redisStorage.set('test-lease', { token: 'replacement', expiresAt: Date.now() + 30_000 });
      await expect(assertOwned()).rejects.toThrow('operation_conflict');
    });
    expect(redisStorage.get('test-lease')?.token).toBe('replacement');
  });
});

describe('Sandbox activity lifecycle protection', () => {
  const scope = { provider: 'opensandbox' as const, sandboxId };

  it('refreshes lastActiveAt before invoking a running workspace callback', async () => {
    const oldActivity = new Date('2026-01-01T00:00:00Z');
    await seedInstance({ lastActiveAt: oldActivity });
    const startedAt = Date.now();
    const result = await runSandboxActivity(scope, async () => {
      const current = await MongoSandboxInstance.findOne(scope).lean();
      expect(current?.status).toBe('running');
      expect(current?.lastActiveAt.getTime()).toBeGreaterThanOrEqual(startedAt);
      return 'workspace-result';
    });
    expect(result).toBe('workspace-result');
    expect(providerEnsure).not.toHaveBeenCalled();
  });

  it('prevents stop and delete from reaching the provider while a callback is pending', async () => {
    const client = getExistingSandboxClient(await seedInstance());
    const entered = deferred();
    const finish = deferred();
    const activity = runSandboxActivity(scope, async () => {
      entered.resolve();
      await finish.promise;
      return 'finished';
    });
    await entered.promise;
    try {
      await expect(client.stop()).rejects.toThrow('operation_conflict');
      await expect(client.delete()).rejects.toThrow('operation_conflict');
      expect(providerStop).not.toHaveBeenCalled();
      expect(providerDelete).not.toHaveBeenCalled();
      expect(providerConnect).not.toHaveBeenCalled();
      expect(volumeDelete).not.toHaveBeenCalled();
      expect(await MongoSandboxInstance.findOne(scope).lean()).toMatchObject({ status: 'running' });
    } finally {
      finish.resolve();
      await activity;
    }
  });

  it('releases the activity lease after completion so a workspace can stop', async () => {
    const client = getExistingSandboxClient(await seedInstance());
    await expect(runSandboxActivity(scope, async () => 'done')).resolves.toBe('done');
    await client.stop();
    expect(providerStop).toHaveBeenCalledTimes(1);
    expect(await MongoSandboxInstance.findOne(scope).lean()).toMatchObject({ status: 'stopped' });
  });

  it('preserves the callback error and releases the lease so a workspace can stop', async () => {
    const client = getExistingSandboxClient(await seedInstance());
    const failure = new Error('tool command failed');
    await expect(
      runSandboxActivity(scope, async () => {
        throw failure;
      })
    ).rejects.toBe(failure);
    await client.stop();
    expect(providerStop).toHaveBeenCalledTimes(1);
    expect(await MongoSandboxInstance.findOne(scope).lean()).toMatchObject({ status: 'stopped' });
  });

  it.each(['missing', 'stopped', 'deleting'])(
    'does not execute a callback for a %s workspace',
    async (status) => {
      if (status !== 'missing') await seedInstance({ status });
      const callback = vi.fn().mockResolvedValue('must not execute');
      await expect(runSandboxActivity(scope, callback)).rejects.toThrow('operation_conflict');
      expect(callback).not.toHaveBeenCalled();
      expect(providerEnsure).not.toHaveBeenCalled();
      expect(providerConnect).not.toHaveBeenCalled();
      expect(volumeEnsure).not.toHaveBeenCalled();
      expect(await MongoSandboxInstance.countDocuments(scope)).toBe(status === 'missing' ? 0 : 1);
    }
  );
});
