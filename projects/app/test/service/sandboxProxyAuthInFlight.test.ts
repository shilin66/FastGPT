import { describe, expect, it, vi } from 'vitest';
import {
  coalesceSandboxProxyAuthorization,
  type SandboxProxyAuthorizationInput
} from '@/service/core/sandbox/proxyAuthInFlight';

const input: SandboxProxyAuthorizationInput = {
  sandboxId: 'sandbox-generation-1',
  targetPort: 42418,
  reqHeaders: { host: 'localhost:3000', origin: 'http://localhost:3000', cookie: 'session=one' }
};

describe('Sandbox proxy in-flight authorization', () => {
  it('shares only pending checks and never caches settled results', async () => {
    let release!: (value: string) => void;
    const authorize = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        })
    );
    const check = coalesceSandboxProxyAuthorization(authorize);
    const first = check(input);
    const second = check(input);
    expect(authorize).toHaveBeenCalledTimes(1);
    release('allowed');
    expect(await Promise.all([first, second])).toEqual(['allowed', 'allowed']);
    const third = check(input);
    expect(authorize).toHaveBeenCalledTimes(2);
    release('revoked');
    expect(await third).toBe('revoked');
  });

  it.each(['sandboxId', 'targetPort', 'host', 'origin', 'cookie'] as const)(
    'isolates checks when %s changes',
    async (field) => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const authorize = vi.fn(() => gate);
      const check = coalesceSandboxProxyAuthorization(authorize);
      const changed: SandboxProxyAuthorizationInput = {
        ...input,
        reqHeaders: { ...input.reqHeaders }
      };
      if (field === 'sandboxId') changed.sandboxId += '-new';
      else if (field === 'targetPort') changed.targetPort++;
      else changed.reqHeaders[field] = 'different';
      const results = [check(input), check(changed)];
      expect(authorize).toHaveBeenCalledTimes(2);
      release();
      await Promise.all(results);
    }
  );

  it.each([
    { ticket: 'single-use-ticket' },
    { mode: 'renew' as const },
    { connection: { id: 'one', mode: 'open' as const } },
    { connection: { id: 'one', mode: 'renew' as const } },
    { connection: { id: 'one', mode: 'close' as const } }
  ])('never coalesces authorization side effects: %j', async (extra) => {
    const authorize = vi.fn().mockResolvedValue('allowed');
    const check = coalesceSandboxProxyAuthorization(authorize);
    await Promise.all([check({ ...input, ...extra }), check({ ...input, ...extra })]);
    expect(authorize).toHaveBeenCalledTimes(2);
  });

  it('clears rejected checks so a later request can authenticate', async () => {
    const authorize = vi
      .fn()
      .mockRejectedValueOnce(new Error('revoked'))
      .mockResolvedValue('allowed');
    const check = coalesceSandboxProxyAuthorization(authorize);
    const results = await Promise.allSettled([check(input), check(input)]);
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(await check(input)).toBe('allowed');
    expect(authorize).toHaveBeenCalledTimes(2);
  });

  it('bounds pending entries while continuing to authorize new scopes', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const authorize = vi.fn(() => gate);
    const check = coalesceSandboxProxyAuthorization(authorize, 1);
    const changed = { ...input, sandboxId: 'second-generation' };
    const results = [check(input), check(input), check(changed), check(changed)];
    expect(authorize).toHaveBeenCalledTimes(3);
    release();
    await Promise.all(results);
  });
});
