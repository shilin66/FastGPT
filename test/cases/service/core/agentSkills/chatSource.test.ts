import { beforeEach, describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { ChatRoleEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { getSkillChatScope, assertSkillChatSession } from '@fastgpt/service/core/agentSkills/chat';
import {
  pushChatRecords,
  prepareChatRound,
  finalizeChatRound
} from '@fastgpt/service/core/chat/saveChat';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { MongoAppChatLog } from '@fastgpt/service/core/app/logs/chatLogsSchema';
import type { UserChatItemType } from '@fastgpt/global/core/chat/type';

describe('Skill debug chat source isolation', () => {
  const teamId = new Types.ObjectId().toHexString();
  const tmbId = new Types.ObjectId().toHexString();
  const skillId = new Types.ObjectId().toHexString();
  const chatId = 'shared-chat-id';

  beforeEach(async () => {
    await Promise.all([MongoChat.deleteMany({}), MongoChatItem.deleteMany({})]);
  });

  const createItem = (dataId: string, sourceType?: string, overrides = {}) =>
    MongoChatItem.collection.insertOne({
      appId: new Types.ObjectId(skillId),
      teamId: new Types.ObjectId(teamId),
      tmbId: new Types.ObjectId(tmbId),
      chatId,
      dataId,
      obj: ChatRoleEnum.Human,
      value: [{ text: { content: dataId } }],
      deleteTime: null,
      ...(sourceType ? { sourceType, sourceId: new Types.ObjectId(skillId) } : {}),
      ...overrides
    });

  it('excludes explicit Skill records from the ordinary App history reader', async () => {
    await createItem('skill', 'skillEdit');
    await createItem('app', 'appRuntime');
    await createItem('legacy');
    const result = await getChatItems({ appId: skillId, chatId, field: 'obj value', limit: 20 });
    expect(result.histories.map((item) => item.dataId)).toEqual(['app', 'legacy']);
  });

  it('reads only the explicit Skill and team, never legacy guesses or other sources', async () => {
    await createItem('skill', 'skillEdit');
    await createItem('app', 'appRuntime');
    await createItem('legacy');
    await createItem('other-team', 'skillEdit', { teamId: new Types.ObjectId() });
    await createItem('other-skill', 'skillEdit', { sourceId: new Types.ObjectId() });
    const result = await getChatItems({
      appId: skillId,
      chatId,
      sourceScope: getSkillChatScope({ skillId, teamId }),
      field: 'obj value',
      limit: 20
    });
    expect(result.histories.map((item) => item.dataId)).toEqual(['skill']);
  });

  it('rejects reusing a legacy, App or deleted chat instead of overwriting its ownership', async () => {
    const chat = await MongoChat.create({
      appId: skillId,
      teamId,
      tmbId,
      chatId,
      source: ChatSourceEnum.test
    });
    await expect(assertSkillChatSession({ skillId, teamId, chatId })).rejects.toThrow();
    await MongoChat.updateOne(
      { _id: chat._id },
      { $set: { sourceType: 'skillEdit', sourceId: skillId } }
    );
    await expect(assertSkillChatSession({ skillId, teamId, chatId })).resolves.toBeUndefined();
    await MongoChat.updateOne({ _id: chat._id }, { $set: { deleteTime: new Date() } });
    await expect(assertSkillChatSession({ skillId, teamId, chatId })).rejects.toThrow();
  });

  it('persists the explicit source on the whole chat group', async () => {
    await pushChatRecords({
      appId: skillId,
      chatId,
      teamId,
      tmbId,
      sourceScope: getSkillChatScope({ skillId, teamId }),
      source: ChatSourceEnum.test,
      nodes: [],
      newTitle: 'debug',
      durationSeconds: 1,
      userContent: { obj: ChatRoleEnum.Human, value: [{ text: { content: 'question' } }] },
      aiContent: {
        obj: ChatRoleEnum.AI,
        dataId: 'answer',
        value: [{ text: { content: 'answer' } }],
        responseData: [{ nodeId: 'agent', moduleName: 'Agent' }]
      }
    });
    for (const rows of [
      await MongoChat.find({}).lean(),
      await MongoChatItem.find({}).lean(),
      await MongoChatItemResponse.find({}).lean()
    ]) {
      expect(rows.length).toBeGreaterThan(0);
      expect(
        rows.every(
          (row) =>
            row.sourceType === 'skillEdit' &&
            String(row.sourceId) === skillId &&
            String(row.teamId) === teamId
        )
      ).toBe(true);
    }
    expect(await MongoAppChatLog.countDocuments({ appId: skillId })).toBe(0);
  });

  it('does not let ordinary pending-round writes overwrite an explicit Skill chat', async () => {
    await MongoChat.create({
      appId: skillId,
      teamId,
      tmbId,
      chatId,
      source: ChatSourceEnum.test,
      ...getSkillChatScope({ skillId, teamId })
    });
    await expect(
      prepareChatRound({
        appId: skillId,
        chatId,
        teamId,
        tmbId,
        source: ChatSourceEnum.test,
        userContent: { obj: ChatRoleEnum.Human, value: [{ text: { content: 'app' } }] },
        responseChatItemId: 'app-response'
      })
    ).rejects.toThrow();
    expect(await MongoChatItem.countDocuments({})).toBe(0);
  });

  it('preserves the source through prepare and finalize', async () => {
    const sourceScope = getSkillChatScope({ skillId, teamId });
    const userContent: UserChatItemType & { dataId: string } = {
      obj: ChatRoleEnum.Human,
      dataId: 'prepared-question',
      value: [{ text: { content: 'question' } }]
    };
    await prepareChatRound({
      appId: skillId,
      chatId,
      teamId,
      tmbId,
      sourceScope,
      source: ChatSourceEnum.test,
      userContent,
      responseChatItemId: 'prepared-answer'
    });
    await finalizeChatRound({
      appId: skillId,
      chatId,
      teamId,
      tmbId,
      sourceScope,
      source: ChatSourceEnum.test,
      nodes: [],
      newTitle: 'prepared',
      durationSeconds: 1,
      userContent,
      aiContent: {
        obj: ChatRoleEnum.AI,
        dataId: 'prepared-answer',
        value: [{ text: { content: 'answer' } }],
        responseData: [{ nodeId: 'agent', moduleName: 'Agent' }]
      }
    });
    const result = await getChatItems({
      appId: skillId,
      chatId,
      sourceScope,
      field: 'obj value responseData',
      limit: 10
    });
    expect(result.total).toBe(2);
    expect(result.histories[1].responseData).toHaveLength(1);
    expect(
      (await getChatItems({ appId: skillId, chatId, field: 'obj value', limit: 10 })).total
    ).toBe(0);
  });
});
