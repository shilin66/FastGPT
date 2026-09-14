import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { SandboxOperationSchema } from '@fastgpt/service/core/ai/sandbox/type';
import { runSandboxOperation } from '@fastgpt/service/core/ai/sandbox/operation';
import { withSandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';

const { redisSet, redisEval, redisStorage } = vi.hoisted(() => ({
  redisSet: vi.fn(),
  redisEval: vi.fn(),
  redisStorage: new Map<string, { token: string; expiresAt: number }>()
}));
vi.mock('@fastgpt/service/common/redis', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/common/redis')>();
  return {
    ...original,
    getGlobalRedisConnection: () => ({ set: redisSet, eval: redisEval })
  };
});

const sandboxId = 'heartbeat-session';
const readInstance = () => MongoSandboxInstance.findOne({ sandboxId }).lean();
const deferred = () => {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const seed = () => MongoSandboxInstance.create({ provider: 'opensandbox', sandboxId });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  redisStorage.clear();
  redisSet.mockReset().mockImplementation(async (key, token, _mode, ttl) => {
    if (redisStorage.has(key)) return null;
    redisStorage.set(key, { token, expiresAt: Date.now() + ttl });
    return 'OK';
  });
  redisEval.mockReset().mockImplementation(async (script, _keys, key, token, ttl) => {
    const current = redisStorage.get(key);
    if (!current || current.token !== token || current.expiresAt <= Date.now()) return 0;
    if (script.includes('pexpire')) current.expiresAt = Date.now() + ttl;
    else redisStorage.delete(key);
    return 1;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Sandbox operation heartbeat', () => {
  it('retains optional heartbeat in the service contract while accepting legacy operations', () => {
    const legacy = {
      id: 'operation',
      type: 'start',
      checkpoint: 'provider_ensure',
      startedAt: new Date(),
      updatedAt: new Date()
    };
    expect(SandboxOperationSchema.parse(legacy)).toEqual(legacy);
    const current = { ...legacy, heartbeatAt: new Date() };
    expect(SandboxOperationSchema.parse(current)).toEqual(current);
  });

  it.each(['ensure', 'stop', 'delete'] as const)(
    'updates only heartbeat while %s waits and stops observing after completion',
    async (action) => {
      if (action !== 'ensure') await seed();
      await runSandboxOperation({ provider: 'opensandbox', sandboxId, action }, async (current) => {
        await current.checkpoint('provider_wait');
        const before = await readInstance();
        expect(before?.operation).toHaveProperty('heartbeatAt');
        await vi.advanceTimersByTimeAsync(10_000);
        await vi.waitFor(async () => {
          const after = await readInstance();
          expect(after?.operation?.heartbeatAt?.getTime()).toBeGreaterThan(
            before!.operation!.heartbeatAt!.getTime()
          );
          expect(after?.operation?.updatedAt).toEqual(before?.operation?.updatedAt);
          expect(after?.operation?.checkpoint).toBe('provider_wait');
        });
        if (action === 'delete') await current.remove();
        else {
          await current.checkpoint(action === 'ensure' ? 'ready' : 'provider_stopped', {
            status: action === 'ensure' ? 'running' : 'stopped'
          });
        }
      });
      const completed = await readInstance();
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await readInstance()).toEqual(completed);
    }
  );

  it('does not write a heartbeat before any Mongo operation was claimed', async () => {
    const updateSpy = vi.spyOn(MongoSandboxInstance.collection, 'updateOne');
    await withSandboxLease('unclaimed-operation', async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(updateSpy).not.toHaveBeenCalled();
    expect(await readInstance()).toBeNull();
  });

  it.each(['redis', 'mongo'] as const)(
    'does not renew observation after losing %s ownership',
    async (owner) => {
      await runSandboxOperation(
        { provider: 'opensandbox', sandboxId, action: 'ensure' },
        async (current) => {
          await current.checkpoint('provider_wait');
          expect((await readInstance())?.operation).toHaveProperty('heartbeatAt');
          if (owner === 'redis') redisStorage.clear();
          else {
            await MongoSandboxInstance.updateOne(
              { sandboxId },
              { $set: { 'operation.id': 'replacement-owner' } }
            );
          }
          const before = await readInstance();
          await vi.advanceTimersByTimeAsync(20_000);
          expect(await readInstance()).toEqual(before);
          await expect(current.assertActive()).rejects.toThrow('operation_conflict');
        }
      );
    }
  );

  it.each(['terminal checkpoint', 'same-ID Edit handoff', 'replacement owner'])(
    'drains an in-flight heartbeat without writing after %s',
    async (state) => {
      let heartbeatStarted = false;
      const releaseHeartbeat = deferred();
      const providerWaiting = deferred();
      const releaseProvider = deferred();
      const terminalWritten = deferred();
      const updateOne = MongoSandboxInstance.collection.updateOne.bind(
        MongoSandboxInstance.collection
      );
      vi.spyOn(MongoSandboxInstance.collection, 'updateOne').mockImplementation(async (...args) => {
        const update = args[1];
        if (update && '$max' in update && update.$max?.['operation.heartbeatAt']) {
          heartbeatStarted = true;
          await releaseHeartbeat.promise;
        }
        return updateOne(...args);
      });
      let completed = false;
      const running = runSandboxOperation(
        { provider: 'opensandbox', sandboxId, action: 'ensure' },
        async (current) => {
          await current.checkpoint('provider_wait');
          providerWaiting.resolve();
          await releaseProvider.promise;
          await current.checkpoint('ready', { status: 'running' });
          terminalWritten.resolve();
        }
      ).then(() => {
        completed = true;
      });
      try {
        await providerWaiting.promise;
        await vi.advanceTimersByTimeAsync(10_000);
        expect(heartbeatStarted).toBe(true);
        releaseProvider.resolve();
        await terminalWritten.promise;
        if (state !== 'terminal checkpoint') {
          await MongoSandboxInstance.updateOne(
            { sandboxId },
            {
              $set: {
                status: 'provisioning',
                ...(state === 'same-ID Edit handoff'
                  ? {
                      'operation.type': 'editInitialize',
                      'operation.checkpoint': 'workspace_inspect'
                    }
                  : { 'operation.id': 'replacement-owner' })
              }
            }
          );
        }
        const terminal = await readInstance();
        expect(completed).toBe(false);
        releaseHeartbeat.resolve();
        await running;
        expect(await readInstance()).toEqual(terminal);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        releaseProvider.resolve();
        releaseHeartbeat.resolve();
        await running;
      }
    }
  );

  it('does not overlap slow heartbeats or stop renewing the lease while observation is pending', async () => {
    const releaseHeartbeat = deferred();
    const heartbeat = vi.fn(async () => {
      await releaseHeartbeat.promise;
      return true;
    });
    await withSandboxLease('slow-heartbeat', async (lease) => {
      lease.setHeartbeat(heartbeat);
      try {
        await vi.advanceTimersByTimeAsync(40_000);
        expect(heartbeat).toHaveBeenCalledOnce();
        expect(redisStorage.get('slow-heartbeat')?.expiresAt).toBeGreaterThan(Date.now());
        await lease.assertOwned();
      } finally {
        releaseHeartbeat.resolve();
      }
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('drains a delayed renewal without starting observation after the callback has finished', async () => {
    const callbackStarted = deferred();
    const finishCallback = deferred();
    const releaseRenewal = deferred();
    const heartbeat = vi.fn().mockResolvedValue(true);
    let completed = false;
    const running = withSandboxLease('delayed-renewal', async (lease) => {
      lease.setHeartbeat(heartbeat);
      callbackStarted.resolve();
      await finishCallback.promise;
    }).then(() => {
      completed = true;
    });
    await callbackStarted.promise;
    const evaluate = redisEval.getMockImplementation()!;
    redisEval.mockImplementationOnce(async (...args) => {
      await releaseRenewal.promise;
      return evaluate(...args);
    });
    try {
      await vi.advanceTimersByTimeAsync(10_000);
      finishCallback.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(completed).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      releaseRenewal.resolve();
      await running;
      expect(heartbeat).not.toHaveBeenCalled();
    } finally {
      finishCallback.resolve();
      releaseRenewal.resolve();
      await running;
    }
  });

  it('handles observation failure without failing the operation or leaving an unhandled rejection', async () => {
    await withSandboxLease('observer-failure', async (lease) => {
      const heartbeat = vi.fn().mockRejectedValue(new Error('Mongo temporarily unavailable'));
      lease.setHeartbeat(heartbeat);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(heartbeat).toHaveBeenCalledOnce();
      await lease.assertOwned();
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
