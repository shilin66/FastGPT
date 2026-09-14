import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('AGENT_SANDBOX_MAX_EDIT_DEBUG', undefined);
  vi.stubEnv('AGENT_SANDBOX_MAX_SESSION_RUNTIME', undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe('Sandbox capacity environment defaults', () => {
  it.each([undefined, ''])('defaults Edit capacity to 100 when configured as %j', async (value) => {
    vi.stubEnv('AGENT_SANDBOX_MAX_EDIT_DEBUG', value);
    const { env } = await import('@fastgpt/service/env');
    expect(env.AGENT_SANDBOX_MAX_EDIT_DEBUG).toBe(100);
    expect(env.AGENT_SANDBOX_MAX_SESSION_RUNTIME).toBeUndefined();
  });

  it.each(['0', '250'])('preserves the explicit Edit override %s', async (value) => {
    vi.stubEnv('AGENT_SANDBOX_MAX_EDIT_DEBUG', value);
    const { env } = await import('@fastgpt/service/env');
    expect(env.AGENT_SANDBOX_MAX_EDIT_DEBUG).toBe(Number(value));
  });

  it('keeps the Runtime override independent from the Edit default', async () => {
    vi.stubEnv('AGENT_SANDBOX_MAX_SESSION_RUNTIME', '20');
    const { env } = await import('@fastgpt/service/env');
    expect(env.AGENT_SANDBOX_MAX_EDIT_DEBUG).toBe(100);
    expect(env.AGENT_SANDBOX_MAX_SESSION_RUNTIME).toBe(20);
  });
});
