import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenSandboxConfigType } from '@fastgpt-sdk/sandbox-adapter';
import { getExistingSandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import type { SandboxInstanceSchemaType } from '@fastgpt/service/core/ai/sandbox/type';

const remote = vi.hoisted(() => ({
  current: 'old' as string | null,
  failDelete: false,
  keepDeleted: false,
  events: [] as string[],
  configs: [] as OpenSandboxConfigType[]
}));
vi.mock('@fastgpt/service/core/ai/sandbox/lease', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/ai/sandbox/lease')>()),
  withSandboxLease: async (
    _key: string,
    run: (lease: {
      token: string;
      assertOwned: () => Promise<void>;
      setHeartbeat: () => void;
    }) => Promise<unknown>
  ) => run({ token: 'test', assertOwned: async () => {}, setHeartbeat: () => {} })
}));
vi.mock('@fastgpt/service/core/ai/sandbox/config', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/ai/sandbox/config')>()),
  getOpenSandboxConnectionConfig: ({ sessionId }: { sessionId: string }) => ({
    sessionId,
    baseUrl: 'http://unused.test'
  })
}));
vi.mock('@fastgpt-sdk/sandbox-adapter', async (original) => {
  class OpenSandboxAdapter {
    provider = 'opensandbox';
    id?: string;
    constructor(private config?: OpenSandboxConfigType) {}
    async connectExisting() {
      this.id = remote.current ?? undefined;
      return !!remote.current;
    }
    async getInfo() {
      return this.id ? { id: this.id, status: { state: 'Running' } } : null;
    }
    async inspectExisting(id: string) {
      remote.events.push(`inspect:${id}`);
      return remote.current === id ? { id } : null;
    }
    async delete() {
      remote.events.push(`delete:${this.id}`);
      if (remote.failDelete) throw new Error('remote-timeout');
      if (!remote.keepDeleted) remote.current = null;
    }
    async create() {
      if (!this.config || remote.current) throw new Error('unexpected-create');
      remote.configs.push(this.config);
      this.id = remote.configs.length === 1 ? 'maintenance' : 'editor';
      remote.current = this.id;
      remote.events.push(`create:${this.id}`);
    }
  }
  return {
    ...(await original<typeof import('@fastgpt-sdk/sandbox-adapter')>()),
    OpenSandboxAdapter,
    createSandbox: (_provider: string, _connection: unknown, config?: OpenSandboxConfigType) =>
      new OpenSandboxAdapter(config)
  };
});

describe('same-volume Edit maintenance lifecycle', () => {
  const instance: SandboxInstanceSchemaType = {
    _id: 'instance',
    sandboxId: 'logical-edit',
    provider: 'opensandbox',
    status: 'provisioning',
    lastActiveAt: new Date(),
    createdAt: new Date(),
    metadata: { providerSandboxId: 'old' }
  };
  const config: OpenSandboxConfigType = {
    image: { repository: 'original-image' },
    entrypoint: ['/home/sandbox/entrypoint.sh'],
    env: { WORKSPACE: '/workspace/edit' },
    volumes: [{ name: 'workspace', mountPath: '/workspace', pvc: { claimName: 'original-volume' } }]
  };
  const maintain = vi.fn(async () => {
    expect(remote.current).toBe('maintenance');
    remote.events.push('baseline-committed');
  });
  const run = () =>
    getExistingSandboxClient(instance).maintainWorkspace({
      instance,
      createConfig: config,
      assertActive: async () => {},
      checkpoint: async () => {},
      remoteEffect: (run) => run(),
      maintain
    });
  beforeEach(() => {
    remote.current = 'old';
    remote.failDelete = false;
    remote.keepDeleted = false;
    remote.events.length = 0;
    remote.configs.length = 0;
    maintain.mockClear();
  });

  it('confirms both old containers are gone and commits the baseline before starting the editor', async () => {
    await run();
    expect(remote.events).toEqual([
      'delete:old',
      'inspect:old',
      'create:maintenance',
      'baseline-committed',
      'delete:maintenance',
      'inspect:maintenance',
      'create:editor'
    ]);
    expect(remote.current).toBe('editor');
    expect(remote.configs[0].entrypoint).toEqual(['/bin/sh', '-c', 'exec sleep infinity']);
    expect(remote.configs[0].env).toEqual({});
    expect(remote.configs.map((value) => value.volumes)).toEqual([config.volumes, config.volumes]);
    expect(remote.configs[1]).toEqual(config);
  });
  it.each(['timeout', 'unconfirmed'])(
    'never creates a maintenance container after %s deletion',
    async (kind) => {
      remote.failDelete = kind === 'timeout';
      remote.keepDeleted = kind === 'unconfirmed';
      await expect(run()).rejects.toThrow();
      expect(remote.configs).toHaveLength(0);
      expect(maintain).not.toHaveBeenCalled();
    }
  );
  it('rejects provider replacement before deleting either instance', async () => {
    remote.current = 'foreign';
    await expect(run()).rejects.toThrow('workspace_provider_changed');
    expect(remote.events).toEqual([]);
  });
});
