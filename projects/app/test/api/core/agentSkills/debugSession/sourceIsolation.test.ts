import { describe, expect, it, vi } from 'vitest';
import list from '@/pages/api/core/agentSkills/debugSession/list';
import records from '@/pages/api/core/agentSkills/debugSession/records';
import deleteSession from '@/pages/api/core/agentSkills/debugSession/delete';
import deleteItem from '@/pages/api/core/agentSkills/debugSession/chatItem/delete';
import debug from '@/pages/api/core/agentSkills/debugChat';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { ReadRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { ChatSourceEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { sseErrRes } from '@fastgpt/service/common/response';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  dispatchWorkFlow: vi.fn(async () => ({
    flowResponses: [{ nodeId: 'agent', moduleName: 'Agent' }],
    assistantResponses: [{ text: { content: 'debug answer' } }],
    system_memories: {},
    durationSeconds: 1,
    customFeedbacks: []
  }))
}));

const fixture = async () => {
  const owner = await getUser('debug-source-owner');
  const reader = await getUser('debug-source-reader', owner.teamId);
  const skill = await MongoAgentSkills.create({
    name: 'debug-source',
    source: 'personal',
    teamId: owner.teamId,
    tmbId: owner.tmbId
  });
  const skillId = String(skill._id);
  await MongoResourcePermission.create({
    teamId: owner.teamId,
    tmbId: reader.tmbId,
    resourceType: PerResourceTypeEnum.agentSkill,
    resourceId: skillId,
    permission: ReadRoleVal
  });
  return { owner, reader, skillId };
};

describe('Skill debug API source and permission boundary', () => {
  it('stores a successful debug API turn in all three explicitly scoped collections', async () => {
    const { owner, skillId } = await fixture();
    await MongoSandboxInstance.create({
      sandboxId: 'debug-source-sandbox',
      provider: 'opensandbox',
      status: 'running',
      sourceType: 'skillEdit',
      sourceId: skillId,
      teamId: owner.teamId,
      ownerTmbId: owner.tmbId,
      runtimeUserId: 'skillEdit',
      sessionId: 'edit-debug',
      metadata: { sandboxType: 'edit-debug', skillId, teamId: owner.teamId }
    });
    vi.mocked(sseErrRes).mockClear();
    await Call(debug, {
      auth: owner,
      headers: {},
      cookies: {},
      body: {
        skillId,
        chatId: 'debug-source-session',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hello' }]
      }
    });
    expect(sseErrRes).not.toHaveBeenCalled();
    for (const model of [MongoChat, MongoChatItem, MongoChatItemResponse]) {
      const rows = await model.collection.find({ chatId: 'debug-source-session' }).toArray();
      expect(rows.length).toBeGreaterThan(0);
      expect(
        rows.every(
          (row) =>
            row.sourceType === 'skillEdit' &&
            String(row.sourceId) === skillId &&
            String(row.teamId) === owner.teamId
        )
      ).toBe(true);
    }
  });
  it('requires Write for every debug endpoint even when the same-team member has Read', async () => {
    const { reader, skillId } = await fixture();
    for (const handler of [list, records, deleteSession, deleteItem]) {
      const result = await Call(handler, {
        auth: reader,
        query: { skillId },
        body: { skillId, chatId: 'session', contentId: 'item' }
      });
      expect(result.code).not.toBe(200);
    }
    vi.mocked(sseErrRes).mockClear();
    await Call(debug, {
      auth: reader,
      body: {
        skillId,
        chatId: 'session',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hello' }]
      }
    });
    expect(vi.mocked(sseErrRes).mock.calls[0]?.[1]).toBe('unAuthSkill');
  });

  it('does not list, read or delete legacy, App and foreign-team records', async () => {
    const { owner, skillId } = await fixture();
    for (const [chatId, sourceType, teamId] of [
      ['legacy', undefined, owner.teamId],
      ['app', 'appRuntime', owner.teamId],
      ['foreign', 'skillEdit', new Types.ObjectId().toHexString()]
    ]) {
      await MongoChat.create({
        appId: skillId,
        teamId,
        tmbId: owner.tmbId,
        chatId,
        source: ChatSourceEnum.test,
        ...(sourceType ? { sourceType, sourceId: skillId } : {})
      });
      await MongoChatItem.create({
        appId: skillId,
        teamId,
        tmbId: owner.tmbId,
        chatId,
        dataId: 'item',
        obj: ChatRoleEnum.Human,
        value: [],
        ...(sourceType ? { sourceType, sourceId: skillId } : {})
      });
      for (const handler of [records, deleteSession, deleteItem]) {
        const result = await Call(handler, {
          auth: owner,
          body: { skillId, chatId, contentId: 'item' }
        });
        expect(result.code).not.toBe(200);
      }
    }
    const result = await Call(list, { auth: owner, query: { skillId } });
    expect(result.data.total).toBe(0);
    expect(await MongoChat.countDocuments({ deleteTime: { $type: 'date' } })).toBe(0);
    expect(await MongoChatItem.countDocuments({ deleteTime: { $type: 'date' } })).toBe(0);
  });
});
