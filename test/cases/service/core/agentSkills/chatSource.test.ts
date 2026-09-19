import { beforeEach, describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { ChatRoleEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import {
  getSkillChatScope,
  assertSkillChatSession,
  claimSkillDebugResume,
  loadSkillDebugHistories
} from '@fastgpt/service/core/agentSkills/chat';
import {
  pushChatRecords,
  prepareChatRound,
  finalizeChatRound,
  updateInteractiveChat
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

  it('resumes the visible question instead of a newer hidden execution record', async () => {
    const interactive = {
      type: 'agentPlanAskQuery' as const,
      params: { content: 'Which input?' },
      entryNodeIds: [],
      memoryEdges: [],
      nodeOutputs: []
    };
    const shared = {
      appId: skillId,
      chatId,
      teamId,
      tmbId,
      sourceScope: getSkillChatScope({ skillId, teamId }),
      source: ChatSourceEnum.test,
      nodes: [],
      newTitle: 'ask',
      durationSeconds: 1
    };
    await pushChatRecords({
      ...shared,
      userContent: { obj: ChatRoleEnum.Human, value: [{ text: { content: 'Create' } }] },
      aiContent: { obj: ChatRoleEnum.AI, dataId: 'ask', value: [{ interactive }] }
    });
    const run = await MongoChatItem.create({
      _id: new Types.ObjectId('ffffffffffffffffffffffff'),
      ...shared,
      ...shared.sourceScope,
      obj: ChatRoleEnum.AI,
      dataId: 'run-resume',
      value: [],
      hideInUI: true,
      execution: { requestId: 'resume', status: 'running', updatedAt: new Date() }
    });
    await updateInteractiveChat({
      ...shared,
      interactive,
      userContent: { obj: ChatRoleEnum.Human, value: [{ text: { content: 'stdin' } }] },
      aiContent: { obj: ChatRoleEnum.AI, dataId: 'answer', value: [{ text: { content: 'done' } }] }
    });
    const question = await MongoChatItem.findOne({ dataId: 'ask' }).lean();
    expect(question?.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          interactive: expect.objectContaining({
            params: expect.objectContaining({ answer: 'stdin' })
          })
        })
      ])
    );
    expect((await MongoChatItem.findById(run._id).lean())?.value).toEqual([]);
    expect(await MongoChatItem.countDocuments({ dataId: 'answer' })).toBe(1);
  });

  it('consumes a paused continuation before side effects and never replays it after a crash', async () => {
    const nodeId = 'skill-debug-agent';
    const key = `agentLoopMemory-${nodeId}`;
    const memory = {
      schemaVersion: 1,
      engine: 'pi',
      status: 'paused',
      providerState: { pendingMainContext: [] }
    };
    await createItem('paused', 'skillEdit', {
      obj: ChatRoleEnum.AI,
      value: [
        {
          interactive: {
            type: 'agentPlanAskQuery',
            entryNodeIds: [nodeId],
            params: { content: 'Which input?' }
          }
        }
      ],
      memories: { [key]: memory }
    });
    const params = { skillId, teamId, chatId, nodeId };
    const histories = await loadSkillDebugHistories(params);
    await claimSkillDebugResume({ ...params, histories, requestId: 'first-resume' });
    expect(histories.at(-1)?.memories?.[key]).toEqual(memory);
    expect((await MongoChatItem.findOne({ dataId: 'paused' }).lean())?.memories?.[key]).toEqual({
      schemaVersion: 1,
      engine: 'pi',
      status: 'failed',
      consumedBy: 'first-resume'
    });
    await expect(
      claimSkillDebugResume({ ...params, histories, requestId: 'retry-stale' })
    ).rejects.toThrow('skill_resume_unavailable');
    const refreshed = await loadSkillDebugHistories(params);
    await expect(
      claimSkillDebugResume({ ...params, histories: refreshed, requestId: 'retry-new' })
    ).rejects.toThrow('skill_resume_unavailable');
    await MongoChatItem.updateOne({ dataId: 'paused' }, { $set: { memories: { [key]: memory } } });
    await expect(
      claimSkillDebugResume({
        ...params,
        histories,
        teamId: new Types.ObjectId().toHexString(),
        requestId: 'wrong-team'
      })
    ).rejects.toThrow('skill_resume_unavailable');
    expect((await MongoChatItem.findOne({ dataId: 'paused' }).lean())?.memories?.[key]).toEqual(
      memory
    );
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
