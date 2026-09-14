import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import {
  deleteSkillRelatedSandboxes,
  deleteSandbox
} from '@fastgpt/service/core/agentSkills/sandboxController';

const { existingClient, deleteClient } = vi.hoisted(() => ({
  existingClient: vi.fn(),
  deleteClient: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/sandbox/controller', () => ({
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
