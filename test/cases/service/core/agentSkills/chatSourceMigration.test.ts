import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAgentSkillMigrationCheckpoint } from '@fastgpt/service/core/agentSkills/migration/schema';
import { migrateSkillChatSources } from '@fastgpt/service/core/agentSkills/migration/chatSource';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const fixture = async () => {
  const skillId = new Types.ObjectId();
  const teamId = new Types.ObjectId();
  const tmbId = new Types.ObjectId();
  await MongoAgentSkills.collection.insertOne({ _id: skillId, teamId, tmbId });
  const chat = await MongoChat.create({
    appId: skillId,
    teamId,
    tmbId,
    chatId: 'legacy-debug',
    source: 'test'
  });
  const identity = { appId: skillId, teamId, tmbId, chatId: chat.chatId };
  await MongoChatItem.collection.insertOne({ ...identity, dataId: 'question', value: [] });
  await MongoChatItemResponse.collection.insertOne({
    ...identity,
    chatItemDataId: 'answer',
    data: {}
  });
  return { teamId: String(teamId), skillId: String(skillId), chatIds: [String(chat._id)] };
};

describe('explicit Skill chat source migration', () => {
  beforeEach(async () => {
    await Promise.all(
      [
        MongoAgentSkills,
        MongoApp,
        MongoChat,
        MongoChatItem,
        MongoChatItemResponse,
        MongoAgentSkillMigrationCheckpoint
      ].map(async (model) => {
        await model.createCollection();
        await model.init();
      })
    );
  });

  it('aborts every collection and checkpoint if a child group compare-and-set fails', async () => {
    const target = await fixture();
    const update = vi.spyOn(MongoChatItemResponse, 'updateMany').mockResolvedValue({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
      upsertedId: null
    });
    try {
      const report = await migrateSkillChatSources({
        ...target,
        mode: 'backfill',
        confirmWrite: true
      });
      expect(report.results[0]).toMatchObject({
        status: 'conflict',
        reason: 'Chat source compare-and-set failed; the whole transaction was aborted'
      });
      expect(update).toHaveBeenCalled();
      expect(await MongoChat.countDocuments({ sourceType: { $exists: true } })).toBe(0);
      expect(await MongoChatItem.countDocuments({ sourceType: { $exists: true } })).toBe(0);
      expect(await MongoAgentSkillMigrationCheckpoint.countDocuments({})).toBe(0);
    } finally {
      update.mockRestore();
    }
  });
  it('defaults to a read-only audit of an explicit Chat id list', async () => {
    const target = await fixture();
    const report = await migrateSkillChatSources(target);
    expect(report.results[0].status).toBe('eligible');
    expect(await MongoChat.countDocuments({ sourceType: { $exists: true } })).toBe(0);
    expect(await MongoAgentSkillMigrationCheckpoint.countDocuments({})).toBe(0);
    await expect(migrateSkillChatSources({ ...target, mode: 'backfill' })).rejects.toThrow();
  });

  it('backfills the entire group and rolls back exactly those source fields', async () => {
    const target = await fixture();
    expect(
      (await migrateSkillChatSources({ ...target, mode: 'backfill', confirmWrite: true }))
        .results[0].status
    ).toBe('completed');
    for (const model of [MongoChat, MongoChatItem, MongoChatItemResponse]) {
      expect(await model.collection.countDocuments({ sourceType: 'skillEdit' })).toBe(1);
    }
    expect(
      (await migrateSkillChatSources({ ...target, mode: 'rollback', confirmWrite: true }))
        .results[0].status
    ).toBe('rolled-back');
    for (const model of [MongoChat, MongoChatItem, MongoChatItemResponse]) {
      expect(await model.collection.countDocuments({ sourceType: { $exists: true } })).toBe(0);
      expect(await model.collection.countDocuments({ sourceId: { $exists: true } })).toBe(0);
    }
    expect(await MongoChat.countDocuments({ source: 'test' })).toBe(1);
  });

  it('refuses App collisions, cross-team children and partially marked groups', async () => {
    const target = await fixture();
    await MongoApp.collection.insertOne({ _id: new Types.ObjectId(target.skillId) });
    expect((await migrateSkillChatSources(target)).results[0].status).toBe('conflict');
    await MongoApp.deleteMany({});
    await MongoChatItem.updateOne({}, { $set: { teamId: new Types.ObjectId() } });
    expect(
      (await migrateSkillChatSources({ ...target, mode: 'backfill', confirmWrite: true }))
        .results[0].status
    ).toBe('conflict');
    await MongoChatItem.updateOne(
      {},
      { $set: { teamId: target.teamId, sourceType: 'skillEdit', sourceId: target.skillId } }
    );
    expect((await migrateSkillChatSources(target)).results[0].status).toBe('conflict');
    expect(await MongoChat.countDocuments({ sourceType: { $exists: true } })).toBe(0);
  });

  it('refuses rollback after new messages or ownership changes without partially clearing the group', async () => {
    const target = await fixture();
    await migrateSkillChatSources({ ...target, mode: 'backfill', confirmWrite: true });
    const response = await MongoChatItemResponse.findOne().lean();
    await MongoChatItemResponse.collection.insertOne({
      appId: new Types.ObjectId(target.skillId),
      teamId: new Types.ObjectId(target.teamId),
      chatId: 'legacy-debug',
      sourceType: 'skillEdit',
      sourceId: new Types.ObjectId(target.skillId),
      chatItemDataId: 'new'
    });
    expect(
      (await migrateSkillChatSources({ ...target, mode: 'rollback', confirmWrite: true }))
        .results[0].status
    ).toBe('conflict');
    expect(await MongoChat.countDocuments({ sourceType: 'skillEdit' })).toBe(1);
    await MongoChatItemResponse.deleteMany({ _id: { $ne: response!._id } });
    await MongoChatItemResponse.updateOne({}, { $set: { sourceId: new Types.ObjectId() } });
    expect(
      (await migrateSkillChatSources({ ...target, mode: 'rollback', confirmWrite: true }))
        .results[0].status
    ).toBe('conflict');
    expect(await MongoChatItem.countDocuments({ sourceType: 'skillEdit' })).toBe(1);
  });
});
