import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { MongoTimerLock } from '@fastgpt/service/common/system/timerLock/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { runSandboxOperation } from '@fastgpt/service/core/ai/sandbox/operation';
import type { SandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';
import type { SandboxInstanceSchemaType } from '@fastgpt/service/core/ai/sandbox/type';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');

vi.mock('@fastgpt/service/core/ai/sandbox/lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/lease')>()),
  withSandboxLease: async (_key: string, run: (lease: SandboxLease) => Promise<void>) =>
    run({ token: randomUUID(), assertOwned: async () => undefined, setHeartbeat: vi.fn() })
}));

let previousConfig: typeof global.feConfigs;
beforeEach(async () => {
  previousConfig = global.feConfigs;
  global.feConfigs = {
    ...global.feConfigs,
    limit: { agentSandboxMaxEditDebug: 1, agentSandboxMaxSessionRuntime: 1 }
  };
  await MongoSandboxInstance.createCollection();
  await MongoTimerLock.createCollection();
  await MongoTimerLock.init();
});
afterEach(() => {
  global.feConfigs = previousConfig;
  vi.restoreAllMocks();
});

const deferred = () => {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe.each([SandboxTypeEnum.editDebug, SandboxTypeEnum.sessionRuntime])(
  'Atomic Sandbox admission: %s',
  (sandboxType) => {
    const seed = (fields: Partial<SandboxInstanceSchemaType> = {}) =>
      MongoSandboxInstance.create({
        provider: 'opensandbox',
        sandboxId: randomUUID(),
        metadata: { sandboxType },
        status: 'stopped',
        ...fields
      });
    const ensure = (
      sandboxId: string = randomUUID(),
      run: Parameters<typeof runSandboxOperation>[1] = async (operation) => {
        await operation.remoteEffect(async () => undefined);
        await operation.checkpoint('ready', { status: 'running' });
      }
    ) =>
      runSandboxOperation(
        {
          provider: 'opensandbox',
          sandboxId,
          action: 'ensure',
          insert: { metadata: { sandboxType } }
        },
        run
      );

    it('admits at most one of eight creators at the final slot, including first guard creation', async () => {
      const provider = vi.fn(async () => undefined);
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          ensure(randomUUID(), async (operation) => {
            await operation.remoteEffect(provider);
            await operation.checkpoint('ready', { status: 'running' });
          })
        )
      );
      expect(provider).toHaveBeenCalledOnce();
      expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
      expect(await MongoSandboxInstance.countDocuments({})).toBe(1);
    });

    it('keeps an unresolved creation reserved even after the serialization guard is collected', async () => {
      const entered = deferred();
      const response = deferred();
      const firstId = randomUUID();
      const first = ensure(firstId, async (operation) => {
        await operation.remoteEffect(async () => {
          entered.resolve();
          await response.promise;
          throw new Error('provider response lost');
        });
      });
      const outcome = first.catch((error: unknown) => error);
      try {
        await entered.promise;
        await MongoTimerLock.deleteMany({ timerId: /^sandbox-capacity:/ });
        const second = vi.fn();
        await expect(ensure(randomUUID(), second)).rejects.toThrow('sandbox limit reached');
        expect(second).not.toHaveBeenCalled();
      } finally {
        response.resolve();
        expect(await outcome).toBeInstanceOf(Error);
      }
      await expect(ensure()).rejects.toThrow('sandbox limit reached');
      await expect(ensure(firstId)).rejects.toThrow('explicit recovery');
    });

    it('serializes a paused resume against a fresh creator', async () => {
      const paused = await seed();
      const before = await MongoSandboxInstance.findById(paused._id).lean();
      const provider = vi.fn(async () => undefined);
      const run: Parameters<typeof runSandboxOperation>[1] = async (operation) => {
        await operation.remoteEffect(provider);
        await operation.checkpoint('ready', { status: 'running' });
      };
      const results = await Promise.allSettled([
        ensure(paused.sandboxId, run),
        ensure(randomUUID(), run)
      ]);
      expect(provider).toHaveBeenCalledOnce();
      expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
      if (results[0].status === 'rejected') {
        expect(await MongoSandboxInstance.findById(paused._id).lean()).toEqual(before);
      }
    });

    it.each(['publish', 'resetWorkspace', 'stop', 'delete'])(
      'counts a legacy %s intermediate state without a reservation marker',
      async (type) => {
        await seed({
          status: type === 'stop' ? 'stopping' : type === 'delete' ? 'deleting' : 'provisioning',
          deleteTime: type === 'delete' ? new Date() : null,
          operation: {
            id: randomUUID(),
            type,
            checkpoint: 'provider_deleted',
            startedAt: new Date(),
            updatedAt: new Date(),
            failureDisposition: 'unknown'
          }
        });
        const provider = vi.fn();
        await expect(ensure(randomUUID(), provider)).rejects.toThrow('sandbox limit reached');
        expect(provider).not.toHaveBeenCalled();
      }
    );

    it('does not lose the live container slot when a reused instance fails before Provider invocation', async () => {
      const existing = await seed({ status: 'running' });
      await expect(
        ensure(existing.sandboxId, async () => {
          throw new Error('invalid volume configuration');
        })
      ).rejects.toThrow('invalid volume configuration');
      await expect(ensure()).rejects.toThrow('sandbox limit reached');
      await ensure(existing.sandboxId);
      expect(await MongoSandboxInstance.countDocuments({ status: 'running' })).toBe(1);
    });

    it.each(['running', 'failed-before-provider'])(
      'does not inherit a new capacity group from an unclassified VM in %s',
      async (mode) => {
        const sandboxId = randomUUID();
        await runSandboxOperation(
          { provider: 'opensandbox', sandboxId, action: 'ensure' },
          async (operation) => {
            if (mode === 'failed-before-provider') throw new Error('QA local VM validation');
            await operation.checkpoint('ready', { status: 'running' });
          }
        ).catch((error: unknown) => {
          if (mode !== 'failed-before-provider') throw error;
          expect(error).toBeInstanceOf(Error);
        });
        global.feConfigs.limit = { agentSandboxMaxEditDebug: 0, agentSandboxMaxSessionRuntime: 0 };
        const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
        expect(before?.metadata?.sandboxType).toBeUndefined();
        const provider = vi.fn();
        await expect(ensure(sandboxId, provider)).rejects.toThrow('sandbox limit reached');
        expect(provider).not.toHaveBeenCalled();
        expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
      }
    );

    it.each(['ensure', 'stop', 'delete'] as const)(
      'rejects unsupported classified Provider %s before any claim or effect',
      async (action) => {
        const previous =
          action === 'ensure' ? null : await seed({ provider: 'sealosdevbox', status: 'running' });
        const sandboxId = previous?.sandboxId ?? randomUUID();
        const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
        const provider = vi.fn();
        await expect(
          runSandboxOperation(
            {
              provider: 'sealosdevbox',
              sandboxId,
              action,
              insert: { metadata: { sandboxType } }
            },
            provider
          )
        ).rejects.toThrow('sandbox_capacity_provider_unsupported');
        expect(provider).not.toHaveBeenCalled();
        expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
      }
    );

    it('returns a newly acquired slot on a known pre-effect failure', async () => {
      const sandboxId = randomUUID();
      await expect(
        ensure(sandboxId, async () => {
          throw new Error('local validation failed');
        })
      ).rejects.toThrow('local validation failed');
      await ensure();
      await expect(ensure(sandboxId)).rejects.toThrow('sandbox limit reached');
    });

    it.each(['new', 'paused', 'legacy-metadata'])(
      'reuses only its own committed %s claim after a lost commit response',
      async (mode) => {
        const sandboxId =
          mode === 'new'
            ? randomUUID()
            : (await seed(mode === 'legacy-metadata' ? { metadata: null } : {})).sandboxId;
        const originalStart = connectionMongo.startSession.bind(connectionMongo);
        let lost = false;
        vi.spyOn(connectionMongo, 'startSession').mockImplementation(async (...args) => {
          const session = await originalStart(...args);
          const commit = session.commitTransaction.bind(session);
          vi.spyOn(session, 'commitTransaction').mockImplementation(async (...commitArgs) => {
            await commit(...commitArgs);
            if (!lost) {
              lost = true;
              throw new Error('QA committed transaction response lost');
            }
          });
          return session;
        });
        const provider = vi.fn(async () => undefined);
        await ensure(sandboxId, async (operation) => {
          await operation.remoteEffect(provider);
          await operation.checkpoint('ready', { status: 'running' });
        });
        expect(lost).toBe(true);
        expect(provider).toHaveBeenCalledOnce();
        expect(await MongoSandboxInstance.countDocuments({ status: 'running' })).toBe(1);
      }
    );

    it.each(['effectState', 'extraError', 'extraUnknown'] as const)(
      'does not replay its committed claim after %s changes',
      async (change) => {
        const sandboxId = randomUUID();
        const originalStart = connectionMongo.startSession.bind(connectionMongo);
        const changedOperation = {
          effectState: { effectState: 'pending' },
          extraError: { error: { code: 'qa_unknown', message: 'QA changed claim' } },
          extraUnknown: { futureField: null }
        }[change];
        let lost = false;
        vi.spyOn(connectionMongo, 'startSession').mockImplementation(async (...args) => {
          const session = await originalStart(...args);
          const commit = session.commitTransaction.bind(session);
          vi.spyOn(session, 'commitTransaction').mockImplementation(async (...commitArgs) => {
            await commit(...commitArgs);
            if (!lost) {
              lost = true;
              await MongoSandboxInstance.collection.updateOne(
                { sandboxId },
                {
                  $set: Object.fromEntries(
                    Object.entries(changedOperation).map(([key, value]) => [
                      `operation.${key}`,
                      value
                    ])
                  )
                }
              );
              throw new Error('QA committed transaction response lost');
            }
          });
          return session;
        });
        const provider = vi.fn();
        await expect(ensure(sandboxId, provider)).rejects.toThrow('sandbox limit reached');
        expect(lost).toBe(true);
        expect(provider).not.toHaveBeenCalled();
        expect(await MongoSandboxInstance.countDocuments({ sandboxId })).toBe(1);
        expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
          capacityReserved: true,
          status: 'provisioning',
          operation: changedOperation
        });
      }
    );
  }
);
