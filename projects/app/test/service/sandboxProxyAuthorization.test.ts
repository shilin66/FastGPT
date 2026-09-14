import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest } from 'next';

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  find: vi.fn(),
  updateOne: vi.fn(),
  auth: vi.fn(),
  skill: vi.fn(),
  member: vi.fn(),
  team: vi.fn(),
  session: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/sandbox/schema', () => ({
  MongoSandboxInstance: { findOne: mocks.findOne, find: mocks.find, updateOne: mocks.updateOne }
}));
vi.mock('@fastgpt/service/support/permission/auth/common', () => ({ parseHeaderCert: mocks.auth }));
vi.mock('@fastgpt/service/support/permission/agentSkill/auth', () => ({
  authSkillByTmbId: mocks.skill
}));
vi.mock('@fastgpt/service/support/user/team/controller', () => ({
  getTmbInfoByTmbId: mocks.member
}));
vi.mock('@fastgpt/service/support/user/team/status', () => ({ assertTeamActive: mocks.team }));
vi.mock('@/service/core/sandbox/proxyTicket', () => ({ readSandboxProxySession: mocks.session }));
vi.mock('@fastgpt/service/core/ai/sandbox/config', () => ({
  getSandboxProviderConfig: () => ({ provider: 'opensandbox' })
}));
vi.mock('@fastgpt/service/core/agentSkills/sandboxConfig', () => ({
  connectToProviderSandbox: vi.fn(),
  disconnectFromProviderSandbox: vi.fn()
}));

import { authorizeSandboxProxyGrant, getSandboxProxyTarget } from '@/service/core/sandbox/proxy';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

describe('Sandbox proxy current resource authorization', () => {
  const scope = {
    sandboxId: 'sandbox-12345678',
    targetPort: 8090,
    audience: 'http://8090--sandbox-12345678.localhost:3000'
  };
  const principal = { userId: 'user-1', teamId: 'team-1', tmbId: 'member-1' };
  const grant = {
    ...scope,
    ...principal,
    provider: 'opensandbox',
    sourceType: 'skillEdit',
    sourceId: 'skill-1'
  };
  const req = { headers: { cookie: 'fastgpt_sandbox_proxy=abc' } } as NextApiRequest;
  let sandbox: Record<string, unknown>;
  beforeEach(() => {
    vi.resetAllMocks();
    sandbox = {
      _id: 'instance-1',
      ...scope,
      provider: 'opensandbox',
      sourceType: 'skillEdit',
      sourceId: 'skill-1',
      teamId: 'team-1',
      status: 'running',
      metadata: {
        skillId: 'skill-1',
        sandboxType: 'edit-debug',
        endpoint: { port: 8090, url: 'http://gateway:8090/sandboxes/provider/proxy/44772' }
      }
    };
    mocks.findOne.mockImplementation(() => ({ lean: async () => sandbox }));
    mocks.find.mockImplementation(() => ({ limit: () => ({ lean: async () => [sandbox] }) }));
    mocks.updateOne.mockResolvedValue({ matchedCount: 1 });
    mocks.auth.mockResolvedValue({ ...principal, sessionId: 'main-session-1' });
    mocks.member.mockResolvedValue(principal);
    mocks.team.mockResolvedValue(undefined);
    mocks.skill.mockResolvedValue({ skill: { teamId: 'team-1' } });
    mocks.session.mockResolvedValue(grant);
  });

  it('requires current Skill Write permission when signing', async () => {
    expect(await authorizeSandboxProxyGrant({ req, ...scope })).toEqual({
      grant,
      sessionId: 'main-session-1'
    });
    expect(mocks.skill).toHaveBeenCalledWith({
      tmbId: 'member-1',
      skillId: 'skill-1',
      per: WritePermissionVal
    });
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });
  it('rejects a same-team member without Skill Write permission', async () => {
    mocks.skill.mockRejectedValue(new Error('No write permission'));
    await expect(authorizeSandboxProxyGrant({ req, ...scope })).rejects.toThrow();
  });
  it('binds a newly opened editor to the current workspace generation', async () => {
    sandbox.workspaceGeneration = '22222222-2222-4222-8222-222222222222';
    const result = await authorizeSandboxProxyGrant({
      req,
      ...scope,
      sandboxId: `ws-${sandbox.workspaceGeneration}`
    });
    expect(result.grant).toMatchObject({ workspaceGeneration: sandbox.workspaceGeneration });
  });
  it('rejects an old resource session after a workspace reset', async () => {
    sandbox.workspaceGeneration = '22222222-2222-4222-8222-222222222222';
    await expect(getSandboxProxyTarget({ req, ...scope })).rejects.toThrow('Access denied');
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });
  it('does not silently upgrade an old editor renewal to the reset workspace', async () => {
    sandbox.workspaceGeneration = '22222222-2222-4222-8222-222222222222';
    await expect(
      authorizeSandboxProxyGrant({
        req,
        ...scope,
        renewal: true,
        expectedWorkspaceGeneration: 'legacy'
      })
    ).rejects.toThrow('Access denied');
  });
  it('requires generation binding when renewing a reset workspace', async () => {
    sandbox.workspaceGeneration = '22222222-2222-4222-8222-222222222222';
    await expect(authorizeSandboxProxyGrant({ req, ...scope, renewal: true })).rejects.toThrow(
      'Access denied'
    );
  });
  it('renews only the exact generation and includes it in the heartbeat fence', async () => {
    const workspaceGeneration = '22222222-2222-4222-8222-222222222222';
    sandbox.workspaceGeneration = workspaceGeneration;
    const resetScope = { ...scope, sandboxId: `ws-${workspaceGeneration}` };
    const result = await authorizeSandboxProxyGrant({
      req,
      ...resetScope,
      renewal: true,
      expectedWorkspaceGeneration: workspaceGeneration
    });
    mocks.session.mockResolvedValue(result.grant);
    await getSandboxProxyTarget({ req, ...resetScope });
    expect(mocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceGeneration }),
      expect.anything()
    );
  });
  it('refuses the previous origin even with a newly issued generation cookie', async () => {
    sandbox.workspaceGeneration = '22222222-2222-4222-8222-222222222222';
    mocks.session.mockResolvedValue({ ...grant, workspaceGeneration: sandbox.workspaceGeneration });
    await expect(getSandboxProxyTarget({ req, ...scope })).rejects.toThrow('Access denied');
    await expect(authorizeSandboxProxyGrant({ req, ...scope })).rejects.toThrow('Access denied');
  });
  it('refuses ambiguous workspace generation aliases', async () => {
    sandbox.workspaceGeneration = '22222222-2222-4222-8222-222222222222';
    mocks.find.mockImplementation(() => ({
      limit: () => ({ lean: async () => [sandbox, sandbox] })
    }));
    await expect(
      authorizeSandboxProxyGrant({
        req,
        ...scope,
        sandboxId: `ws-${sandbox.workspaceGeneration}`
      })
    ).rejects.toThrow('Access denied');
  });
  it('rejects a stale initial bootstrap even when the member is still authorized', async () => {
    sandbox.workspaceGeneration = '22222222-2222-4222-8222-222222222222';
    await expect(
      authorizeSandboxProxyGrant({
        req,
        ...scope,
        expectedWorkspaceGeneration: '11111111-1111-4111-8111-111111111111'
      })
    ).rejects.toThrow('Access denied');
  });
  it('rejects a principal without a live main-session identity', async () => {
    mocks.auth.mockResolvedValue(principal);
    await expect(authorizeSandboxProxyGrant({ req, ...scope })).rejects.toThrow('Unauthorized');
  });
  it('checks permission again for every resource session request', async () => {
    expect(await getSandboxProxyTarget({ req, ...scope })).toContain(
      '/sandboxes/provider/proxy/44772'
    );
    mocks.skill.mockRejectedValue(new Error('Permission revoked'));
    await expect(getSandboxProxyTarget({ req, ...scope })).rejects.toThrow();
    expect(mocks.updateOne).toHaveBeenCalledTimes(1);
  });
  it('refreshes activity only after checking the ticket, current resource and endpoint', async () => {
    await getSandboxProxyTarget({ req, ...scope });
    expect(mocks.updateOne).toHaveBeenCalledExactlyOnceWith(
      {
        _id: 'instance-1',
        provider: 'opensandbox',
        sandboxId: scope.sandboxId,
        status: 'running',
        deleteTime: null,
        workspaceGeneration: { $exists: false }
      },
      { $max: { lastActiveAt: expect.any(Date) } }
    );
    expect(mocks.updateOne.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.skill.mock.invocationCallOrder[0]
    );
  });
  it('does not refresh activity for expired sessions', async () => {
    mocks.session.mockRejectedValue(new Error('Unauthorized'));
    await expect(getSandboxProxyTarget({ req, ...scope })).rejects.toThrow('Unauthorized');
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });
  it('does not refresh activity for an unsupported endpoint port', async () => {
    mocks.session.mockResolvedValue({ ...grant, targetPort: 8080 });
    await expect(getSandboxProxyTarget({ req, ...scope })).rejects.toThrow(
      'Unsupported proxy port'
    );
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });
  it('rejects the request if the running-instance heartbeat no longer matches', async () => {
    mocks.updateOne.mockResolvedValue({ matchedCount: 0 });
    await expect(getSandboxProxyTarget({ req, ...scope })).rejects.toThrow('Access denied');
  });
  it('fails closed when persisting authorized activity fails', async () => {
    mocks.updateOne.mockRejectedValue(new Error('Database unavailable'));
    await expect(getSandboxProxyTarget({ req, ...scope })).rejects.toThrow('Database unavailable');
  });
  it('never authorizes an identifier-only request after earlier successful auth', async () => {
    await getSandboxProxyTarget({ req, ...scope });
    await expect(
      getSandboxProxyTarget({ req: { headers: {} } as NextApiRequest, ...scope })
    ).rejects.toThrow('Unauthorized');
    expect(mocks.updateOne).toHaveBeenCalledTimes(1);
  });
  it('rejects a different final user even within the same team', async () => {
    sandbox = {
      ...sandbox,
      sourceType: 'appRuntime',
      sourceId: 'app-1',
      userId: 'user-2',
      runtimeUserId: 'user-2',
      metadata: { endpoint: { port: 8090, url: 'http://gateway:8090' } }
    };
    await expect(authorizeSandboxProxyGrant({ req, ...scope })).rejects.toThrow('Access denied');
  });
  it.each([
    { status: 'stopped' },
    { status: 'stopping' },
    { status: 'deleting' },
    { deleteTime: new Date() },
    { provider: 'e2b' },
    { sourceId: 'skill-2' },
    { teamId: 'team-2' }
  ])('rejects changed live instance %j', async (change) => {
    sandbox = { ...sandbox, ...change };
    await expect(getSandboxProxyTarget({ req, ...scope })).rejects.toThrow();
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });
  it('rejects a deleted/reassigned member', async () => {
    mocks.member.mockResolvedValue({ ...principal, userId: 'user-2' });
    await expect(getSandboxProxyTarget({ req, ...scope })).rejects.toThrow('Access denied');
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });
});
