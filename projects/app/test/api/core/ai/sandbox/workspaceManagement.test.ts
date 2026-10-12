import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authApp: vi.fn(),
  authSkill: vi.fn(),
  find: vi.fn(),
  findOne: vi.fn(),
  count: vi.fn(),
  release: vi.fn(),
  delete: vi.fn(),
  forceDelete: vi.fn(),
  inspect: vi.fn(),
  withLease: vi.fn(),
  assertIdle: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/app/auth', () => ({ authApp: mocks.authApp }));
vi.mock('@fastgpt/service/support/permission/agentSkill/auth', () => ({
  authSkill: mocks.authSkill
}));
vi.mock('@fastgpt/service/core/ai/sandbox/schema', () => ({
  MongoSandboxInstance: {
    find: mocks.find,
    findOne: mocks.findOne,
    countDocuments: mocks.count
  }
}));
vi.mock('@fastgpt/service/core/ai/sandbox/controller', () => ({
  getExistingSandboxClient: () => ({
    release: mocks.release,
    delete: mocks.delete,
    forceDelete: mocks.forceDelete,
    provider: { inspectExisting: mocks.inspect }
  })
}));
vi.mock('@fastgpt/service/core/ai/sandbox/lease', () => ({ withSandboxLease: mocks.withLease }));
vi.mock('@fastgpt/service/core/ai/sandbox/terminal', () => ({
  assertSkillWorkspaceTerminalIdle: mocks.assertIdle
}));
vi.mock('@fastgpt/service/env', () => ({
  env: { AGENT_SANDBOX_PROVIDER: 'opensandbox', AGENT_SANDBOX_OPENSANDBOX_RUNTIME: 'docker' }
}));

import { env } from '@fastgpt/service/env';
import list from '@/pages/api/core/ai/sandbox/workspaces/list';
import action from '@/pages/api/core/ai/sandbox/workspaces/action';

const instance = {
  sandboxId: 'workspace-1',
  sourceType: 'appRuntime',
  sourceId: 'app-1',
  sourceChatId: 'chat-1',
  sessionId: 'chat-1',
  teamId: 'team-1',
  provider: 'opensandbox',
  status: 'running',
  metadata: { providerSandboxId: 'container-1' },
  storage: {
    volumes: [{ name: 'workspace', claimName: 'volume-1', mountPath: '/workspace' }],
    volumeManager: { ensured: true }
  },
  createdAt: new Date('2026-01-01'),
  lastActiveAt: new Date('2026-01-02')
};

beforeEach(() => {
  vi.clearAllMocks();
  env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME = 'docker';
  mocks.authApp.mockResolvedValue({ teamId: 'team-1', app: { name: '同名 Agent' } });
  mocks.authSkill.mockResolvedValue({ teamId: 'team-1', skill: { name: '同名 Skill' } });
  const cursor = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([instance])
  };
  mocks.find.mockReturnValue(cursor);
  mocks.count.mockResolvedValue(1);
  mocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(instance) });
  mocks.release.mockResolvedValue(undefined);
  mocks.delete.mockResolvedValue(undefined);
  mocks.inspect.mockResolvedValue({ id: 'container-1', status: { state: 'Running' } });
  mocks.withLease.mockImplementation(async (_key: string, execute: () => Promise<void>) =>
    execute()
  );
  mocks.assertIdle.mockResolvedValue(undefined);
});

describe('sandbox workspace management API', () => {
  it.each([
    {
      sourceType: 'appRuntime',
      sourceId: 'app-1',
      reuseScope: 'user',
      runtimeUserId: 'user-1',
      expected: {
        sourceType: 'appRuntime',
        reuseScope: 'user',
        purpose: 'runtime',
        runtimeUserId: 'user-1'
      }
    },
    {
      sourceType: 'skillEdit',
      sourceId: 'skill-1',
      expected: { sourceType: 'skillEdit', reuseScope: 'source', purpose: 'edit' }
    }
  ])('returns explicit classification for $sourceType', async ({ expected, ...fields }) => {
    mocks.find.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([{ ...instance, ...fields }])
    });
    const result = await list({
      body: { sourceType: fields.sourceType, sourceId: fields.sourceId }
    } as never);
    expect(result.list[0]).toMatchObject(expected);
  });

  it('lists only the authorized Agent workspaces with clear IDs and release ability', async () => {
    const req = { body: { sourceType: 'appRuntime', sourceId: 'app-1' } } as never;
    const result = await list(req);
    expect(mocks.authApp).toHaveBeenCalledWith(expect.objectContaining({ appId: 'app-1' }));
    expect(mocks.find).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'appRuntime', sourceId: 'app-1', teamId: 'team-1' })
    );
    expect(result).toMatchObject({
      supported: true,
      total: 1,
      list: [
        {
          sandboxId: 'workspace-1',
          sourceName: '同名 Agent',
          sourceType: 'appRuntime',
          reuseScope: 'session',
          purpose: 'chat',
          providerStatus: 'running',
          statusMismatch: false,
          canRelease: true
        }
      ]
    });
  });

  it('reports a running provider even when the stored lifecycle status is stopped', async () => {
    const stopped = { ...instance, status: 'stopped' };
    mocks.find.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([stopped])
    });

    const result = await list({ body: { sourceType: 'appRuntime', sourceId: 'app-1' } } as never);
    expect(mocks.inspect).toHaveBeenCalledWith('container-1');
    expect(result.list[0]).toMatchObject({
      status: 'stopped',
      providerStatus: 'running',
      statusMismatch: true
    });
  });

  it('does not claim a stopped provider when inspection fails', async () => {
    mocks.inspect.mockRejectedValue(new Error('provider unreachable'));
    const result = await list({ body: { sourceType: 'appRuntime', sourceId: 'app-1' } } as never);
    expect(result.list[0]).toMatchObject({
      status: 'running',
      providerStatus: 'unknown',
      statusMismatch: false
    });
  });

  it('reports a paused provider when the stored lifecycle status is running', async () => {
    mocks.inspect.mockResolvedValue({ id: 'container-1', status: { state: 'Stopped' } });
    const result = await list({ body: { sourceType: 'appRuntime', sourceId: 'app-1' } } as never);
    expect(result.list[0]).toMatchObject({
      status: 'running',
      providerStatus: 'stopped',
      statusMismatch: true
    });
  });

  it('does not release a workspace belonging to another source', async () => {
    const req = {
      body: {
        sourceType: 'skillEdit',
        sourceId: 'skill-1',
        sandboxId: 'workspace-1',
        action: 'release'
      }
    } as never;
    await expect(action(req)).rejects.toThrow();
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('rechecks authorization inside the lifecycle operation', async () => {
    const req = {
      body: {
        sourceType: 'appRuntime',
        sourceId: 'app-1',
        sandboxId: 'workspace-1',
        action: 'release'
      }
    } as never;
    mocks.release.mockImplementation(
      async ({ assertAuthorized }: { assertAuthorized: () => Promise<void> }) => {
        await assertAuthorized();
      }
    );
    await action(req);
    expect(mocks.authApp).toHaveBeenCalledTimes(2);
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it('checks a running Skill terminal under its activity lease before release', async () => {
    const skillInstance = { ...instance, sourceType: 'skillEdit', sourceId: 'skill-1' };
    mocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(skillInstance) });
    const req = {
      body: {
        sourceType: 'skillEdit',
        sourceId: 'skill-1',
        sandboxId: 'workspace-1',
        action: 'release'
      }
    } as never;
    await action(req);
    expect(mocks.withLease).toHaveBeenCalledWith(
      'skill-edit-activity:skill-1',
      expect.any(Function)
    );
    expect(mocks.assertIdle).toHaveBeenCalledWith(skillInstance);
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it('allows a verified partial deletion to finish volume cleanup after the provider is gone', async () => {
    const deleting = {
      ...instance,
      status: 'deleting',
      operation: {
        type: 'delete',
        checkpoint: 'provider_deleted',
        failureDisposition: 'retryable',
        error: { code: 'sandbox_delete_failed' }
      }
    };
    mocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(deleting) });
    mocks.find.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([deleting])
    });

    const listed = await list({ body: { sourceType: 'appRuntime', sourceId: 'app-1' } } as never);
    expect(listed.list[0]).toMatchObject({ canDelete: true, canRelease: false });

    await action({
      body: {
        sourceType: 'appRuntime',
        sourceId: 'app-1',
        sandboxId: 'workspace-1',
        action: 'delete'
      }
    } as never);
    expect(mocks.delete).toHaveBeenCalledOnce();
  });
});

describe('Agent force deletion', () => {
  const body = {
    sourceType: 'appRuntime',
    sourceId: 'app-1',
    sandboxId: 'workspace-1',
    action: 'forceDelete',
    deletionRevision: 'a'.repeat(64)
  };
  it('delegates pending cleanup without connecting to the failed provider', async () => {
    mocks.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        ...instance,
        status: 'deleting',
        deleteTime: new Date(),
        forceDeletion: { requestedAt: new Date() }
      })
    });
    mocks.inspect.mockRejectedValue(new Error('provider offline'));
    mocks.forceDelete.mockImplementation(async ({ assertAuthorized }) => {
      await assertAuthorized();
      return { success: false, status: 'pending', reason: 'provider_unavailable' };
    });
    expect(await action({ body } as never)).toEqual({
      success: false,
      status: 'pending',
      reason: 'provider_unavailable'
    });
    expect(mocks.inspect).not.toHaveBeenCalled();
    expect(mocks.authApp).toHaveBeenCalledTimes(2);
    expect(mocks.findOne.mock.calls[0][0]).not.toHaveProperty('deleteTime');
  });
  it('rejects force deletion outside the Docker runtime', async () => {
    env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME = 'kubernetes';
    await expect(action({ body } as never)).rejects.toThrow();
    expect(mocks.forceDelete).not.toHaveBeenCalled();
  });
  it('rejects permission revoked inside force cleanup', async () => {
    mocks.authApp
      .mockResolvedValueOnce({ teamId: 'team-1', app: { name: 'Agent' } })
      .mockRejectedValueOnce(new Error('permission revoked'));
    mocks.forceDelete.mockImplementation(async ({ assertAuthorized }) => {
      await assertAuthorized();
    });
    await expect(action({ body } as never)).rejects.toThrow('permission revoked');
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it('keeps a healthy workspace on the ordinary delete path', async () => {
    const result = await list({ body: { sourceType: 'appRuntime', sourceId: 'app-1' } } as never);
    expect(result.list[0]).toMatchObject({ canDelete: true, canForceDelete: false });
    expect(result.list[0].deletionRevision).toBeUndefined();
  });
  it('requires a revision before any destructive operation', async () => {
    await expect(
      action({ body: { ...body, deletionRevision: undefined } } as never)
    ).rejects.toThrow();
    expect(mocks.forceDelete).not.toHaveBeenCalled();
  });
  it('rejects force deletion of a Skill workspace', async () => {
    mocks.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...instance, sourceType: 'skillEdit', sourceId: 'skill-1' })
    });
    await expect(
      action({ body: { ...body, sourceType: 'skillEdit', sourceId: 'skill-1' } } as never)
    ).rejects.toThrow();
    expect(mocks.forceDelete).not.toHaveBeenCalled();
  });
  it('returns pending deletion as visible and resumable with a revision', async () => {
    mocks.find().lean.mockResolvedValue([
      {
        ...instance,
        status: 'deleting',
        deleteTime: new Date(),
        forceDeletion: { requestedAt: new Date() }
      }
    ]);
    const result = await list({ body: { sourceType: 'appRuntime', sourceId: 'app-1' } } as never);
    expect(result.list[0]).toMatchObject({
      canForceDelete: true,
      forceDeletionPending: true,
      deletionRevision: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(mocks.find.mock.calls.at(-1)?.[0]).toMatchObject({
      sourceType: 'appRuntime',
      sourceId: 'app-1',
      teamId: 'team-1',
      $and: [
        { $or: [{ deleteTime: null }, { status: 'deleting', forceDeletion: { $exists: true } }] }
      ]
    });
  });
});
