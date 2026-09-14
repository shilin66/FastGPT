import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  eval: vi.fn(),
  expire: vi.fn(),
  keys: vi.fn()
}));
vi.mock('@fastgpt/service/common/redis', () => ({
  getGlobalRedisConnection: () => redis,
  getAllKeysByPrefix: redis.keys
}));
vi.mock('@fastgpt/service/support/user/session', () => ({
  getUserSessionKeys: (userId: string) => redis.keys(`session:${userId}`)
}));

import {
  issueSandboxProxyTicket as issueAuthorizedTicket,
  redeemSandboxProxyTicket as redeemAuthorizedTicket,
  readSandboxProxySession,
  revokeSandboxProxyUser
} from '@/service/core/sandbox/proxyTicket';
import type { SandboxProxyGrant, SandboxProxyScope } from '@fastgpt/global/core/ai/sandbox/proxy';

const authorize = vi.fn(async () => 'http://gateway:8090/sandboxes/provider/proxy/44772');
const redeemSandboxProxyTicket = async (input: SandboxProxyScope & { ticket: string }) => {
  const result = await redeemAuthorizedTicket({ ...input, authorize });
  return result.session;
};

describe('Sandbox resource tickets', () => {
  const records = new Map<string, string>();
  const mainSessions = new Map<string, Pick<SandboxProxyGrant, 'userId' | 'teamId' | 'tmbId'>>();
  const mainSessionId = 'main-session-1';
  const issueSandboxProxyTicket = async (grant: SandboxProxyGrant) => {
    mainSessions.set(`session:${mainSessionId}`, grant);
    return issueAuthorizedTicket({ grant, sessionId: mainSessionId });
  };
  const grant = {
    userId: 'user-1',
    teamId: 'team-1',
    tmbId: 'member-1',
    sandboxId: 'sandbox-12345678',
    provider: 'opensandbox' as const,
    sourceType: 'skillEdit' as const,
    sourceId: 'skill-1',
    targetPort: 8090,
    audience: 'http://8090--sandbox-12345678.localhost:3000'
  };
  const scope = {
    sandboxId: grant.sandboxId,
    targetPort: grant.targetPort,
    audience: grant.audience
  };

  beforeEach(() => {
    records.clear();
    mainSessions.clear();
    vi.restoreAllMocks();
    authorize.mockResolvedValue('http://gateway:8090/sandboxes/provider/proxy/44772');
    redis.keys.mockImplementation(async (prefix: string) =>
      [...mainSessions.entries()]
        .filter(([, session]) => `session:${session.userId}` === prefix)
        .map(([key]) => key)
    );
    redis.get.mockImplementation(async (key: string) => records.get(key) ?? null);
    redis.set.mockImplementation(
      async (key: string, value: string, _mode: string, _seconds: number, nx?: string) => {
        if (nx === 'NX' && records.has(key)) return null;
        records.set(key, value);
        return 'OK';
      }
    );
    redis.eval.mockImplementation(
      async (_script: string, count: number, key: string, ...args: string[]) => {
        if (_script.startsWith("redis.call('SET', KEYS[1]")) {
          records.set(key, args[count - 1]);
          args.slice(0, count - 1).forEach((key) => mainSessions.delete(key));
          return 1;
        }
        if (count === 3 && key.startsWith('session:')) {
          const [generationKey, ticketKey, userId, teamId, tmbId, newGeneration, value] = args;
          const session = mainSessions.get(key);
          if (
            !session ||
            session.userId !== userId ||
            session.teamId !== teamId ||
            session.tmbId !== tmbId
          )
            return null;
          const generation = records.get(generationKey) ?? newGeneration;
          records.set(generationKey, generation);
          records.set(
            ticketKey,
            JSON.stringify({ ...JSON.parse(value), generation, expiresAt: Date.now() + 60_000 })
          );
          return 1;
        }
        if (count === 3) {
          const [oldKey, newKey, generation, value, oldSession, newSession, duration] = args;
          if (records.get(key) !== generation) return null;
          const next = JSON.parse(value);
          const now = Date.now();
          if (next.expiresAt <= now) return null;
          next.expiresAt = now + Number(duration);
          const current = JSON.parse(records.get(oldKey) ?? 'null');
          if (
            oldSession &&
            current?.expiresAt > Number(now) &&
            Object.keys(grant)
              .concat('generation', 'workspaceGeneration')
              .every((field) => current[field] === next[field])
          ) {
            next.expiresAt = Math.max(current.expiresAt, next.expiresAt);
            records.set(oldKey, JSON.stringify(next));
            return [oldSession, next.expiresAt];
          }
          records.set(newKey, JSON.stringify(next));
          return [newSession, next.expiresAt];
        }
        const value = records.get(key) ?? null;
        records.delete(key);
        return value;
      }
    );
    redis.expire.mockResolvedValue(1);
  });

  it('exchanges an opaque one-time ticket for a resource session without any main credential', async () => {
    const ticket = await issueSandboxProxyTicket(grant);
    expect(ticket).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(records.get(`sandbox-proxy:bootstrap:${ticket}`)!).expiresAt).toBeGreaterThan(
      Date.now() + 59_000
    );
    const session = await redeemSandboxProxyTicket({ ticket, ...scope });
    expect(session).not.toBe(ticket);
    expect(await readSandboxProxySession({ session, ...scope })).toMatchObject(grant);
    await expect(redeemSandboxProxyTicket({ ticket, ...scope })).rejects.toThrow('Unauthorized');
    expect(records.get(`sandbox-proxy:session:${session}`)).toBeDefined();
    expect(JSON.stringify([...records.values()])).not.toContain('fastgpt_token');
  });

  it.each([
    { sandboxId: 'other-sandbox' },
    { targetPort: 8080 },
    { audience: 'http://evil.localhost:3000' }
  ])('rejects changed ticket scope %j', async (changed) => {
    const ticket = await issueSandboxProxyTicket(grant);
    await expect(redeemSandboxProxyTicket({ ticket, ...scope, ...changed })).rejects.toThrow(
      'Unauthorized'
    );
  });

  it('enforces expiry even if the Redis value outlives its TTL', async () => {
    const ticket = await issueSandboxProxyTicket(grant);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
    await expect(redeemSandboxProxyTicket({ ticket, ...scope })).rejects.toThrow('Unauthorized');
  });

  it('revokes bootstrap and resource sessions across independent consumers on logout', async () => {
    const ticket = await issueSandboxProxyTicket(grant);
    const pendingTicket = await issueSandboxProxyTicket(grant);
    const session = await redeemSandboxProxyTicket({ ticket, ...scope });
    await revokeSandboxProxyUser(grant.userId);
    await expect(readSandboxProxySession({ session, ...scope })).rejects.toThrow('Unauthorized');
    await expect(redeemSandboxProxyTicket({ ticket: pendingTicket, ...scope })).rejects.toThrow(
      'Unauthorized'
    );
  });

  it('fails closed when Redis is unavailable', async () => {
    redis.eval.mockRejectedValueOnce(new Error('Redis unavailable'));
    await expect(issueSandboxProxyTicket(grant)).rejects.toThrow('Redis unavailable');
  });

  it('fails closed if Redis evicts the user revocation generation', async () => {
    const ticket = await issueSandboxProxyTicket(grant);
    records.delete(`sandbox-proxy:user:${grant.userId}`);
    await expect(redeemSandboxProxyTicket({ ticket, ...scope })).rejects.toThrow('Unauthorized');
  });

  it('renews the same unexpired session only after a fresh ticket and resource authorization', async () => {
    const session = await redeemSandboxProxyTicket({
      ticket: await issueSandboxProxyTicket(grant),
      ...scope
    });
    const previous = records.get(`sandbox-proxy:session:${session}`)!;
    const now = Date.now() + 600_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const ticket = await issueSandboxProxyTicket(grant);
    const renewed = await redeemAuthorizedTicket({
      ticket,
      ...scope,
      existingSession: session,
      authorize
    });
    expect(renewed).toMatchObject({ session, expiresAt: now + 900_000 });
    expect(records.get(`sandbox-proxy:session:${session}`)).not.toBe(previous);
    expect(await readSandboxProxySession({ session, ...scope })).toMatchObject({
      expiresAt: now + 900_000
    });
    await expect(
      redeemAuthorizedTicket({ ticket, ...scope, existingSession: session, authorize })
    ).rejects.toThrow('Unauthorized');
  });

  it.each([
    { userId: 'user-2' },
    { teamId: 'team-2' },
    { tmbId: 'member-2' },
    { provider: 'sealosdevbox' as const },
    { sourceType: 'appRuntime' as const },
    { sourceId: 'skill-2' },
    { sandboxId: 'sandbox-87654321' },
    { targetPort: 8080 },
    { audience: 'http://other.localhost:3000' }
  ])('does not extend another actor or resource session: %j', async (changed) => {
    const session = await redeemSandboxProxyTicket({
      ticket: await issueSandboxProxyTicket(grant),
      ...scope
    });
    const previous = records.get(`sandbox-proxy:session:${session}`);
    const nextGrant = { ...grant, ...changed };
    const renewed = await redeemAuthorizedTicket({
      ticket: await issueSandboxProxyTicket(nextGrant),
      ...nextGrant,
      existingSession: session,
      authorize
    });
    expect(renewed.session).toMatch(/^[a-f0-9]{64}$/);
    expect(renewed.session).not.toBe(session);
    expect(records.get(`sandbox-proxy:session:${session}`)).toBe(previous);
  });

  it('does not revive an expired session even when its Redis record remains', async () => {
    const session = await redeemSandboxProxyTicket({
      ticket: await issueSandboxProxyTicket(grant),
      ...scope
    });
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 901_000);
    const renewed = await redeemAuthorizedTicket({
      ticket: await issueSandboxProxyTicket(grant),
      ...scope,
      existingSession: session,
      authorize
    });
    expect(renewed.session).not.toBe(session);
    await expect(readSandboxProxySession({ session, ...scope })).rejects.toThrow('Unauthorized');
  });

  it('never revives the old logout generation after a fresh login', async () => {
    const session = await redeemSandboxProxyTicket({
      ticket: await issueSandboxProxyTicket(grant),
      ...scope
    });
    await revokeSandboxProxyUser(grant.userId);
    const renewed = await redeemAuthorizedTicket({
      ticket: await issueSandboxProxyTicket(grant),
      ...scope,
      existingSession: session,
      authorize
    });
    expect(renewed.session).not.toBe(session);
    await expect(readSandboxProxySession({ session, ...scope })).rejects.toThrow('Unauthorized');
  });

  it('does not extend any session when resource authorization fails', async () => {
    const session = await redeemSandboxProxyTicket({
      ticket: await issueSandboxProxyTicket(grant),
      ...scope
    });
    const previous = records.get(`sandbox-proxy:session:${session}`);
    authorize.mockRejectedValueOnce(new Error('Access denied'));
    await expect(
      redeemAuthorizedTicket({
        ticket: await issueSandboxProxyTicket(grant),
        ...scope,
        existingSession: session,
        authorize
      })
    ).rejects.toThrow('Access denied');
    expect(records.get(`sandbox-proxy:session:${session}`)).toBe(previous);
  });

  it('atomically rejects logout occurring while resource authorization is in flight', async () => {
    const session = await redeemSandboxProxyTicket({
      ticket: await issueSandboxProxyTicket(grant),
      ...scope
    });
    const previous = records.get(`sandbox-proxy:session:${session}`);
    authorize.mockImplementationOnce(async () => {
      await revokeSandboxProxyUser(grant.userId);
      return 'http://gateway:8090/sandboxes/provider/proxy/44772';
    });
    await expect(
      redeemAuthorizedTicket({
        ticket: await issueSandboxProxyTicket(grant),
        ...scope,
        existingSession: session,
        authorize
      })
    ).rejects.toThrow('Unauthorized');
    expect(records.get(`sandbox-proxy:session:${session}`)).toBe(previous);
  });

  it('ordinary session reads never extend the stored expiration', async () => {
    const session = await redeemSandboxProxyTicket({
      ticket: await issueSandboxProxyTicket(grant),
      ...scope
    });
    const previous = records.get(`sandbox-proxy:session:${session}`);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 600_000);
    await readSandboxProxySession({ session, ...scope });
    expect(records.get(`sandbox-proxy:session:${session}`)).toBe(previous);
  });

  it('preserves the same session when two tabs renew concurrently', async () => {
    const session = await redeemSandboxProxyTicket({
      ticket: await issueSandboxProxyTicket(grant),
      ...scope
    });
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 600_000);
    const tickets = await Promise.all([
      issueSandboxProxyTicket(grant),
      issueSandboxProxyTicket(grant)
    ]);
    const renewed = await Promise.all(
      tickets.map((ticket) =>
        redeemAuthorizedTicket({ ticket, ...scope, existingSession: session, authorize })
      )
    );
    expect(renewed.map((result) => result.session)).toEqual([session, session]);
  });

  it('does not shorten a more recent session expiration when a delayed renewal commits', async () => {
    const session = await redeemSandboxProxyTicket({
      ticket: await issueSandboxProxyTicket(grant),
      ...scope
    });
    const expiresAt = Date.now() + 950_000;
    const key = `sandbox-proxy:session:${session}`;
    records.set(key, JSON.stringify({ ...JSON.parse(records.get(key)!), expiresAt }));
    const renewed = await redeemAuthorizedTicket({
      ticket: await issueSandboxProxyTicket(grant),
      ...scope,
      existingSession: session,
      authorize
    });
    expect(renewed).toMatchObject({ session, expiresAt });
    expect(JSON.parse(records.get(key)!).expiresAt).toBe(expiresAt);
  });

  it('never reuses a resource session from a different workspace generation', async () => {
    const session = await redeemSandboxProxyTicket({
      ticket: await issueSandboxProxyTicket(grant),
      ...scope
    });
    const previous = records.get(`sandbox-proxy:session:${session}`);
    const nextGrant = { ...grant, workspaceGeneration: '22222222-2222-4222-8222-222222222222' };
    const renewed = await redeemAuthorizedTicket({
      ticket: await issueSandboxProxyTicket(nextGrant),
      ...scope,
      existingSession: session,
      authorize
    });
    expect(renewed.session).not.toBe(session);
    expect(records.get(`sandbox-proxy:session:${session}`)).toBe(previous);
    expect(JSON.parse(records.get(`sandbox-proxy:session:${renewed.session}`)!)).toMatchObject(
      nextGrant
    );
  });

  it('rejects a ticket that expires while current resource authorization is pending', async () => {
    const session = await redeemSandboxProxyTicket({
      ticket: await issueSandboxProxyTicket(grant),
      ...scope
    });
    const key = `sandbox-proxy:session:${session}`;
    const previous = records.get(key);
    authorize.mockImplementationOnce(async () => {
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
      return 'http://gateway:8090/sandboxes/provider/proxy/44772';
    });
    await expect(
      redeemAuthorizedTicket({
        ticket: await issueSandboxProxyTicket(grant),
        ...scope,
        existingSession: session,
        authorize
      })
    ).rejects.toThrow('Unauthorized');
    expect(records.get(key)).toBe(previous);
  });

  it('fails closed without extending the old record if the Redis commit fails', async () => {
    const session = await redeemSandboxProxyTicket({
      ticket: await issueSandboxProxyTicket(grant),
      ...scope
    });
    const key = `sandbox-proxy:session:${session}`;
    const previous = records.get(key);
    authorize.mockImplementationOnce(async () => {
      redis.eval.mockRejectedValueOnce(new Error('Redis unavailable'));
      return 'http://gateway:8090/sandboxes/provider/proxy/44772';
    });
    await expect(
      redeemAuthorizedTicket({
        ticket: await issueSandboxProxyTicket(grant),
        ...scope,
        existingSession: session,
        authorize
      })
    ).rejects.toThrow('Redis unavailable');
    expect(records.get(key)).toBe(previous);
  });

  it('cannot mint from an already authorized grant after logout removes its main session', async () => {
    await issueSandboxProxyTicket(grant);
    mainSessions.delete(`session:${mainSessionId}`);
    await revokeSandboxProxyUser(grant.userId);
    await expect(issueAuthorizedTicket({ grant, sessionId: mainSessionId })).rejects.toThrow(
      'Unauthorized'
    );
  });

  it.each(['userId', 'teamId', 'tmbId'] as const)(
    'rejects a main-session %s mismatch at signing time',
    async (field) => {
      mainSessions.set(`session:${mainSessionId}`, { ...grant, [field]: 'changed' });
      await expect(issueAuthorizedTicket({ grant, sessionId: mainSessionId })).rejects.toThrow(
        'Unauthorized'
      );
      expect([...records.keys()].some((key) => key.startsWith('sandbox-proxy:bootstrap:'))).toBe(
        false
      );
    }
  );

  it('does not serialize the main session identifier into bootstrap or resource grants', async () => {
    await redeemSandboxProxyTicket({ ticket: await issueSandboxProxyTicket(grant), ...scope });
    expect(JSON.stringify([...records.values()])).not.toContain(mainSessionId);
  });

  it('rejects a ticket that expires while the Redis commit is queued', async () => {
    const session = await redeemSandboxProxyTicket({
      ticket: await issueSandboxProxyTicket(grant),
      ...scope
    });
    const ticket = await issueSandboxProxyTicket(grant);
    const previous = records.get(`sandbox-proxy:session:${session}`);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 59_000);
    authorize.mockImplementationOnce(async () => {
      const evaluate = redis.eval.getMockImplementation()!;
      redis.eval.mockImplementationOnce(async (...args) => {
        vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000);
        return evaluate(...args);
      });
      return 'http://gateway:8090/sandboxes/provider/proxy/44772';
    });
    await expect(
      redeemAuthorizedTicket({ ticket, ...scope, existingSession: session, authorize })
    ).rejects.toThrow('Unauthorized');
    expect(records.get(`sandbox-proxy:session:${session}`)).toBe(previous);
  });

  it('keeps the main session available for retry when atomic logout fails', async () => {
    const session = await redeemSandboxProxyTicket({
      ticket: await issueSandboxProxyTicket(grant),
      ...scope
    });
    redis.eval.mockRejectedValueOnce(new Error('Redis unavailable'));
    await expect(revokeSandboxProxyUser(grant.userId)).rejects.toThrow('Redis unavailable');
    expect(mainSessions.has(`session:${mainSessionId}`)).toBe(true);
    expect(await readSandboxProxySession({ session, ...scope })).toMatchObject(grant);
    await revokeSandboxProxyUser(grant.userId);
    expect(mainSessions.has(`session:${mainSessionId}`)).toBe(false);
    await expect(readSandboxProxySession({ session, ...scope })).rejects.toThrow('Unauthorized');
    await expect(issueAuthorizedTicket({ grant, sessionId: mainSessionId })).rejects.toThrow(
      'Unauthorized'
    );
  });
});
