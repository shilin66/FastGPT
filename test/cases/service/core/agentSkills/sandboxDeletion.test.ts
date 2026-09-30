import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import {
  deleteSkillRelatedSandboxes,
  deleteSandbox
} from '@fastgpt/service/core/agentSkills/sandboxController';

import {
  SandboxClient,
  deleteSandboxesByChatIds,
  deleteSandboxesByAppId
} from '@fastgpt/service/core/ai/sandbox/controller';

import { SandboxOperationConflict } from '@fastgpt/service/core/ai/sandbox/lease';

const { existingClient, deleteClient } = vi.hoisted(() => ({
  existingClient: vi.fn(),
  deleteClient: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/sandbox/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/controller')>()),
  getExistingSandboxClient: existingClient,
  getSandboxClient: vi.fn(() => {
    throw new Error('must not create a Sandbox');
  })
}));

describe('Skill Edit sandbox deletion ownership', () => {
  const teamId = new Types.ObjectId().toHexString();
  const skillId = new Types.ObjectId().toHexString();
  const assertAuthorized = vi.fn().mockResolvedValue(undefined);
  const create = (extra: Record<string, unknown> = {}) =>
    MongoSandboxInstance.create({
      sandboxId: new Types.ObjectId().toHexString(),
      provider: 'opensandbox',
      status: 'running',
      teamId,
      sourceType: 'skillEdit',
      sourceId: skillId,
      metadata: { teamId, sandboxType: 'edit-debug', skillId },
      ...extra
    });

  beforeEach(() => {
    vi.clearAllMocks();
    deleteClient.mockResolvedValue(undefined);
    existingClient.mockReturnValue({ delete: deleteClient });
  });

  it('deletes only Skill Edit and leaves App runtime bindings untouched', async () => {
    const edit = await create();
    await create({
      sourceType: 'appRuntime',
      sourceId: new Types.ObjectId().toHexString(),
      metadata: { teamId, sandboxType: 'session-runtime', skillIds: [skillId] }
    });
    await deleteSkillRelatedSandboxes({ teamId, skillIds: [skillId], assertAuthorized });
    expect(existingClient).toHaveBeenCalledTimes(1);
    expect(String(existingClient.mock.calls[0][0]._id)).toBe(String(edit._id));
    expect(deleteClient).toHaveBeenCalledWith({ assertAuthorized });
  });

  it('rejects contradictory or foreign team identities before touching any provider', async () => {
    await create();
    await create({ teamId: new Types.ObjectId().toHexString() });
    await expect(
      deleteSkillRelatedSandboxes({ teamId, skillIds: [skillId], assertAuthorized })
    ).rejects.toThrow('identity_conflict');
    expect(existingClient).not.toHaveBeenCalled();
  });

  it('does not swallow provider or volume errors', async () => {
    const edit = await create();
    deleteClient.mockRejectedValue(new Error('volume unavailable'));
    await expect(
      deleteSkillRelatedSandboxes({ teamId, skillIds: [skillId], assertAuthorized })
    ).rejects.toThrow('volume unavailable');
    await expect(deleteSandbox({ sandboxId: String(edit._id), teamId })).rejects.toThrow(
      'volume unavailable'
    );
  });

  it('checks the deletion operation before connecting an existing client', async () => {
    await create();
    const stale = vi.fn().mockRejectedValue(new Error('stale operation'));
    await expect(
      deleteSkillRelatedSandboxes({ teamId, skillIds: [skillId], assertAuthorized: stale })
    ).rejects.toThrow('stale operation');
    expect(existingClient).not.toHaveBeenCalled();
  });

  it('retains ambiguous legacy edit records', async () => {
    await create({
      sourceType: undefined,
      sourceId: undefined,
      appId: skillId,
      chatId: 'different-chat'
    });
    await expect(
      deleteSkillRelatedSandboxes({ teamId, skillIds: [skillId], assertAuthorized })
    ).rejects.toThrow('identity_conflict');
    expect(existingClient).not.toHaveBeenCalled();
  });
});

describe('App runtime sandbox conversation deletion', () => {
  const appId = new Types.ObjectId().toHexString();
  const otherAppId = new Types.ObjectId().toHexString();
  const chatId = 'conversation-to-delete';
  const session = (
    mode: string,
    nodeId = 'agent-node',
    sourceAppId = appId,
    sourceChatId = chatId
  ) => JSON.stringify([mode, sourceAppId, nodeId, sourceChatId]);
  const create = async (sessionId: string, extra: Record<string, unknown> = {}) => {
    const sandboxId = new Types.ObjectId().toHexString();
    await MongoSandboxInstance.create({
      sandboxId,
      provider: 'opensandbox',
      status: 'running',
      sourceType: 'appRuntime',
      sourceId: appId,
      runtimeUserId: 'runtime-user',
      sessionId,
      appId,
      userId: 'runtime-user',
      chatId: sessionId,
      ...extra
    });
    return sandboxId;
  };
  const remaining = async () =>
    (await MongoSandboxInstance.find({}).lean()).map((doc) => doc.sandboxId).sort();

  beforeEach(() => {
    // Replace remote resource destruction while keeping the real Mongo query and ownership filter.
    vi.spyOn(SandboxClient.prototype, 'delete').mockImplementation(async function (
      this: SandboxClient
    ) {
      const { sandboxId } = this as unknown as { sandboxId: string };
      await MongoSandboxInstance.deleteOne({ sandboxId });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('deletes a persisted sourceChatId association without changing the sandbox session identity', async () => {
    const target = await create(session('test'), { sourceChatId: chatId });
    const stored = await MongoSandboxInstance.findOne({ sandboxId: target }).lean();
    expect(stored?.sessionId).toBe(session('test'));
    expect(stored?.chatId).toBe(session('test'));

    await deleteSandboxesByChatIds({ appId, chatIds: [chatId] });

    expect(await remaining()).toEqual([]);
  });

  it('deletes all nodes of legacy test and debug sessions together with normal and legacy chat records', async () => {
    await create(chatId);
    await create(session('test', 'node-a'));
    await create(session('test', 'node-b'));
    await create(session('debug'));
    await create(chatId, {
      sourceType: undefined,
      sourceId: undefined,
      runtimeUserId: undefined,
      sessionId: undefined,
      userId: 'legacy-user'
    });
    await create(session('debug', 'legacy-node'), {
      sourceType: undefined,
      sourceId: undefined,
      runtimeUserId: undefined,
      sessionId: undefined,
      userId: 'legacy-user'
    });

    await deleteSandboxesByChatIds({ appId, chatIds: [chatId] });

    expect(await remaining()).toEqual([]);
  });

  it('keeps unrelated applications, conversations, and Skill Edit workspaces', async () => {
    await create(session('test'), { sourceChatId: chatId });
    const preserved = await Promise.all([
      create(session('test', 'other-chat', appId, 'another-conversation'), {
        sourceChatId: 'another-conversation'
      }),
      create(session('test', 'other-app', otherAppId), {
        appId: otherAppId,
        sourceId: otherAppId,
        sourceChatId: chatId
      }),
      create('edit-debug', {
        sourceType: 'skillEdit',
        sourceChatId: chatId,
        metadata: { sandboxType: 'edit-debug', skillId: appId }
      })
    ]);

    await deleteSandboxesByChatIds({ appId, chatIds: [chatId] });

    expect(await remaining()).toEqual(preserved.sort());
  });

  it('does not let sourceChatId bypass contradictory canonical and legacy ownership fields', async () => {
    const preserved = await Promise.all([
      create(session('test', 'wrong-app'), { appId: otherAppId, sourceChatId: chatId }),
      create(session('test', 'wrong-user'), { userId: 'foreign-user', sourceChatId: chatId }),
      create(session('test', 'wrong-session'), { chatId: 'foreign-session', sourceChatId: chatId }),
      create(session('test', 'missing-user'), { runtimeUserId: undefined, sourceChatId: chatId }),
      create(session('test', 'skill-metadata'), {
        sourceChatId: chatId,
        metadata: { skillId: appId }
      })
    ]);

    await create(session('test', 'valid-identity'), { sourceChatId: chatId });

    await expect(deleteSandboxesByChatIds({ appId, chatIds: [chatId] })).rejects.toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({ message: expect.stringMatching(/identity_conflict/) })
      ])
    });

    expect(await remaining()).toEqual(preserved.sort());
  });

  it('requires an exact supported legacy composite identity rather than a chat ID substring', async () => {
    const preserved = await Promise.all([
      create(session('unknown')),
      create(session('chat')),
      create(session('test', 'wrong-embedded-app', otherAppId)),
      create(session('debug', 'prefix', appId, `${chatId}-suffix`)),
      create(JSON.stringify(['test', appId, 'node', chatId, 'extra'])),
      create(JSON.stringify(['test', appId, 123, chatId])),
      create(`malformed-${chatId}`)
    ]);

    await deleteSandboxesByChatIds({ appId, chatIds: [chatId] });

    expect(await remaining()).toEqual(preserved.sort());
  });

  describe.each(['conversation', 'application'] as const)('%s deletion failures', (scope) => {
    const deleteScope = () =>
      scope === 'conversation'
        ? deleteSandboxesByChatIds({ appId, chatIds: [chatId] })
        : deleteSandboxesByAppId(appId);

    it.each([
      ['provider failure', new Error('provider delete unavailable')],
      ['lease conflict', new SandboxOperationConflict('another operation holds the lease')]
    ])(
      'rejects on %s after processing other instances and retains the failed record for retry',
      async (_name, error) => {
        const failed = await create(session('test', 'failed-delete'), { sourceChatId: chatId });
        await create(session('test', 'healthy-delete'), { sourceChatId: chatId });
        let failureActive = true;
        vi.mocked(SandboxClient.prototype.delete).mockImplementation(async function (
          this: SandboxClient
        ) {
          const { sandboxId } = this as unknown as { sandboxId: string };
          if (sandboxId === failed && failureActive) throw error;
          await MongoSandboxInstance.deleteOne({ sandboxId });
        });

        await expect(deleteScope()).rejects.toMatchObject({ errors: [error] });
        expect(await remaining()).toEqual([failed]);

        failureActive = false;
        await expect(deleteScope()).resolves.toBeUndefined();
        expect(await remaining()).toEqual([]);
      }
    );

    it('rejects an ownership conflict while deleting independent valid instances', async () => {
      const conflicting = await create(session('test', 'conflicting-owner'), {
        sourceChatId: chatId,
        userId: 'foreign-user'
      });
      await create(session('test', 'valid-owner'), { sourceChatId: chatId });

      await expect(deleteScope()).rejects.toMatchObject({
        errors: expect.arrayContaining([
          expect.objectContaining({ message: expect.stringMatching(/identity_conflict/) })
        ])
      });

      expect(await remaining()).toEqual([conflicting]);
    });
  });

  it('leaves all workspaces intact when no conversations are requested', async () => {
    const preserved = await create(session('test'), { sourceChatId: chatId });

    await deleteSandboxesByChatIds({ appId, chatIds: [] });

    expect(await remaining()).toEqual([preserved]);
  });
});
