import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { MongoTimerLock } from '@fastgpt/service/common/system/timerLock/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import {
  getChatSandboxClient,
  getSandboxClient
} from '@fastgpt/service/core/ai/sandbox/controller';
import { runSandboxOperation } from '@fastgpt/service/core/ai/sandbox/operation';

type ProviderImage = { repository: string; tag?: string };
type RemoteSandbox = {
  id: string;
  status: { state: 'Running' | 'Stopped' };
  image: ProviderImage;
};

const fake = vi.hoisted(() => ({
  redis: new Map<string, { token: string; expiresAt: number }>(),
  remotes: new Map<string, RemoteSandbox>(),
  image: { repository: 'runtime-image', tag: 'v1' } as ProviderImage,
  ensure: vi.fn(),
  start: vi.fn(),
  editorConnections: 0,
  execute: vi.fn()
}));

vi.unmock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/env', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/env')>()),
  env: {
    AGENT_SANDBOX_PROVIDER: 'opensandbox',
    AGENT_SANDBOX_OPENSANDBOX_RUNTIME: 'docker',
    AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://sandbox.test',
    AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: 'runtime-image',
    AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG: 'v1',
    AGENT_SANDBOX_ENABLE_VOLUME: false
  }
}));
vi.mock('@fastgpt/service/common/redis', async (original) => {
  const { createLeaseRedisEval } = await import('./leaseRedisMock');
  const evalLease = createLeaseRedisEval(fake.redis);
  return {
    ...(await original<typeof import('@fastgpt/service/common/redis')>()),
    getGlobalRedisConnection: () => ({
      set: async (key: string, token: string, _mode: string, ttl: number) => {
        const existing = fake.redis.get(key);
        if (existing && existing.expiresAt > Date.now()) return null;
        fake.redis.set(key, { token, expiresAt: Date.now() + ttl });
        return 'OK';
      },
      eval: async (script: string, keys: number, ...args: (string | number)[]) =>
        script.includes('local mode = ARGV[1]')
          ? fake.editorConnections
          : evalLease(script, keys, ...args)
    })
  };
});
vi.mock('@fastgpt-sdk/sandbox-adapter', async (original) => {
  const actual = await original<typeof import('@fastgpt-sdk/sandbox-adapter')>();
  class OpenSandboxAdapter {
    readonly provider = 'opensandbox';
    readonly rootPath = '/workspace';
    constructor(private readonly sessionId: string) {}
    get id() {
      return fake.remotes.get(this.sessionId)?.id;
    }
    async connectExisting() {
      return fake.remotes.has(this.sessionId);
    }
    async inspectExisting(id: string) {
      return [...fake.remotes.values()].find((remote) => remote.id === id) ?? null;
    }
    async ensureRunning() {
      fake.ensure(this.sessionId);
      fake.remotes.set(this.sessionId, {
        id: `provider-${this.sessionId}`,
        status: { state: 'Running' },
        image: { ...fake.image }
      });
    }
    async connect(id: string) {
      if (this.id !== id) throw new Error('Wrong provider id');
    }
    async start() {
      fake.start(this.id);
      const remote = fake.remotes.get(this.sessionId);
      if (!remote) throw new Error('Missing provider');
      remote.status.state = 'Running';
    }
    async getInfo() {
      return fake.remotes.get(this.sessionId) ?? null;
    }
    execute = fake.execute;
    async close() {}
  }
  return {
    ...actual,
    OpenSandboxAdapter,
    createSandbox: (_provider: unknown, connection: { sessionId: string }) =>
      new OpenSandboxAdapter(connection.sessionId)
  };
});

let appId: string;
let previousConfig: typeof global.feConfigs;

beforeEach(async () => {
  vi.clearAllMocks();
  fake.redis.clear();
  fake.remotes.clear();
  fake.editorConnections = 0;
  fake.image = { repository: 'runtime-image', tag: 'v1' };
  fake.execute.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
  previousConfig = global.feConfigs;
  global.feConfigs = {
    ...global.feConfigs,
    limit: { agentSandboxMaxEditDebug: 10, agentSandboxMaxSessionRuntime: 1 }
  };
  await MongoSandboxInstance.createCollection();
  await MongoTimerLock.createCollection();
  await MongoTimerLock.init();
  const source = {
    _id: new connectionMongo.Types.ObjectId(),
    teamId: new connectionMongo.Types.ObjectId(),
    tmbId: new connectionMongo.Types.ObjectId()
  };
  await MongoApp.collection.insertOne(source);
  appId = String(source._id);
});

afterEach(() => {
  global.feConfigs = previousConfig;
  expect(fake.redis.size).toBe(0);
});

const acquire = (userId = 'user-1', chatId = 'chat-1') =>
  getSandboxClient({ appId, userId, chatId });

describe('ordinary runtime Sandbox metadata and admission', () => {
  it('classifies and reserves a runtime slot without caller-supplied creation metadata', async () => {
    const client = await acquire();
    expect(await MongoSandboxInstance.findOne({ sandboxId: client.id }).lean()).toMatchObject({
      sourceType: 'appRuntime',
      status: 'running',
      reuseScope: 'user',
      capacityReserved: true,
      metadata: { sandboxType: SandboxTypeEnum.sessionRuntime }
    });
  });

  it('rejects a zero runtime limit before creating compute or a workspace record', async () => {
    global.feConfigs.limit!.agentSandboxMaxSessionRuntime = 0;
    await expect(acquire()).rejects.toThrow('sandbox limit reached');
    expect(fake.ensure).not.toHaveBeenCalled();
    expect(fake.execute).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.countDocuments()).toBe(0);
  });

  it('reuses the same user workspace across chats without reserving another slot', async () => {
    const first = await acquire('user-1', 'chat-1');
    const second = await acquire('user-1', 'chat-2');
    expect(second.id).toBe(first.id);
    expect(fake.ensure).toHaveBeenCalledOnce();
    expect(await MongoSandboxInstance.countDocuments()).toBe(1);
    await expect(acquire('user-2')).rejects.toThrow('sandbox limit reached');
    expect(fake.ensure).toHaveBeenCalledOnce();
  });

  it('counts existing appRuntime instances even when sandboxType was never recorded', async () => {
    await MongoSandboxInstance.create({
      sandboxId: randomUUID(),
      provider: 'opensandbox',
      sourceType: 'appRuntime',
      sourceId: appId,
      runtimeUserId: 'old-user',
      reuseScope: 'user',
      status: 'running'
    });
    await expect(acquire()).rejects.toThrow('sandbox limit reached');
    expect(fake.ensure).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.countDocuments()).toBe(1);
  });

  it('keeps Skill Edit occupancy out of the runtime quota despite a stale metadata category', async () => {
    await MongoSandboxInstance.create({
      sandboxId: randomUUID(),
      provider: 'opensandbox',
      sourceType: 'skillEdit',
      sourceId: randomUUID(),
      status: 'running',
      metadata: { sandboxType: SandboxTypeEnum.sessionRuntime }
    });
    await expect(acquire()).resolves.toBeDefined();
    expect(fake.ensure).toHaveBeenCalledOnce();
    expect(await MongoSandboxInstance.countDocuments()).toBe(2);
  });

  it('persists the actual Provider image, including its resolved tag', async () => {
    fake.image = { repository: 'resolved-runtime-image', tag: 'immutable-v1' };
    const client = await acquire();
    const stored = await MongoSandboxInstance.findOne({ sandboxId: client.id }).lean();
    expect(stored?.metadata?.image).toEqual(fake.image);
    expect(stored?.metadata?.providerSandboxId).toBe(fake.remotes.get(client.id)?.id);
  });

  it('fills missing legacy image and provider scope only after connecting the exact live instance', async () => {
    const first = await acquire();
    const before = await MongoSandboxInstance.findOne({ sandboxId: first.id }).lean();
    await MongoSandboxInstance.updateOne(
      { sandboxId: first.id },
      { $unset: { providerScope: 1, 'metadata.image': 1 } }
    );
    const second = await acquire('user-1', 'chat-2');
    expect(second.id).toBe(first.id);
    expect(await MongoSandboxInstance.findOne({ sandboxId: first.id }).lean()).toMatchObject({
      providerScope: before!.providerScope,
      metadata: { image: fake.image },
      operation: { id: before!.operation!.id }
    });
    expect(fake.ensure).toHaveBeenCalledOnce();
  });

  it('does not reconnect or create on a different persisted provider deployment', async () => {
    const client = await acquire();
    await MongoSandboxInstance.updateOne(
      { sandboxId: client.id },
      { $set: { providerScope: 'other-deployment' } }
    );
    await expect(acquire()).rejects.toThrow('Sandbox provider deployment changed');
    expect(fake.ensure).toHaveBeenCalledOnce();
    expect(await MongoSandboxInstance.countDocuments()).toBe(1);
  });

  it.each([{ preserveBoundRuntime: true }, { upgradeImage: false }])(
    'keeps the actual image and instance for browsing options %j despite a different default image',
    async (options) => {
      fake.image = { repository: 'custom-original', tag: 'v0' };
      const client = await acquire();
      const before = await MongoSandboxInstance.findOne({ sandboxId: client.id }).lean();
      const editor = await getChatSandboxClient({
        appId,
        userId: 'user-1',
        chatId: 'chat-1',
        sandboxId: client.id
      });
      await editor.ensureAvailable('interactive', options);
      const after = await MongoSandboxInstance.findOne({ sandboxId: client.id }).lean();
      expect(after?.metadata?.image).toEqual(fake.image);
      expect(after?.metadata?.providerSandboxId).toBe(before?.metadata?.providerSandboxId);
      expect(after?.operation?.id).toBe(before?.operation?.id);
      expect(fake.ensure).toHaveBeenCalledOnce();
    }
  );

  it('resumes the exact paused instance without a volume or replacement creation', async () => {
    const client = await acquire();
    const original = fake.remotes.get(client.id)!;
    original.status.state = 'Stopped';
    await MongoSandboxInstance.updateOne({ sandboxId: client.id }, { $set: { status: 'stopped' } });
    const editor = await getChatSandboxClient({
      appId,
      userId: 'user-1',
      chatId: 'chat-1',
      sandboxId: client.id
    });
    await editor.ensureAvailable('interactive', { preserveBoundRuntime: true });
    expect(fake.start).toHaveBeenCalledWith(original.id);
    expect(fake.ensure).toHaveBeenCalledOnce();
    expect(await MongoSandboxInstance.findOne({ sandboxId: client.id }).lean()).toMatchObject({
      status: 'running',
      metadata: { providerSandboxId: original.id, volumeEnabled: false }
    });
  });

  it('does not recreate an unexpectedly missing instance', async () => {
    const client = await acquire();
    fake.remotes.delete(client.id);
    const editor = await getChatSandboxClient({
      appId,
      userId: 'user-1',
      chatId: 'chat-1',
      sandboxId: client.id
    });
    await expect(
      editor.ensureAvailable('interactive', { preserveBoundRuntime: true })
    ).rejects.toThrow();
    expect(fake.ensure).toHaveBeenCalledOnce();
    expect(fake.remotes.size).toBe(0);
  });

  it('retains a released legacy workspace whose original configuration cannot be verified', async () => {
    const client = await acquire();
    await MongoSandboxInstance.updateOne(
      { sandboxId: client.id },
      {
        $set: { status: 'stopped', releasedAt: new Date() },
        $unset: { 'metadata.runtimeConfig': 1 }
      }
    );
    const editor = await getChatSandboxClient({
      appId,
      userId: 'user-1',
      chatId: 'chat-1',
      sandboxId: client.id
    });
    await expect(
      editor.ensureAvailable('interactive', { preserveBoundRuntime: true })
    ).rejects.toThrow('sandbox_editor_recovery_required');
    expect(fake.ensure).toHaveBeenCalledOnce();
  });

  it.each(['stop', 'release', 'archive'] as const)(
    'rejects %s before changing the operation or status while an editor connection is live',
    async (action) => {
      const client = await acquire();
      const before = await MongoSandboxInstance.findOne({ sandboxId: client.id }).lean();
      await MongoSandboxInstance.updateOne(
        { sandboxId: client.id },
        {
          $set: {
            'metadata.editor': {
              generation: randomUUID(),
              providerSandboxId: before!.metadata!.providerSandboxId,
              providerScope: before!.providerScope,
              status: 'ready',
              endpoint: {
                host: 'gateway',
                port: 8090,
                protocol: 'http',
                url: 'http://gateway:8090'
              },
              startedAt: new Date()
            }
          }
        }
      );
      const instance = await MongoSandboxInstance.findOne({ sandboxId: client.id }).lean();
      fake.editorConnections = 1;
      const effect = vi.fn();
      await expect(
        runSandboxOperation(
          { provider: 'opensandbox', sandboxId: client.id, action, expectedInstance: instance! },
          effect
        )
      ).rejects.toThrow('sandbox_editor_terminal_busy');
      const after = await MongoSandboxInstance.findOne({ sandboxId: client.id }).lean();
      expect(after?.status).toBe('running');
      expect(after?.operation).toEqual(before?.operation);
      expect(effect).not.toHaveBeenCalled();
    }
  );
});
