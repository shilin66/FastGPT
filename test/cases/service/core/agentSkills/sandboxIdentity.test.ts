import { describe, expect, it } from 'vitest';
import {
  generateSandboxIdentityId,
  resolveAppSandboxIdentity
} from '@fastgpt/service/core/ai/sandbox/identity';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { vi } from 'vitest';

vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/env')>();
  return { env: { ...original.env, AGENT_SANDBOX_PROVIDER: 'opensandbox' } };
});

describe('Canonical sandbox identity', () => {
  const identity = {
    sourceType: 'appRuntime' as const,
    sourceId: 'app-one',
    runtimeUserId: 'user-one',
    sessionId: 'chat-one'
  };

  it('is stable and safe for provider labels', () => {
    const sandboxId = generateSandboxIdentityId(identity);
    expect(sandboxId).toBe(generateSandboxIdentityId({ ...identity }));
    expect(sandboxId).toMatch(/^[a-z0-9-]{1,63}$/);
  });

  it('isolates the source, application, final user and session', () => {
    const ids = [
      generateSandboxIdentityId(identity),
      generateSandboxIdentityId({ ...identity, sourceId: 'app-two' }),
      generateSandboxIdentityId({ ...identity, runtimeUserId: 'user-two' }),
      generateSandboxIdentityId({ ...identity, sessionId: 'chat-two' }),
      generateSandboxIdentityId({ sourceType: 'skillEdit', sourceId: identity.sourceId })
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not collide when user-controlled fields contain separators', () => {
    expect(
      generateSandboxIdentityId({ ...identity, sourceId: 'app-a', runtimeUserId: 'b' })
    ).not.toBe(generateSandboxIdentityId({ ...identity, sourceId: 'app', runtimeUserId: 'a-b' }));
  });

  it('rejects missing isolation fields before any resource lookup', () => {
    expect(() => generateSandboxIdentityId({ ...identity, runtimeUserId: '' })).toThrow();
    expect(() => generateSandboxIdentityId({ ...identity, sourceId: '' })).toThrow();
    expect(() => generateSandboxIdentityId({ ...identity, sessionId: '' })).toThrow();
  });

  it('rejects a generated key already held by a different identity', async () => {
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: generateSandboxIdentityId(identity),
      ...identity,
      runtimeUserId: 'another-user'
    });
    await expect(
      resolveAppSandboxIdentity({
        appId: identity.sourceId,
        userId: identity.runtimeUserId,
        chatId: identity.sessionId
      })
    ).rejects.toThrow('sandbox_identity_migration_required');
  });

  it('rejects inconsistent canonical and legacy ownership fields', async () => {
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: 'canonical-with-conflicting-owner',
      ...identity,
      appId: identity.sourceId,
      userId: 'another-user',
      chatId: identity.sessionId
    });
    await expect(
      resolveAppSandboxIdentity({
        appId: identity.sourceId,
        userId: identity.runtimeUserId,
        chatId: identity.sessionId
      })
    ).rejects.toThrow('sandbox_identity_migration_required');
  });

  it('rejects multiple proven records instead of guessing which volume to reuse', async () => {
    await MongoSandboxInstance.create([
      { provider: 'opensandbox', sandboxId: 'canonical', ...identity },
      {
        provider: 'opensandbox',
        sandboxId: 'legacy',
        appId: identity.sourceId,
        userId: identity.runtimeUserId,
        chatId: identity.sessionId
      }
    ]);
    await expect(
      resolveAppSandboxIdentity({
        appId: identity.sourceId,
        userId: identity.runtimeUserId,
        chatId: identity.sessionId
      })
    ).rejects.toThrow('sandbox_identity_migration_required');
  });
});
