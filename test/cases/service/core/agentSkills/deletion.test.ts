import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionMongo, Types } from '@fastgpt/service/common/mongo';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { deleteSkill } from '@fastgpt/service/core/agentSkills/controller';
import { cleanupAgentSkillDeletion } from '@fastgpt/service/core/agentSkills/delete/processor';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  addAgentSkillDeleteJob,
  reconcileAgentSkillDeletions
} from '@fastgpt/service/core/agentSkills/delete';
import { randomUUID } from 'node:crypto';
import { AGENT_SKILL_VERSION_RETENTION_MS } from '@fastgpt/service/core/agentSkills/version/cleanup';

const { packageDelete, sandboxDelete, imageDelete } = vi.hoisted(() => ({
  packageDelete: vi.fn().mockResolvedValue(undefined),
  sandboxDelete: vi.fn().mockResolvedValue(undefined),
  imageDelete: vi.fn().mockResolvedValue(undefined)
}));
vi.unmock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/core/agentSkills/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/agentSkills/storage')>()),
  deleteSkillAllPackages: packageDelete,
  deleteSkillPackage: packageDelete
}));
vi.mock('@fastgpt/service/core/agentSkills/sandboxController', () => ({
  deleteSkillRelatedSandboxes: sandboxDelete
}));
vi.mock('@fastgpt/service/common/file/image/controller', () => ({
  removeImageByPath: imageDelete
}));
const { queueAdd, queueGetJob } = vi.hoisted(() => ({ queueAdd: vi.fn(), queueGetJob: vi.fn() }));
vi.mock('@fastgpt/service/common/bullmq', () => ({
  QueueNames: { agentSkillDelete: 'agentSkillDelete' },
  getQueue: () => ({ add: queueAdd, getJob: queueGetJob }),
  getWorker: vi.fn()
}));

describe('Skill durable deletion marking', () => {
  afterEach(() => vi.restoreAllMocks());
  const teamId = new Types.ObjectId().toHexString();
  const tmbId = new Types.ObjectId().toHexString();
  const create = (extra: Record<string, unknown> = {}) =>
    MongoAgentSkills.create({
      teamId,
      tmbId,
      type: 'skill',
      source: 'personal',
      name: new Types.ObjectId().toHexString(),
      avatar: '/test/avatar.png',
      ...extra
    });

  beforeEach(async () => {
    vi.clearAllMocks();
    queueGetJob.mockReset();
    await Promise.all(
      [
        MongoAgentSkills,
        MongoAgentSkillsVersion,
        MongoChat,
        MongoChatItem,
        MongoChatItemResponse,
        MongoResourcePermission
      ].map(async (model) => {
        await model.createCollection();
        await model.init();
      })
    );
  });

  const versionFor = (skillId: string) =>
    MongoAgentSkillsVersion.create({
      skillId,
      tmbId,
      version: 1,
      storage: {
        bucket: 'fastgpt-private',
        key: `agent-skills/${teamId}/${skillId}/v1/package.zip`,
        size: 1
      }
    });

  it('keeps packages and Version audit while cleaning the deleted workspace immediately', async () => {
    const skill = await create();
    const version = await versionFor(String(skill._id));
    const job = await deleteSkill({ skillId: String(skill._id), teamId });
    await cleanupAgentSkillDeletion(job);
    expect(sandboxDelete).toHaveBeenCalledOnce();
    expect(packageDelete).not.toHaveBeenCalled();
    expect(await MongoAgentSkillsVersion.findById(version._id).lean()).toMatchObject({
      isDeleted: true,
      storageDeletedAt: null
    });
    expect((await MongoAgentSkills.findById(skill._id).lean())?.deletionOperation?.checkpoint).toBe(
      'chat_deleted'
    );
    await addAgentSkillDeleteJob(job);
    expect(queueAdd).toHaveBeenLastCalledWith('delete_agent_skill', job, {
      jobId: `${job.skillId}-${job.operationId}`,
      delay: expect.any(Number)
    });
    const delay = queueAdd.mock.calls.at(-1)?.[2].delay;
    expect(delay).toBeGreaterThan(AGENT_SKILL_VERSION_RETENTION_MS - 60000);
    expect(delay).toBeLessThanOrEqual(AGENT_SKILL_VERSION_RETENTION_MS);
  });

  it('deletes only retained objects after 30 days and keeps immutable Version audit on retries', async () => {
    const skill = await create();
    const version = await versionFor(String(skill._id));
    const job = await deleteSkill({ skillId: String(skill._id), teamId });
    await cleanupAgentSkillDeletion(job);
    expect(packageDelete).not.toHaveBeenCalled();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + AGENT_SKILL_VERSION_RETENTION_MS + 1000);
    await cleanupAgentSkillDeletion(job);
    const retained = await MongoAgentSkillsVersion.findById(version._id).orFail().lean();
    expect(retained).toMatchObject({
      isDeleted: true,
      storageDeletedAt: expect.any(Date),
      storage: {
        bucket: version.storage.bucket,
        key: version.storage.key,
        size: version.storage.size
      }
    });
    expect(await MongoAgentSkills.findById(skill._id).lean()).toBeNull();
    expect(packageDelete).toHaveBeenCalledOnce();
    await cleanupAgentSkillDeletion(job);
    expect(await MongoAgentSkillsVersion.findById(version._id).lean()).toEqual(retained);
    expect(packageDelete).toHaveBeenCalledOnce();
  });

  it('retains Version audit when continuing an old packages_deleted checkpoint', async () => {
    const skill = await create();
    const version = await versionFor(String(skill._id));
    const job = await deleteSkill({ skillId: String(skill._id), teamId });
    const storageDeletedAt = new Date();
    await MongoAgentSkillsVersion.updateOne({ _id: version._id }, { $set: { storageDeletedAt } });
    await MongoAgentSkills.updateOne(
      { _id: skill._id },
      { $set: { 'deletionOperation.checkpoint': 'packages_deleted' } }
    );
    await cleanupAgentSkillDeletion(job);
    expect(await MongoAgentSkills.findById(skill._id).lean()).not.toBeNull();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + AGENT_SKILL_VERSION_RETENTION_MS + 1000);
    await cleanupAgentSkillDeletion(job);
    expect(await MongoAgentSkillsVersion.findById(version._id).lean()).toMatchObject({
      isDeleted: true,
      storageDeletedAt
    });
    expect(await MongoAgentSkills.findById(skill._id).lean()).toBeNull();
    expect(packageDelete).not.toHaveBeenCalled();
    expect(sandboxDelete).not.toHaveBeenCalled();
  });

  it('reconciles retention only after the active job is gone without extending its deadline', async () => {
    const skill = await create();
    await versionFor(String(skill._id));
    const job = await deleteSkill({ skillId: String(skill._id), teamId });
    await cleanupAgentSkillDeletion(job);
    const retry = vi.fn();
    queueGetJob.mockResolvedValueOnce({ getState: async () => 'active', retry });
    await addAgentSkillDeleteJob(job);
    expect(queueAdd).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
    const now = Date.now() + 600000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await reconcileAgentSkillDeletions();
    expect(queueAdd).toHaveBeenCalledOnce();
    expect(queueAdd).toHaveBeenCalledWith('delete_agent_skill', job, {
      jobId: `${job.skillId}-${job.operationId}`,
      delay: new Date(job.deleteTime).getTime() + AGENT_SKILL_VERSION_RETENTION_MS - now
    });
  });

  it('does not delete any external resource before the marking transaction commits', async () => {
    const skill = await create();
    const session = await connectionMongo.startSession();
    try {
      await session.withTransaction(async () => {
        await deleteSkill({ skillId: String(skill._id), teamId }, session);
        await session.abortTransaction();
      });
    } finally {
      await session.endSession();
    }
    expect((await MongoAgentSkills.findById(skill._id).lean())?.deleteTime).toBeNull();
    expect(packageDelete).not.toHaveBeenCalled();
    expect(sandboxDelete).not.toHaveBeenCalled();
    expect(imageDelete).not.toHaveBeenCalled();
  });

  it('rejects a system descendant before marking any part of a folder', async () => {
    const folder = await create({ type: 'folder' });
    const child = await create({ parentId: folder._id, source: 'system' });
    await expect(deleteSkill({ skillId: String(folder._id), teamId })).rejects.toThrow('system');
    expect((await MongoAgentSkills.findById(folder._id).lean())?.deleteTime).toBeNull();
    expect((await MongoAgentSkills.findById(child._id).lean())?.deleteTime).toBeNull();
    expect(sandboxDelete).not.toHaveBeenCalled();
  });

  it('rejects foreign team descendants before marking any member', async () => {
    const folder = await create({ type: 'folder' });
    await create({ parentId: folder._id, teamId: new Types.ObjectId().toHexString() });
    await expect(deleteSkill({ skillId: String(folder._id), teamId })).rejects.toThrow(
      'tree_conflict'
    );
    expect((await MongoAgentSkills.findById(folder._id).lean())?.deleteTime).toBeNull();
  });

  it('canonicalizes uppercase Object IDs before marking and cleaning a subtree', async () => {
    const folder = await create({ type: 'folder' });
    const child = await create({ parentId: folder._id });
    const job = await deleteSkill({
      skillId: String(folder._id).toUpperCase(),
      teamId: teamId.toUpperCase()
    });
    expect(job.skillId).toBe(String(folder._id));
    await cleanupAgentSkillDeletion({
      ...job,
      skillId: job.skillId.toUpperCase(),
      teamId: teamId.toUpperCase()
    });
    expect(await MongoAgentSkills.exists({ _id: { $in: [folder._id, child._id] } })).toBeNull();
  });

  it('rejects an independently deleted subtree', async () => {
    const folder = await create({ type: 'folder' });
    const child = await create({ parentId: folder._id });
    await deleteSkill({ skillId: String(child._id), teamId });
    await expect(deleteSkill({ skillId: String(folder._id), teamId })).rejects.toThrow(
      'tree_conflict'
    );
  });

  it('performs no external deletion for a stale operation, timestamp or foreign team job', async () => {
    const skill = await create();
    const job = await deleteSkill({ skillId: String(skill._id), teamId });
    await cleanupAgentSkillDeletion({ ...job, operationId: randomUUID() });
    await cleanupAgentSkillDeletion({ ...job, deleteTime: new Date(0).toISOString() });
    await cleanupAgentSkillDeletion({ ...job, teamId: new Types.ObjectId().toHexString() });
    expect(sandboxDelete).not.toHaveBeenCalled();
    expect(packageDelete).not.toHaveBeenCalled();
  });

  it('refuses new unmarked descendants before external cleanup', async () => {
    const folder = await create({ type: 'folder' });
    const job = await deleteSkill({ skillId: String(folder._id), teamId });
    await create({ parentId: folder._id });
    await expect(cleanupAgentSkillDeletion(job)).rejects.toThrow('tree_conflict');
    expect(sandboxDelete).not.toHaveBeenCalled();
  });

  it('retains marked metadata on sandbox failure and retries the same operation', async () => {
    const skill = await create();
    const job = await deleteSkill({ skillId: String(skill._id), teamId });
    sandboxDelete.mockRejectedValueOnce(new Error('volume unavailable'));
    await expect(cleanupAgentSkillDeletion(job)).rejects.toThrow('volume unavailable');
    expect((await MongoAgentSkills.findById(skill._id).lean())?.deletionOperation?.checkpoint).toBe(
      'marked'
    );
    await cleanupAgentSkillDeletion(job);
    expect(await MongoAgentSkills.findById(skill._id).lean()).toBeNull();
  });

  it('waits for each package and resumes from sandbox completion after S3 failure', async () => {
    const skill = await create();
    const version = await versionFor(String(skill._id));
    const job = await deleteSkill({ skillId: String(skill._id), teamId });
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + AGENT_SKILL_VERSION_RETENTION_MS + 1000);
    packageDelete.mockRejectedValueOnce(new Error('S3 unavailable'));
    await expect(cleanupAgentSkillDeletion(job)).rejects.toThrow('S3 unavailable');
    expect(await MongoAgentSkillsVersion.findById(version._id).lean()).not.toBeNull();
    expect((await MongoAgentSkills.findById(skill._id).lean())?.deletionOperation?.checkpoint).toBe(
      'chat_deleted'
    );
    await cleanupAgentSkillDeletion(job);
    expect(sandboxDelete).toHaveBeenCalledTimes(1);
    expect(packageDelete).toHaveBeenCalledTimes(2);
    expect(await MongoAgentSkills.findById(skill._id).lean()).toBeNull();
  });

  it('retains unowned and shared historical objects instead of deleting them', async () => {
    const skill = await create();
    const version = await versionFor(String(skill._id));
    const other = await create();
    await MongoAgentSkillsVersion.create({
      skillId: other._id,
      tmbId,
      version: 0,
      storage: version.storage
    });
    const job = await deleteSkill({ skillId: String(skill._id), teamId });
    await expect(cleanupAgentSkillDeletion(job)).rejects.toThrow('shared_storage');
    expect(packageDelete).not.toHaveBeenCalled();
    await MongoAgentSkillsVersion.updateOne(
      { _id: version._id },
      { $set: { 'storage.key': 'unknown/history.zip' } }
    );
    await expect(cleanupAgentSkillDeletion(job)).rejects.toThrow('ownership');
    expect(packageDelete).not.toHaveBeenCalled();
  });

  it('keeps metadata until the exact object deletion has completed', async () => {
    const skill = await create();
    await versionFor(String(skill._id));
    const job = await deleteSkill({ skillId: String(skill._id), teamId });
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + AGENT_SKILL_VERSION_RETENTION_MS + 1000);
    let release: () => void = () => {};
    let entered: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    packageDelete.mockImplementationOnce(() => {
      entered();
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const pending = cleanupAgentSkillDeletion(job);
    await started;
    expect(await MongoAgentSkills.exists({ _id: skill._id })).not.toBeNull();
    release();
    await pending;
    expect(await MongoAgentSkills.exists({ _id: skill._id })).toBeNull();
  });

  it('preserves uploaded avatars with no proven exclusive Skill ownership', async () => {
    const skill = await create({ avatar: '/api/system/img/avatar/shared.png' });
    const job = await deleteSkill({ skillId: String(skill._id), teamId });
    await expect(cleanupAgentSkillDeletion(job)).rejects.toThrow('avatar_ownership');
    expect(imageDelete).not.toHaveBeenCalled();
    expect(await MongoAgentSkills.exists({ _id: skill._id })).not.toBeNull();
  });

  it('cleans only explicitly sourced debug history and matching team permissions', async () => {
    const skill = await create();
    const skillId = String(skill._id);
    const otherTeam = new Types.ObjectId().toHexString();
    for (const scope of [
      { teamId, sourceType: 'skillEdit', sourceId: skillId },
      { teamId, sourceType: 'appRuntime', sourceId: skillId },
      { teamId },
      { teamId: otherTeam, sourceType: 'skillEdit', sourceId: skillId }
    ]) {
      const chatId = randomUUID();
      await MongoChat.create({ ...scope, appId: skillId, chatId, tmbId, source: 'test' });
      await MongoChatItem.create({ ...scope, appId: skillId, chatId, tmbId, obj: 'AI' });
    }
    await MongoResourcePermission.create([
      { teamId, tmbId, resourceType: 'agentSkill', resourceId: skillId, permission: 7 },
      { teamId: otherTeam, tmbId, resourceType: 'agentSkill', resourceId: skillId, permission: 7 }
    ]);
    const job = await deleteSkill({ skillId, teamId });
    await cleanupAgentSkillDeletion(job);
    expect(await MongoChat.countDocuments({ appId: skillId })).toBe(3);
    expect(await MongoChatItem.countDocuments({ appId: skillId })).toBe(3);
    expect(await MongoResourcePermission.countDocuments({ resourceId: skillId })).toBe(1);
  });

  it('reconciles a committed deletion that never reached the queue', async () => {
    const skill = await create();
    const job = await deleteSkill({ skillId: String(skill._id), teamId });
    queueAdd.mockRejectedValueOnce(new Error('redis unavailable'));
    await expect(addAgentSkillDeleteJob(job)).rejects.toThrow('redis unavailable');
    expect(
      (await MongoAgentSkills.findById(skill._id).lean())?.deletionOperation?.lastQueuedAt
    ).toBeUndefined();
    await reconcileAgentSkillDeletions();
    expect(queueAdd).toHaveBeenLastCalledWith('delete_agent_skill', job, {
      jobId: `${job.skillId}-${job.operationId}`
    });
    expect(
      (await MongoAgentSkills.findById(skill._id).lean())?.deletionOperation?.lastQueuedAt
    ).toBeInstanceOf(Date);
  });
});
