import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { resolveAppSandboxIdentity } from '@fastgpt/service/core/ai/sandbox/identity';
import { getSandboxSessionDirectory } from '@fastgpt/service/core/ai/sandbox/workspace';

vi.mock('@fastgpt/service/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/env')>()),
  env: { AGENT_SANDBOX_PROVIDER: 'opensandbox' }
}));

describe('user sandbox identity', () => {
  const scope = { appId: 'app', userId: 'user', chatId: 'chat-a' };
  beforeEach(async () => {
    await MongoSandboxInstance.deleteMany({});
  });

  it('reuses the same app and effective user across chats', async () => {
    const first = await resolveAppSandboxIdentity(scope);
    const second = await resolveAppSandboxIdentity({ ...scope, chatId: 'chat-b' });
    expect(second.sandboxId).toBe(first.sandboxId);
    expect(first.identity).toMatchObject({ reuseScope: 'user', runtimeUserId: scope.userId });
    expect(first.identity).not.toHaveProperty('sessionId');
  });

  it('separates different apps and effective users', async () => {
    const results = await Promise.all([
      resolveAppSandboxIdentity(scope),
      resolveAppSandboxIdentity({ ...scope, appId: 'other-app' }),
      resolveAppSandboxIdentity({ ...scope, userId: 'other-user' })
    ]);
    expect(new Set(results.map((result) => result.sandboxId)).size).toBe(3);
  });

  it('refuses an implicit provider switch while another provider holds the shared files', async () => {
    await MongoSandboxInstance.create({
      sourceType: 'appRuntime',
      sourceId: scope.appId,
      runtimeUserId: scope.userId,
      reuseScope: 'user',
      provider: 'sealosdevbox',
      sandboxId: 'other-provider',
      status: 'stopped'
    });
    await expect(resolveAppSandboxIdentity(scope)).rejects.toThrow(
      'sandbox_provider_migration_required'
    );
    expect(await MongoSandboxInstance.exists({ sandboxId: 'other-provider' })).not.toBeNull();
  });

  it('preserves historical chat workspaces without adopting or deleting their storage', async () => {
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: 'historical',
      appId: scope.appId,
      userId: scope.userId,
      chatId: scope.chatId,
      storage: {
        mountPath: '/old',
        volumes: [{ name: 'workspace', claimName: 'old-claim', mountPath: '/old' }]
      }
    });
    const resolved = await resolveAppSandboxIdentity(scope);
    expect(resolved.sandboxId).not.toBe('historical');
    expect(resolved.instance).toBeUndefined();
    expect(await MongoSandboxInstance.findOne({ sandboxId: 'historical' }).lean()).toMatchObject({
      storage: { volumes: [{ claimName: 'old-claim' }] }
    });
  });
});

describe('session directory', () => {
  it('keeps ordinary chat IDs readable and separates sessions', () => {
    expect(getSandboxSessionDirectory('/workspace', 'chat-a')).toBe('/workspace/sessions/chat-a');
    expect(getSandboxSessionDirectory('/workspace', 'chat-b')).toBe('/workspace/sessions/chat-b');
  });

  it.each(['../other', 'a/b', '.', '..', '$HOME', '`cmd`', '["test","app","node","chat"]'])(
    'maps %s to one stable safe segment',
    (id) => {
      const path = getSandboxSessionDirectory('/workspace', id);
      expect(path).toMatch(/^\/workspace\/sessions\/[a-zA-Z0-9_-]+$/);
      expect(getSandboxSessionDirectory('/workspace', id)).toBe(path);
      expect(path).not.toBe(getSandboxSessionDirectory('/workspace', 'other'));
    }
  );
});
