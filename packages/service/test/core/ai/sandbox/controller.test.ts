import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const {
  providerDelete,
  providerConnect,
  providerEnsure,
  providerInspect,
  createProvider,
  volumeEnsure,
  volumeDelete,
  redisSet,
  redisEval,
  redisStorage,
  loggerError,
  loggerWarn
} = vi.hoisted(() => ({
  providerDelete: vi.fn(),
  providerConnect: vi.fn(),
  providerEnsure: vi.fn(),
  providerInspect: vi.fn(),
  createProvider: vi.fn(),
  volumeEnsure: vi.fn(),
  volumeDelete: vi.fn(),
  redisSet: vi.fn(),
  redisEval: vi.fn(),
  redisStorage: new Map<string, { token: string; expiresAt: number }>(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn()
}));

vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/env')>();
  return {
    env: {
      ...original.env,
      AGENT_SANDBOX_PROVIDER: 'opensandbox',
      AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://mock-sandbox.local',
      AGENT_SANDBOX_VOLUME_MANAGER_URL: 'http://volume.test',
      AGENT_SANDBOX_ENABLE_VOLUME: true
    }
  };
});

vi.mock('@fastgpt-sdk/sandbox-adapter', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt-sdk/sandbox-adapter')>();
  class OpenSandboxAdapter {
    readonly provider = 'opensandbox';
    ensureRunning = providerEnsure;
    constructor(private readonly sandboxId: string) {}
    get id() {
      return `provider-${this.sandboxId}`;
    }
    inspectExisting(id: string) {
      return providerInspect(id);
    }
    connectExisting() {
      return providerConnect(this.sandboxId);
    }
    delete() {
      return providerDelete(this.sandboxId);
    }
  }
  return {
    ...original,
    OpenSandboxAdapter,
    createSandbox: (provider: string, config: { sessionId: string }, createConfig: unknown) => {
      createProvider(provider, config, createConfig);
      return new OpenSandboxAdapter(config.sessionId);
    }
  };
});
vi.mock('@fastgpt/service/core/ai/sandbox/config', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/config')>();
  return { ...original, getVolumeManagerConfig: volumeEnsure, deleteSessionVolume: volumeDelete };
});
vi.mock('@fastgpt/service/common/redis', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/common/redis')>();
  return { ...original, getGlobalRedisConnection: () => ({ set: redisSet, eval: redisEval }) };
});
vi.mock('@fastgpt/service/common/logger', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/common/logger')>();
  return {
    ...original,
    getLogger: () => ({ info: vi.fn(), debug: vi.fn(), error: loggerError, warn: loggerWarn })
  };
});

import { connectionMongo } from '@fastgpt/service/common/mongo';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import {
  deleteSandboxesByChatIds,
  deleteSandboxesByAppId
} from '@fastgpt/service/core/ai/sandbox/controller';

const { Types } = connectionMongo;
const oid = () => String(new Types.ObjectId());

beforeEach(() => {
  vi.clearAllMocks();
  redisStorage.clear();
  providerConnect.mockResolvedValue(true);
  providerDelete.mockResolvedValue(undefined);
  providerInspect.mockResolvedValue(null);
  volumeDelete.mockResolvedValue(undefined);
  redisSet.mockImplementation(async (key: string, token: string, _mode: string, ttl: number) => {
    const current = redisStorage.get(key);
    if (current && current.expiresAt > Date.now()) return null;
    redisStorage.set(key, { token, expiresAt: Date.now() + ttl });
    return 'OK';
  });
  redisEval.mockImplementation(
    async (script: string, _keys: number, key: string, token: string, ttl?: number) => {
      const current = redisStorage.get(key);
      if (!current || current.token !== token || current.expiresAt <= Date.now()) return 0;
      if (script.includes('pexpire') && ttl) current.expiresAt = Date.now() + ttl;
      else redisStorage.delete(key);
      return 1;
    }
  );
});

afterEach(() => {
  expect(loggerError).not.toHaveBeenCalled();
  expect(loggerWarn).not.toHaveBeenCalled();
  expect(providerEnsure).not.toHaveBeenCalled();
  expect(volumeEnsure).not.toHaveBeenCalled();
  expect(redisStorage.size).toBe(0);
});

const appId1 = oid();
const appId2 = oid();

describe.each(['app', 'chat'] as const)('Sandbox %s cleanup source isolation', (mode) => {
  it('deletes only canonical or unambiguous legacy runtime records and preserves Skill Edit', async () => {
    const runtime = {
      sourceType: 'appRuntime',
      sourceId: appId1,
      runtimeUserId: 'runtime-user',
      sessionId: 'selected-chat'
    };
    const candidates = [
      { sandboxId: 'canonical-runtime', ...runtime },
      {
        sandboxId: 'canonical-without-legacy-fields',
        ...runtime,
        appId: undefined,
        userId: undefined,
        chatId: undefined
      },
      { sandboxId: 'legacy-runtime' },
      { sandboxId: 'legacy-session-runtime', metadata: { sandboxType: 'session-runtime' } },
      { sandboxId: 'canonical-edit', sourceType: 'skillEdit', sourceId: appId1 },
      { sandboxId: 'legacy-edit', metadata: { sandboxType: 'edit-debug', skillId: appId1 } },
      { sandboxId: 'legacy-edit-sentinel', chatId: 'edit-debug' },
      { sandboxId: 'legacy-skill-marker', metadata: { skillId: appId1 } },
      { sandboxId: 'canonical-conflicting-source', ...runtime, sourceId: appId2 },
      { sandboxId: 'canonical-conflicting-legacy-app', ...runtime, appId: appId2 },
      { sandboxId: 'canonical-conflicting-legacy-chat', ...runtime, chatId: 'other-chat' },
      { sandboxId: 'canonical-conflicting-legacy-user', ...runtime, userId: 'other-user' },
      { sandboxId: 'partial-legacy-source', sourceId: appId1 },
      { sandboxId: 'legacy-missing-user', userId: undefined },
      { sandboxId: 'legacy-unknown-type', metadata: { sandboxType: 'unrecognized' } }
    ];
    await MongoSandboxInstance.create(
      candidates.map((fields) => ({
        provider: 'opensandbox',
        appId: appId1,
        userId: 'runtime-user',
        chatId: 'selected-chat',
        status: 'running',
        ...fields
      }))
    );

    await expect(
      mode === 'app'
        ? deleteSandboxesByAppId(appId1)
        : deleteSandboxesByChatIds({ appId: appId1, chatIds: ['selected-chat', 'edit-debug'] })
    ).rejects.toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({ message: 'sandbox_identity_conflict' })
      ])
    });

    const deleted = [
      'canonical-runtime',
      'canonical-without-legacy-fields',
      'legacy-runtime',
      'legacy-session-runtime'
    ];
    expect(providerDelete.mock.calls.map(([id]) => id).sort()).toEqual(deleted.sort());
    expect(providerInspect).toHaveBeenCalledExactlyOnceWith('provider-legacy-session-runtime');
    expect(volumeDelete.mock.calls.map(([id]) => id).sort()).toEqual(deleted.sort());
    expect(
      (await MongoSandboxInstance.find().lean()).map(({ sandboxId }) => sandboxId).sort()
    ).toEqual(
      candidates
        .filter(({ sandboxId }) => !deleted.includes(sandboxId))
        .map(({ sandboxId }) => sandboxId)
        .sort()
    );
  });
});

describe('deleteSandboxesByChatIds', () => {
  beforeEach(async () => {
    await MongoSandboxInstance.create([
      {
        provider: 'opensandbox',
        sandboxId: 'sb1',
        appId: appId1,
        userId: 'u1',
        chatId: 'c1',
        status: 'running',
        lastActiveAt: new Date(),
        createdAt: new Date()
      },
      {
        provider: 'opensandbox',
        sandboxId: 'sb2',
        appId: appId1,
        userId: 'u1',
        chatId: 'c2',
        status: 'running',
        lastActiveAt: new Date(),
        createdAt: new Date()
      },
      {
        provider: 'opensandbox',
        sandboxId: 'sb3',
        appId: appId2,
        userId: 'u1',
        chatId: 'c1',
        status: 'running',
        lastActiveAt: new Date(),
        createdAt: new Date()
      }
    ]);
  });

  it('should call delete for specified chatIds', async () => {
    const countBefore = await MongoSandboxInstance.countDocuments({ appId: appId1 });
    expect(countBefore).toBe(2);

    await deleteSandboxesByChatIds({ appId: appId1, chatIds: ['c1', 'c2'] });

    expect(await MongoSandboxInstance.countDocuments({ appId: appId1 })).toBe(0);
    expect(providerDelete).toHaveBeenCalledTimes(2);
    expect(providerDelete.mock.calls.map(([id]) => id).sort()).toEqual(['sb1', 'sb2']);
    expect(providerConnect.mock.calls.map(([id]) => id).sort()).toEqual(['sb1', 'sb2']);
    expect(volumeDelete.mock.calls.map(([id]) => id).sort()).toEqual(['sb1', 'sb2']);
    expect(
      createProvider.mock.calls.every(
        ([provider, , config]) => provider === 'opensandbox' && config === undefined
      )
    ).toBe(true);
    expect(redisEval).toHaveBeenCalled();
    // 验证不影响其他 appId 的数据
    expect(await MongoSandboxInstance.countDocuments({ appId: appId2 })).toBe(1);
  });

  it('should not error when chatId does not exist', async () => {
    await expect(
      deleteSandboxesByChatIds({ appId: appId1, chatIds: ['nonexistent'] })
    ).resolves.not.toThrow();
    expect(await MongoSandboxInstance.countDocuments()).toBe(3);
    expect(providerDelete).not.toHaveBeenCalled();
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('should handle empty chatIds array', async () => {
    await expect(deleteSandboxesByChatIds({ appId: appId1, chatIds: [] })).resolves.not.toThrow();
    expect(await MongoSandboxInstance.countDocuments()).toBe(3);
    expect(providerDelete).not.toHaveBeenCalled();
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('deletes only selected chats and preserves another app with the same chat ID', async () => {
    await deleteSandboxesByChatIds({ appId: appId1, chatIds: ['c1'] });
    expect(await MongoSandboxInstance.exists({ sandboxId: 'sb1' })).toBeNull();
    expect(await MongoSandboxInstance.exists({ sandboxId: 'sb2' })).not.toBeNull();
    expect(await MongoSandboxInstance.exists({ sandboxId: 'sb3' })).not.toBeNull();
    expect(providerDelete).toHaveBeenCalledExactlyOnceWith('sb1');
    expect(volumeDelete).toHaveBeenCalledExactlyOnceWith(
      'sb1',
      expect.objectContaining({
        binding: expect.objectContaining({ protocol: 'sessionId', target: 'sb1' })
      })
    );
  });
});

describe('deleteSandboxesByAppId', () => {
  beforeEach(async () => {
    await MongoSandboxInstance.create([
      {
        provider: 'opensandbox',
        sandboxId: 'sb1',
        appId: appId1,
        userId: 'u1',
        chatId: 'c1',
        status: 'running',
        lastActiveAt: new Date(),
        createdAt: new Date()
      },
      {
        provider: 'opensandbox',
        sandboxId: 'sb2',
        appId: appId1,
        userId: 'u1',
        chatId: 'c2',
        status: 'stopped',
        lastActiveAt: new Date(),
        createdAt: new Date()
      },
      {
        provider: 'opensandbox',
        sandboxId: 'sb3',
        appId: appId2,
        userId: 'u1',
        chatId: 'c3',
        status: 'running',
        lastActiveAt: new Date(),
        createdAt: new Date()
      }
    ]);
  });

  it('should call delete for all sandboxes under appId', async () => {
    const countBefore = await MongoSandboxInstance.countDocuments({ appId: appId1 });
    expect(countBefore).toBe(2);

    await deleteSandboxesByAppId(appId1);

    expect(await MongoSandboxInstance.countDocuments({ appId: appId1 })).toBe(0);
    expect(providerDelete).toHaveBeenCalledTimes(2);
    expect(providerDelete.mock.calls.map(([id]) => id).sort()).toEqual(['sb1', 'sb2']);
    expect(providerConnect.mock.calls.map(([id]) => id).sort()).toEqual(['sb1', 'sb2']);
    expect(volumeDelete.mock.calls.map(([id]) => id).sort()).toEqual(['sb1', 'sb2']);
    expect(redisEval).toHaveBeenCalled();
    // 验证不影响其他 appId 的数据
    expect(await MongoSandboxInstance.countDocuments({ appId: appId2 })).toBe(1);
  });

  it('should not error when appId has no sandboxes', async () => {
    const emptyAppId = oid();
    await expect(deleteSandboxesByAppId(emptyAppId)).resolves.not.toThrow();
    expect(await MongoSandboxInstance.countDocuments()).toBe(3);
    expect(providerDelete).not.toHaveBeenCalled();
    expect(createProvider).not.toHaveBeenCalled();
  });
});

describe('cronJob - suspendInactiveSandboxes', () => {
  it('should identify running sandboxes inactive > 5 min', async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000);
    const recent = new Date();

    await MongoSandboxInstance.create([
      {
        provider: 'sealosdevbox',
        sandboxId: 'old1',
        appId: appId1,
        userId: 'u',
        chatId: 'c1',
        status: 'running',
        lastActiveAt: old,
        createdAt: old
      },
      {
        provider: 'sealosdevbox',
        sandboxId: 'recent1',
        appId: appId1,
        userId: 'u',
        chatId: 'c2',
        status: 'running',
        lastActiveAt: recent,
        createdAt: recent
      },
      {
        provider: 'sealosdevbox',
        sandboxId: 'already',
        appId: appId1,
        userId: 'u',
        chatId: 'c3',
        status: 'stopped',
        lastActiveAt: old,
        createdAt: old
      }
    ]);

    // 模拟定时任务的查询逻辑
    const instances = await MongoSandboxInstance.find({
      status: SandboxStatusEnum.running,
      lastActiveAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) }
    }).lean();

    // 验证查询逻辑正确：只找到超过 5 分钟未活动的 running 状态沙盒
    expect(instances).toHaveLength(1);
    expect(instances[0].sandboxId).toBe('old1');

    // 验证不包含最近活动的沙盒
    expect(instances.find((i) => i.sandboxId === 'recent1')).toBeUndefined();

    // 验证不包含已停止的沙盒
    expect(instances.find((i) => i.sandboxId === 'already')).toBeUndefined();
  });
});
