import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { runSandboxOperation } from '@fastgpt/service/core/ai/sandbox/operation';
import { sweepOrphanSandboxes } from '@fastgpt/service/core/ai/sandbox/orphan';
import {
  auditSandboxArchives,
  retryDeletedAppCleanup
} from '@fastgpt/service/core/ai/sandbox/orphanMaintenance';
import { withSandboxReadLease } from '@fastgpt/service/core/ai/sandbox/lease';

const fake = vi.hoisted(() => ({
  redis: new Map<string, { token: string; expiresAt: number }>(),
  deleted: [] as string[],
  archived: [] as string[],
  beforeEffect: undefined as (() => Promise<void>) | undefined,
  failure: false,
  listArchives: vi.fn(),
  retryApp: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/sandbox/archiveStorage', () => ({
  getSandboxArchiveStorage: () => ({ list: fake.listArchives })
}));
vi.mock('@fastgpt/service/core/app/delete', () => ({ retryAppDeleteJob: fake.retryApp }));
vi.mock('@fastgpt/service/common/redis', async (original) => {
  const actual = await original<typeof import('@fastgpt/service/common/redis')>();
  const { createLeaseRedisEval } = await import('./leaseRedisMock');
  const evalRedis = createLeaseRedisEval(fake.redis);
  return {
    ...actual,
    getGlobalRedisConnection: () => ({
      set: async (key: string, token: string, _mode: string, ttl: number) => {
        if (fake.redis.has(key)) return null;
        fake.redis.set(key, { token, expiresAt: Date.now() + ttl });
        return 'OK';
      },
      eval: evalRedis
    })
  };
});
vi.mock('@fastgpt/service/core/ai/sandbox/controller', () => ({
  getExistingSandboxClient: (doc: any) => ({
    delete: async (options: any) => {
      await fake.beforeEffect?.();
      await runSandboxOperation(
        {
          provider: doc.provider,
          sandboxId: doc.sandboxId,
          action: 'delete',
          expectedInstance: doc,
          ...options
        },
        async (operation) => {
          if (fake.failure) throw new Error('cleanup unavailable');
          fake.deleted.push(doc.sandboxId);
          await operation.remove();
        }
      );
    },
    stop: async (options: any) => {
      await fake.beforeEffect?.();
      await runSandboxOperation(
        {
          provider: doc.provider,
          sandboxId: doc.sandboxId,
          action: 'stop',
          expectedInstance: doc,
          assertAuthorized: options.assertAuthorized
        },
        async (operation) => operation.checkpoint('provider_stopped', { status: 'stopped' })
      );
    },
    archive: async (options: any) => {
      await fake.beforeEffect?.();
      await runSandboxOperation(
        {
          provider: doc.provider,
          sandboxId: doc.sandboxId,
          action: 'archive',
          expectedInstance: doc,
          assertAuthorized: options.assertAuthorized
        },
        async (operation) => {
          fake.archived.push(doc.sandboxId);
          await operation.checkpoint('archived', { status: 'archived' });
        }
      );
    }
  }),
  recoverSandboxOperation: vi.fn()
}));

const appId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const teamId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const userId = 'cccccccccccccccccccccccc';
const start = new Date('2026-10-01T00:00:00Z');
const afterGrace = new Date(start.getTime() + 25 * 3600_000);
const sweep = (now = start) =>
  sweepOrphanSandboxes({ provider: 'opensandbox', now, graceHours: 24, batchSize: 2 });
const seed = async (fields: Record<string, unknown> = {}) =>
  (
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: 'test-orphan',
      sourceType: 'appRuntime',
      sourceId: appId,
      runtimeUserId: userId,
      reuseScope: 'user',
      teamId,
      status: 'stopped',
      lastActiveAt: new Date(start.getTime() - 48 * 3600_000),
      ...fields
    })
  ).toObject();
const saveApp = (fields = {}) =>
  MongoApp.collection.insertOne({
    _id: new MongoApp.base.Types.ObjectId(appId),
    teamId: new MongoApp.base.Types.ObjectId(teamId),
    ...fields
  });
const saveChat = (fields = {}) =>
  MongoChat.collection.insertOne({
    appId: new MongoChat.base.Types.ObjectId(appId),
    teamId: new MongoChat.base.Types.ObjectId(teamId),
    tmbId: new MongoChat.base.Types.ObjectId(userId),
    chatId: 'chat',
    ...fields
  });

beforeEach(async () => {
  vi.restoreAllMocks();
  fake.redis.clear();
  fake.deleted.length = 0;
  fake.archived.length = 0;
  fake.beforeEffect = undefined;
  fake.failure = false;
  fake.listArchives.mockReset();
  fake.retryApp.mockReset();
  await Promise.all([
    MongoSandboxInstance.deleteMany({}),
    MongoApp.deleteMany({}),
    MongoChat.deleteMany({}),
    MongoAgentSkills.deleteMany({})
  ]);
});

describe('orphan maintenance', () => {
  it('does not bypass orphan grace or provider ownership checks by retrying the whole App job', async () => {
    await saveApp({ deleteTime: start });
    await seed();
    await retryDeletedAppCleanup({ now: afterGrace, graceHours: 24 });
    expect(fake.retryApp).not.toHaveBeenCalled();
    await MongoSandboxInstance.deleteMany({});
    await retryDeletedAppCleanup({ now: afterGrace, graceHours: 24 });
    expect(fake.retryApp).toHaveBeenCalledOnce();
  });
  it('audits unreferenced archives without removing files and protects pending uploads', async () => {
    await seed({ archiveKeys: ['sandbox/archive/test-orphan/pending.tar.gz'] });
    fake.listArchives.mockResolvedValue([
      'sandbox/archive/test-orphan/pending.tar.gz',
      'sandbox/archive/missing/unowned.tar.gz'
    ]);
    expect(await auditSandboxArchives({ batchSize: 1 })).toEqual({ scanned: 2, unreferenced: 1 });
    expect(await MongoSandboxInstance.countDocuments()).toBe(1);
    expect(fake.deleted).toEqual([]);
  });

  it('does not report archives as unreferenced if MongoDB is unavailable', async () => {
    fake.listArchives.mockResolvedValue(['sandbox/archive/missing/unowned.tar.gz']);
    vi.spyOn(MongoSandboxInstance, 'find').mockImplementationOnce(
      () =>
        ({
          lean: async () => {
            throw new Error('query unavailable');
          }
        }) as any
    );
    await expect(auditSandboxArchives()).rejects.toThrow('query unavailable');
  });

  it('reenqueues soft-deleted apps only after the grace period', async () => {
    await saveApp({ deleteTime: start });
    await retryDeletedAppCleanup({ now: start, graceHours: 24 });
    expect(fake.retryApp).not.toHaveBeenCalled();
    await retryDeletedAppCleanup({ now: afterGrace, graceHours: 24 });
    expect(fake.retryApp).toHaveBeenCalledWith({ appId, teamId });
  });
});

describe('sandbox orphan sweep', () => {
  it('defers records created during a scan to the next bounded pass', async () => {
    await seed();
    vi.spyOn(MongoApp, 'findOne').mockImplementationOnce(
      () =>
        ({
          lean: async () => {
            await seed({ sandboxId: 'created-during-scan' });
            return null;
          }
        }) as any
    );
    const result = await sweepOrphanSandboxes({
      provider: 'opensandbox',
      now: start,
      graceHours: 24,
      batchSize: 1
    });
    expect(result.scanned).toBe(1);
    expect(
      (await MongoSandboxInstance.findOne({ sandboxId: 'created-during-scan' }).lean())?.orphan
    ).toBeUndefined();
    expect((await sweep()).scanned).toBe(2);
  });
  it('retains corrupt source discriminators instead of guessing App ownership', async () => {
    const doc = await seed({ reuseScope: 'session', sessionId: 'chat' });
    await MongoSandboxInstance.collection.updateOne(
      { _id: doc._id as any },
      { $set: { sourceType: 'unknownSource' } }
    );
    await sweep();
    await sweep(afterGrace);
    expect(fake.deleted).toEqual([]);
    expect((await MongoSandboxInstance.findOne().lean())?.orphan).toBeUndefined();
  });
  it('cleans a soft-deleted App and an explicit pending workspace deletion', async () => {
    await saveApp({ deleteTime: start });
    await seed();
    await sweep();
    await sweep(afterGrace);
    expect(fake.deleted).toEqual(['test-orphan']);
    await MongoApp.updateOne({}, { $set: { deleteTime: null } });
    await seed({ sandboxId: 'delete-request', deleteTime: start });
    await sweep();
    await sweep(afterGrace);
    expect(fake.deleted).toEqual(['test-orphan', 'delete-request']);
  });

  it('keeps an active Skill edit workspace and cleans it after Skill deletion', async () => {
    await MongoAgentSkills.collection.insertOne({
      _id: new MongoAgentSkills.base.Types.ObjectId(appId),
      teamId: new MongoAgentSkills.base.Types.ObjectId(teamId)
    });
    await seed({
      sourceType: 'skillEdit',
      reuseScope: undefined,
      runtimeUserId: 'skillEdit',
      sessionId: 'edit-debug'
    });
    await sweep();
    expect((await MongoSandboxInstance.findOne().lean())?.orphan).toBeUndefined();
    await MongoAgentSkills.updateOne({}, { $set: { deleteTime: start } });
    await sweep();
    await sweep(afterGrace);
    expect(fake.deleted).toEqual(['test-orphan']);
  });

  it('does not adopt another user chat as a valid reference or delete on an ownership conflict', async () => {
    await saveApp();
    await saveChat({ tmbId: new MongoChat.base.Types.ObjectId('dddddddddddddddddddddddd') });
    await seed({ reuseScope: 'session', sessionId: 'chat' });
    await sweep();
    await sweep(afterGrace);
    expect((await MongoSandboxInstance.findOne().lean())?.orphan).toBeUndefined();
    expect(fake.deleted).toEqual([]);
    expect(fake.archived).toEqual([]);
  });

  it('retains an uncertain provisioning operation rather than taking over its effects', async () => {
    await seed({
      status: 'provisioning',
      operation: {
        id: 'unknown',
        type: 'provision',
        checkpoint: 'provider_ensure',
        startedAt: start,
        updatedAt: start,
        effectState: 'pending',
        failureDisposition: 'unknown'
      }
    });
    await sweep();
    await sweep(afterGrace);
    expect(fake.deleted).toEqual([]);
    expect((await MongoSandboxInstance.findOne().lean())?.operation?.id).toBe('unknown');
  });

  it('waits for active readers and rechecks the completed activity before deleting', async () => {
    await seed();
    await sweep();
    let release!: () => void;
    let entered!: () => void;
    let selected!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const acquired = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const attempted = new Promise<void>((resolve) => {
      selected = resolve;
    });
    const reader = withSandboxReadLease('sandbox:lease:opensandbox:test-orphan', async () => {
      entered();
      await held;
    });
    await acquired;
    fake.beforeEffect = async () => {
      selected();
    };
    let completed = false;
    const scanning = sweep(afterGrace).then(() => {
      completed = true;
    });
    try {
      await attempted;
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(completed).toBe(false);
      expect(fake.deleted).toEqual([]);
      await MongoSandboxInstance.updateOne({}, { $set: { lastActiveAt: afterGrace } });
    } finally {
      release();
      await reader;
      await scanning;
    }
    expect(fake.deleted).toEqual([]);
  });

  it('stops a nonpersistent legacy chat but retains its files instead of deleting it', async () => {
    await saveApp();
    await seed({ reuseScope: 'session', sessionId: 'chat', status: 'running' });
    await sweep();
    await sweep(afterGrace);
    expect((await MongoSandboxInstance.findOne().lean())?.status).toBe('stopped');
    expect(fake.deleted).toEqual([]);
    expect(fake.archived).toEqual([]);
  });

  it('marks a missing source and deletes only after the grace period', async () => {
    await seed();
    await sweep();
    expect((await MongoSandboxInstance.findOne().lean())?.orphan).toMatchObject({
      reason: 'source_deleted',
      detectedAt: start
    });
    await sweep(new Date(start.getTime() + 23 * 3600_000));
    expect(fake.deleted).toEqual([]);
    await sweep(afterGrace);
    expect(fake.deleted).toEqual(['test-orphan']);
    expect(await MongoSandboxInstance.countDocuments()).toBe(0);
  });

  it('keeps a shared user workspace without chats while its App is active', async () => {
    await saveApp();
    await seed();
    await sweep();
    await sweep(afterGrace);
    expect(fake.deleted).toEqual([]);
    expect((await MongoSandboxInstance.findOne().lean())?.orphan).toBeUndefined();
  });

  it('clears the marker if the source returns', async () => {
    await seed();
    await sweep();
    await saveApp();
    await sweep(afterGrace);
    expect((await MongoSandboxInstance.findOne().lean())?.orphan).toBeUndefined();
    expect(fake.deleted).toEqual([]);
  });

  it('restarts the grace period after new activity', async () => {
    await seed();
    await sweep();
    await MongoSandboxInstance.updateOne({}, { $set: { lastActiveAt: afterGrace } });
    await sweep(afterGrace);
    expect((await MongoSandboxInstance.findOne().lean())?.orphan?.detectedAt).toEqual(afterGrace);
    expect(fake.deleted).toEqual([]);
  });

  it('archives a historical unreferenced chat and retains its database record', async () => {
    await saveApp();
    await seed({
      reuseScope: 'session',
      sessionId: 'chat',
      status: 'running',
      storage: { volumeManager: { ensured: true } }
    });
    await sweep();
    await sweep(afterGrace);
    expect(fake.archived).toEqual(['test-orphan']);
    expect((await MongoSandboxInstance.findOne().lean())?.status).toBe('archived');
    expect(fake.deleted).toEqual([]);
  });

  it('recognizes the original chat behind legacy test/debug session ids', async () => {
    await saveApp();
    await saveChat();
    await seed({
      reuseScope: 'session',
      sessionId: JSON.stringify(['test', appId, 'node', 'chat'])
    });
    await sweep();
    expect((await MongoSandboxInstance.findOne().lean())?.orphan).toBeUndefined();
  });

  it('does not treat a query error or a team mismatch as a deleted source', async () => {
    await seed();
    vi.spyOn(MongoApp, 'findOne').mockImplementationOnce(
      () =>
        ({
          lean: async () => {
            throw new Error('database unavailable');
          }
        }) as any
    );
    await sweep();
    expect((await MongoSandboxInstance.findOne().lean())?.orphan).toBeUndefined();
    await saveApp({ teamId: new MongoApp.base.Types.ObjectId('dddddddddddddddddddddddd') });
    await sweep(afterGrace);
    expect((await MongoSandboxInstance.findOne().lean())?.orphan).toBeUndefined();
    expect(fake.deleted).toEqual([]);
  });

  it('rechecks references after taking the lifecycle lease', async () => {
    await saveApp();
    await seed({
      reuseScope: 'session',
      sessionId: 'chat',
      storage: { volumeManager: { ensured: true } }
    });
    await sweep();
    fake.beforeEffect = async () => {
      await saveChat();
      fake.beforeEffect = undefined;
    };
    await sweep(afterGrace);
    expect(fake.archived).toEqual([]);
  });

  it('refuses cleanup if activity changed between selection and execution', async () => {
    await seed();
    await sweep();
    fake.beforeEffect = async () => {
      await MongoSandboxInstance.updateOne({}, { $set: { lastActiveAt: afterGrace } });
    };
    await sweep(afterGrace);
    expect(fake.deleted).toEqual([]);
  });

  it('retains failed deletion checkpoints and retries on the next sweep', async () => {
    await seed();
    await sweep();
    fake.failure = true;
    await sweep(afterGrace);
    expect((await MongoSandboxInstance.findOne().lean())?.status).toBe('deleting');
    fake.failure = false;
    await sweep(new Date(afterGrace.getTime() + 3600_000));
    expect(fake.deleted).toEqual(['test-orphan']);
  });

  it('uses the Skill source for legacy edit workspaces', async () => {
    await seed({
      sourceType: undefined,
      sourceId: undefined,
      reuseScope: undefined,
      runtimeUserId: undefined,
      teamId: undefined,
      appId,
      userId,
      chatId: 'edit-debug',
      metadata: { sandboxType: 'edit-debug', skillId: appId, teamId }
    });
    await saveApp();
    await sweep();
    await sweep(afterGrace);
    expect(fake.deleted).toEqual(['test-orphan']);
  });

  it('isolates malformed records and scans later pages', async () => {
    await seed({ sandboxId: 'invalid', appId: 'different-app' });
    await seed({ sandboxId: 'valid-a' });
    await seed({ sandboxId: 'valid-b' });
    const result = await sweep();
    expect(result.scanned).toBe(3);
    expect(await MongoSandboxInstance.countDocuments({ orphan: { $exists: true } })).toBe(2);
  });
});
