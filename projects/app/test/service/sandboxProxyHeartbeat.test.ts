import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest } from 'next';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { getSandboxProxyTarget } from '@/service/core/sandbox/proxy';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  skill: vi.fn(),
  member: vi.fn(),
  team: vi.fn()
}));
vi.mock('@fastgpt/service/support/permission/auth/common', () => ({ parseHeaderCert: vi.fn() }));
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

describe('Sandbox proxy activity MongoDB compare-and-set', () => {
  const scope = {
    sandboxId: 'heartbeat-sandbox-12345678',
    targetPort: 8090,
    audience: 'http://8090--heartbeat-sandbox-12345678.localhost:3000'
  };
  const principal = {
    userId: 'user-1',
    teamId: '507f1f77bcf86cd799439011',
    tmbId: '507f1f77bcf86cd799439012'
  };
  const grant = {
    ...scope,
    ...principal,
    provider: 'opensandbox',
    sourceType: 'skillEdit',
    sourceId: 'skill-1'
  };
  const req = { headers: { cookie: 'fastgpt_sandbox_proxy=active-session' } } as NextApiRequest;
  const before = new Date('2025-01-01T00:00:00Z');
  const createSandbox = (lastActiveAt = before) =>
    MongoSandboxInstance.create({
      ...scope,
      provider: grant.provider,
      sourceType: grant.sourceType,
      sourceId: grant.sourceId,
      teamId: principal.teamId,
      status: 'running',
      lastActiveAt,
      metadata: {
        endpoint: { port: 8090, url: 'http://gateway:8090/sandboxes/provider/proxy/44772' }
      }
    });

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue(grant);
    mocks.member.mockResolvedValue(principal);
    mocks.team.mockResolvedValue(undefined);
    mocks.skill.mockResolvedValue({ skill: { teamId: principal.teamId } });
  });

  it('advances only the authorized live instance activity', async () => {
    const sandbox = await createSandbox();
    const other = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: 'unrelated-heartbeat-sandbox',
      lastActiveAt: before
    });
    const startedAt = new Date();
    await expect(getSandboxProxyTarget({ req, ...scope })).resolves.toContain('/proxy/44772');
    const updated = await MongoSandboxInstance.findById(sandbox._id).lean();
    const untouched = await MongoSandboxInstance.findById(other._id).lean();
    expect(updated?.lastActiveAt.getTime()).toBeGreaterThanOrEqual(startedAt.getTime());
    expect(untouched?.lastActiveAt).toEqual(before);
  });

  it('does not move activity backwards when a later heartbeat has already been saved', async () => {
    const future = new Date(Date.now() + 60_000);
    const sandbox = await createSandbox(future);
    await expect(getSandboxProxyTarget({ req, ...scope })).resolves.toContain('/proxy/44772');
    expect((await MongoSandboxInstance.findById(sandbox._id).lean())?.lastActiveAt).toEqual(future);
  });

  it.each([
    { status: 'stopping' },
    { status: 'stopped' },
    { status: 'deleting' },
    { deleteTime: new Date('2025-02-01T00:00:00Z') },
    { provider: 'e2b' },
    { workspaceGeneration: '22222222-2222-4222-8222-222222222222' },
    { sandboxId: 'replacement-sandbox-12345678' }
  ])('rejects a lifecycle or identity change during permission validation: %j', async (change) => {
    const sandbox = await createSandbox();
    mocks.skill.mockImplementationOnce(async () => {
      await MongoSandboxInstance.updateOne({ _id: sandbox._id }, { $set: change });
      return { skill: { teamId: principal.teamId } };
    });
    await expect(getSandboxProxyTarget({ req, ...scope })).rejects.toThrow('Access denied');
    expect((await MongoSandboxInstance.findById(sandbox._id).lean())?.lastActiveAt).toEqual(before);
  });

  it('does not refresh a replacement record reusing the same logical identity', async () => {
    const original = await createSandbox();
    mocks.skill.mockImplementationOnce(async () => {
      await MongoSandboxInstance.deleteOne({ _id: original._id });
      await createSandbox();
      return { skill: { teamId: principal.teamId } };
    });
    await expect(getSandboxProxyTarget({ req, ...scope })).rejects.toThrow('Access denied');
    expect(
      (await MongoSandboxInstance.findOne({ sandboxId: scope.sandboxId }).lean())?.lastActiveAt
    ).toEqual(before);
  });
});
