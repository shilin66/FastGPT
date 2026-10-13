import { afterEach, beforeEach, expect, vi } from 'vitest';
import type { OpenSandboxConfigType } from '@fastgpt-sdk/sandbox-adapter';
import type { PreparedVolumeManagerConfig } from '@fastgpt/service/core/ai/sandbox/config';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { MongoTimerLock } from '@fastgpt/service/common/system/timerLock/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import {
  getChatSandboxClient,
  getSandboxClient
} from '@fastgpt/service/core/ai/sandbox/controller';

type Remote = {
  id: string;
  status: { state: 'Running' | 'Stopped' };
  image: OpenSandboxConfigType['image'];
  claimName: string;
};
const fake = vi.hoisted(() => ({
  redis: new Map<string, { token: string; expiresAt: number }>(),
  remotes: new Map<string, Remote>(),
  volumes: new Map<string, Map<string, string>>(),
  creations: [] as OpenSandboxConfigType[],
  lookupError: undefined as Error | undefined,
  inspectError: undefined as Error | undefined,
  sequence: 0,
  volumeEnsure: vi.fn(),
  volumeConfirm: vi.fn(),
  volumeInspect: vi.fn(),
  backupExists: vi.fn(),
  backupDownload: vi.fn(),
  backupInstall: vi.fn()
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
    AGENT_SANDBOX_ENABLE_VOLUME: true,
    AGENT_SANDBOX_VOLUME_MANAGER_URL: 'http://volume.test',
    AGENT_SANDBOX_VOLUME_MANAGER_PROTOCOL: 'sessionId',
    AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH: '/workspace',
    AGENT_SANDBOX_ARCHIVE_MAX_BYTES: 1024 * 1024
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
        script.includes('local mode = ARGV[1]') ? 0 : evalLease(script, keys, ...args)
    })
  };
});
vi.mock('@fastgpt/service/core/ai/sandbox/config', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/ai/sandbox/config')>()),
  getVolumeManagerConfig: fake.volumeEnsure,
  ensureSessionVolume: fake.volumeConfirm,
  inspectSessionVolume: fake.volumeInspect
}));
vi.mock('@fastgpt/service/core/ai/sandbox/archiveStorage', () => ({
  getSandboxArchiveStorage: () => ({ exists: fake.backupExists, download: fake.backupDownload })
}));
vi.mock('@fastgpt/service/core/ai/sandbox/archiveIO', () => ({
  installWorkspaceArchive: fake.backupInstall
}));
vi.mock('@fastgpt-sdk/sandbox-adapter', async (original) => {
  const actual = await original<typeof import('@fastgpt-sdk/sandbox-adapter')>();
  class OpenSandboxAdapter {
    readonly provider = 'opensandbox';
    readonly rootPath = '/workspace';
    constructor(
      private readonly sessionId: string,
      private readonly config?: OpenSandboxConfigType
    ) {}
    get id() {
      return fake.remotes.get(this.sessionId)?.id;
    }
    async connectExisting() {
      if (fake.lookupError) throw fake.lookupError;
      return fake.remotes.has(this.sessionId);
    }
    async inspectExisting(id: string) {
      if (fake.inspectError) throw fake.inspectError;
      return [...fake.remotes.values()].find((remote) => remote.id === id) ?? null;
    }
    async ensureRunning() {
      const existing = fake.remotes.get(this.sessionId);
      if (existing) {
        existing.status.state = 'Running';
        return;
      }
      const config = this.config;
      const volume = config?.volumes?.[0];
      const claimName = volume?.pvc?.claimName;
      if (!config || !claimName) throw new Error('Persistent volume mount required');
      if (!fake.volumes.has(claimName)) {
        if (!volume.pvc?.createIfNotExists) throw new Error('Persistent volume missing');
        fake.volumes.set(claimName, new Map());
      }
      fake.creations.push(config);
      fake.remotes.set(this.sessionId, {
        id: `provider-${++fake.sequence}`,
        status: { state: 'Running' },
        image: config.image,
        claimName
      });
    }
    async connect(id: string) {
      if (id !== this.id) throw new Error('Wrong provider id');
    }
    async getInfo() {
      return fake.remotes.get(this.sessionId) ?? null;
    }
    async execute(command: string) {
      const remote = fake.remotes.get(this.sessionId);
      if (!remote) throw new Error('Missing provider');
      const content = fake.volumes.get(remote.claimName)?.get('/workspace/retained.txt');
      return {
        exitCode: 0,
        stdout: command === 'cat /workspace/retained.txt' ? content : '',
        stderr: ''
      };
    }
    async close() {}
  }
  return {
    ...actual,
    OpenSandboxAdapter,
    createSandbox: (
      _provider: unknown,
      connection: { sessionId: string },
      config?: OpenSandboxConfigType
    ) => new OpenSandboxAdapter(connection.sessionId, config)
  };
});

let appId: string;
let previousConfig: typeof global.feConfigs;
const scope = () => ({ appId, userId: 'user-1', chatId: 'chat-1' });
const acquire = () => getSandboxClient(scope(), { workspaceRoot: '/workspace' });
const retainedContent = 'workspace content written before compute disappeared';

beforeEach(async () => {
  vi.clearAllMocks();
  fake.redis.clear();
  fake.remotes.clear();
  fake.volumes.clear();
  fake.creations.length = 0;
  fake.sequence = 0;
  fake.lookupError = undefined;
  fake.inspectError = undefined;
  fake.volumeInspect.mockImplementation(
    async (_id: string, prepared: PreparedVolumeManagerConfig) =>
      fake.volumes.has(prepared.storage.volumes?.[0]?.claimName ?? '')
  );
  fake.backupExists.mockResolvedValue(false);
  fake.backupDownload.mockResolvedValue(Buffer.from('backup-content'));
  fake.backupInstall.mockImplementation(async (provider: { id: string }) => {
    const remote = [...fake.remotes.values()].find((item) => item.id === provider.id);
    if (!remote) throw new Error('Restore provider unavailable');
    fake.volumes.get(remote.claimName)?.set('/workspace/retained.txt', 'backup-content');
  });
  fake.volumeEnsure.mockImplementation(
    async (_id: string, prepared: PreparedVolumeManagerConfig) => {
      const claimName = prepared.binding.target;
      if (!fake.volumes.has(claimName)) fake.volumes.set(claimName, new Map());
      return {
        volumes: [
          {
            name: 'workspace',
            mountPath: prepared.mountPath,
            subPath: 'user-data',
            pvc: { claimName, createIfNotExists: false, deleteOnSandboxTermination: false }
          }
        ],
        storage: {
          ...prepared.storage,
          volumes: [
            { name: 'workspace', mountPath: prepared.mountPath, subPath: 'user-data', claimName }
          ],
          mountPath: prepared.mountPath,
          volumeManager: { ...prepared.binding, ensured: true }
        }
      };
    }
  );
  fake.volumeConfirm.mockImplementation(async () => {
    throw new Error('Volume ensure must not run during recovery');
  });
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

const seedMissingRuntime = async () => {
  const client = await getSandboxClient(scope(), {
    workspaceRoot: '/workspace',
    createConfig: {
      image: { repository: 'retained-image', tag: 'immutable-original' },
      entrypoint: ['/bin/sh', '-c', 'exec sleep infinity'],
      env: { FASTGPT_ENABLE_CODE_SERVER: 'false' },
      timeoutSeconds: 900,
      resourceLimits: { cpuCount: 2, memoryMiB: 2048 }
    }
  });
  const remote = fake.remotes.get(client.id);
  if (!remote) throw new Error('Initial runtime fixture did not create a provider');
  fake.volumes.get(remote.claimName)?.set('/workspace/retained.txt', retainedContent);
  fake.remotes.delete(client.id);
  await MongoSandboxInstance.updateOne(
    { sandboxId: client.id },
    {
      $set: {
        status: 'failed',
        releasedAt: null,
        'operation.type': 'start',
        'operation.checkpoint': 'pending',
        'operation.effectState': 'idle',
        'operation.failureDisposition': 'retryable',
        'operation.error': {
          code: 'sandbox_unavailable',
          message: 'Sandbox ensure failed at pending'
        }
      }
    }
  );
  fake.creations.length = 0;
  fake.volumeEnsure.mockClear();
  return { sandboxId: client.id, oldProviderId: remote.id, claimName: remote.claimName };
};

const useClient = async (entry: 'business' | 'browser' | 'ide') => {
  if (entry === 'business') return acquire();
  const client = await getChatSandboxClient(scope());
  await client.ensureAvailable(
    'interactive',
    entry === 'ide' ? { preserveBoundRuntime: true } : { upgradeImage: false }
  );
  return client;
};

export { fake, scope, acquire, retainedContent, seedMissingRuntime, useClient };
