import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import {
  findChatSandboxInstance,
  getChatSandboxClient,
  SandboxClient
} from '@fastgpt/service/core/ai/sandbox/controller';

vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/env')>();
  return {
    env: {
      ...original.env,
      AGENT_SANDBOX_PROVIDER: 'opensandbox',
      AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://sandbox.example.test:8090'
    }
  };
});

describe('Chat sandbox file workspace lookup', () => {
  const appId = new Types.ObjectId().toHexString();
  const userId = 'workspace-owner';
  const chatId = 'preview-conversation';
  const query = { appId, userId, chatId };
  const session = (mode = 'test', nodeId = new Types.ObjectId().toHexString()) =>
    JSON.stringify([mode, appId, nodeId, chatId]);
  const create = (sessionId = session(), extra: Record<string, unknown> = {}) =>
    MongoSandboxInstance.create({
      sandboxId: new Types.ObjectId().toHexString(),
      provider: 'opensandbox',
      status: 'running',
      sourceType: 'appRuntime',
      sourceId: appId,
      runtimeUserId: userId,
      sessionId,
      appId,
      userId,
      chatId: sessionId,
      ...extra
    });

  afterEach(() => vi.restoreAllMocks());

  it('finds the existing preview workspace by its original conversation association', async () => {
    const workspace = await create(session(), { sourceChatId: chatId });
    const found = await findChatSandboxInstance(query);
    expect(found?.sandboxId).toBe(workspace.sandboxId);
    expect(found?.sessionId).toBe(workspace.sessionId);
  });

  it.each(['test', 'debug'])(
    'finds legacy %s composite sessions without sourceChatId',
    async (mode) => {
      const workspace = await create(session(mode));
      expect((await findChatSandboxInstance(query))?.sandboxId).toBe(workspace.sandboxId);
    }
  );

  it('finds ordinary chat sessions and legacy VM workspaces', async () => {
    const ordinary = await create(chatId);
    expect((await findChatSandboxInstance(query))?.sandboxId).toBe(ordinary.sandboxId);
    await MongoSandboxInstance.deleteOne({ _id: ordinary._id });
    const legacy = await create(chatId, {
      sourceType: undefined,
      sourceId: undefined,
      runtimeUserId: undefined,
      sessionId: undefined
    });
    expect((await findChatSandboxInstance(query))?.sandboxId).toBe(legacy.sandboxId);
  });

  it.each([
    ['other app', { sourceId: 'other-app', appId: 'other-app' }],
    ['other user', { runtimeUserId: 'other-user', userId: 'other-user' }],
    ['other conversation', { sourceChatId: 'other-chat' }],
    ['other provider', { provider: 'e2b' }],
    ['Skill Edit', { sourceType: 'skillEdit' }],
    ['conflicting app alias', { appId: 'other-app' }],
    ['conflicting user alias', { userId: 'other-user' }],
    ['conflicting session alias', { chatId: 'other-session' }],
    ['missing canonical user', { runtimeUserId: undefined }],
    ['Skill Edit metadata', { metadata: { sandboxType: 'edit-debug' } }],
    ['skill ownership metadata', { metadata: { skillId: appId } }],
    ['deleted workspace', { deleteTime: new Date() }],
    ['deleting workspace', { status: 'deleting' }]
  ])('excludes %s without letting sourceChatId bypass ownership', async (_name, extra) => {
    await create(session(), { sourceChatId: chatId, ...extra });
    expect(await findChatSandboxInstance(query)).toBeUndefined();
  });

  it.each([
    JSON.stringify(['test', 'other-app', 'node', chatId]),
    JSON.stringify(['chat', appId, 'node', chatId]),
    JSON.stringify(['test', appId, 12, chatId]),
    JSON.stringify(['test', appId, 'node', chatId, 'extra'])
  ])('does not associate invalid legacy identity %s with this conversation', async (identity) => {
    await create(identity);
    expect(await findChatSandboxInstance(query)).toBeUndefined();
  });

  it('chooses the latest active node unless an exact sandbox is requested', async () => {
    const older = await create(session('test', 'older-node'), {
      sourceChatId: chatId,
      lastActiveAt: new Date('2026-09-29T00:00:00Z')
    });
    const latest = await create(session('test', 'latest-node'), {
      sourceChatId: chatId,
      lastActiveAt: new Date('2026-09-29T01:00:00Z')
    });
    expect((await findChatSandboxInstance(query))?.sandboxId).toBe(latest.sandboxId);
    expect(
      (await findChatSandboxInstance({ ...query, sandboxId: older.sandboxId }))?.sandboxId
    ).toBe(older.sandboxId);
    expect(
      await findChatSandboxInstance({ ...query, sandboxId: 'missing-sandbox' })
    ).toBeUndefined();
  });

  it('does not fall back to an owned node when a foreign sandbox is explicitly requested', async () => {
    await create(session(), { sourceChatId: chatId });
    const foreign = await create(session(), {
      sourceChatId: chatId,
      runtimeUserId: 'another-user',
      userId: 'another-user'
    });
    expect(
      await findChatSandboxInstance({ ...query, sandboxId: foreign.sandboxId })
    ).toBeUndefined();
  });

  it('does not provision a workspace while looking up files for an empty conversation', async () => {
    const provision = vi.spyOn(SandboxClient.prototype, 'ensureAvailable');
    await expect(getChatSandboxClient(query)).rejects.toThrow('Sandbox workspace not found');
    expect(await MongoSandboxInstance.countDocuments({})).toBe(0);
    expect(provision).not.toHaveBeenCalled();
  });

  it.each([
    [{ sandboxType: 'session-runtime', workspaceRoot: '/workspace' }, '/workspace'],
    [{ sandboxType: 'session-runtime' }, '/home/sandbox/workspace'],
    [undefined, '/home/sandbox']
  ])('uses the persisted workspace boundary %j', async (metadata, expectedRoot) => {
    await create(session(), { sourceChatId: chatId, metadata });
    const provision = vi.spyOn(SandboxClient.prototype, 'ensureAvailable');
    vi.spyOn(SandboxClient.prototype, 'provider', 'get').mockReturnValue({
      rootPath: '/home/sandbox'
    } as unknown as SandboxClient['provider']);
    const client = await getChatSandboxClient(query);
    expect(client.workspaceRoot).toBe(expectedRoot);
    expect(await MongoSandboxInstance.countDocuments({})).toBe(1);
    expect(provision).not.toHaveBeenCalled();
  });
});
