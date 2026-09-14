import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import histories from '@/pages/api/core/chat/history/getHistories';
import status from '@/pages/api/core/chat/history/getHistoryStatus';
import init from '@/pages/api/core/chat/init';
import records from '@/pages/api/core/chat/record/getResData';
import deleteItem from '@/pages/api/core/chat/record/delete';
import deleteSession from '@/pages/api/core/chat/history/delHistory';
import batchDelete from '@/pages/api/core/chat/history/batchDelete';
import logs from '@/pages/api/core/app/logs/list';
import logUsers from '@/pages/api/core/app/logs/getUsers';
import completionsV1 from '@/pages/api/v1/chat/completions';
import completionsV2 from '@/pages/api/v2/chat/completions';
import { jsonRes } from '@fastgpt/service/common/response';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { deleteAppDataProcessor } from '@fastgpt/service/core/app/controller';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { resetChat } from '@fastgpt/service/support/outLink/runtime/utils';
import {
  ensureGenerateChat,
  tryStartGenerateChat
} from '@fastgpt/service/core/chat/chatGenerateStatus';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';

vi.mock('@fastgpt/service/core/ai/sandbox/controller', () => ({
  deleteSandboxesByAppId: vi.fn().mockResolvedValue(undefined),
  deleteSandboxesByChatIds: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  dispatchWorkFlow: vi.fn().mockRejectedValue(new Error('Unexpected workflow execution'))
}));

const deletePrefix = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  deletePrefix.mockClear();
  vi.mocked(jsonRes).mockClear();
  vi.mocked(dispatchWorkFlow).mockClear();
  vi.mocked(getS3ChatSource).mockReturnValue({
    ...getS3ChatSource(),
    deleteChatFilesByPrefix: deletePrefix
  });
});

const fixture = async (withApp = true) => {
  const user = await getUser('ordinary-app-source-boundary');
  const appId = new Types.ObjectId().toHexString();
  if (withApp)
    await MongoApp.create({
      _id: appId,
      name: 'App',
      teamId: user.teamId,
      tmbId: user.tmbId,
      type: 'simple',
      modules: []
    });
  const identity = {
    appId,
    teamId: user.teamId,
    tmbId: user.tmbId,
    chatId: 'skill-session',
    sourceType: 'skillEdit',
    sourceId: appId
  };
  await MongoChat.create({
    ...identity,
    source: 'test',
    title: 'private draft',
    variables: { secret: 'draft secret' }
  });
  await MongoChatItem.create({
    ...identity,
    obj: ChatRoleEnum.AI,
    dataId: 'skill-item',
    value: [{ text: { content: 'private draft' } }]
  });
  await MongoChatItemResponse.create({
    ...identity,
    chatItemDataId: 'skill-item',
    data: { nodeId: 'skill-node', textOutput: 'private draft' }
  });
  return { user, appId };
};

describe('ordinary App endpoints exclude Skill debug sources', () => {
  it('does not expose Skill titles or status through certificate-only history endpoints', async () => {
    const { user, appId } = await fixture(false);
    const history = await Call(histories, { auth: user, body: { appId } });
    const state = await Call(status, { auth: user, body: { appId, chatIds: ['skill-session'] } });
    expect(history.code).toBe(200);
    expect(history.data.total).toBe(0);
    expect(state.data.list).toEqual([]);
  });

  it('does not initialize Skill variables through an App with the same id', async () => {
    const { user, appId } = await fixture();
    const result = await Call(init, { auth: user, query: { appId, chatId: 'skill-session' } });
    expect(result.data?.variables?.secret).toBeUndefined();
  });

  it('rejects direct record reads and writes even with App owner permissions', async () => {
    const { user, appId } = await fixture();
    const read = await Call(records, {
      auth: user,
      query: { appId, chatId: 'skill-session', dataId: 'skill-item' }
    });
    expect(read.code).not.toBe(200);
    await Call(deleteItem, {
      auth: user,
      query: { appId, chatId: 'skill-session', contentId: 'skill-item' }
    });
    await Call(deleteSession, { auth: user, query: { appId, chatId: 'skill-session' } });
    expect(await MongoChatItem.countDocuments({ deleteTime: { $type: 'date' } })).toBe(0);
    expect(await MongoChat.countDocuments({ deleteTime: { $type: 'date' } })).toBe(0);
  });

  it('preserves explicit Skill rows when App logs are batch-deleted', async () => {
    const { user, appId } = await fixture();
    await Call(batchDelete, { auth: user, body: { appId, chatIds: ['skill-session'] } });
    expect(await MongoChat.countDocuments({ sourceType: 'skillEdit' })).toBe(1);
    expect(await MongoChatItem.countDocuments({ sourceType: 'skillEdit' })).toBe(1);
    expect(await MongoChatItemResponse.countDocuments({ sourceType: 'skillEdit' })).toBe(1);
  });

  it('does not join explicitly sourced Skill children under an ordinary App parent', async () => {
    const { user, appId } = await fixture();
    await MongoChat.updateOne({}, { $unset: { sourceType: '', sourceId: '' } });
    const result = await Call(records, {
      auth: user,
      query: { appId, chatId: 'skill-session', dataId: 'skill-item' }
    });
    expect(result.code).toBe(200);
    expect(result.data).toEqual([]);
  });

  it('excludes Skill parents from App log totals and user statistics', async () => {
    const { user, appId } = await fixture();
    const body = {
      appId,
      dateStart: new Date(Date.now() - 60000).toISOString(),
      dateEnd: new Date(Date.now() + 60000).toISOString()
    };
    const result = await Call(logs, { auth: user, body });
    const users = await Call(logUsers, { auth: user, body });
    expect(result.code).toBe(200);
    expect(result.data.total).toBe(0);
    expect(users.data.list).toEqual([]);
  });

  it('excludes Skill children from App log joins and preserves their shared file prefix', async () => {
    const { user, appId } = await fixture();
    await MongoChat.updateOne({}, { $unset: { sourceType: '', sourceId: '' } });
    await MongoChatItemResponse.updateOne({}, { $set: { 'data.totalPoints': 123 } });
    const result = await Call(logs, {
      auth: user,
      cookies: { NEXT_LOCALE: 'zh-CN' },
      body: {
        appId,
        dateStart: new Date(Date.now() - 60000).toISOString(),
        dateEnd: new Date(Date.now() + 60000).toISOString()
      }
    });
    expect(result.code, String(result.error)).toBe(200);
    expect(result.data.total).toBe(1);
    expect(result.data.list[0]).toMatchObject({ messageCount: 0, totalPoints: 0 });
    await Call(batchDelete, { auth: user, body: { appId, chatIds: ['skill-session'] } });
    expect(deletePrefix).not.toHaveBeenCalled();
    expect(await MongoChatItem.countDocuments({ sourceType: 'skillEdit' })).toBe(1);
  });

  it('does not rename Skill parent or child sessions during an outlink reset', async () => {
    const { appId } = await fixture();
    await resetChat({ appId, chatId: 'skill-session' });
    expect(await MongoChat.countDocuments({ chatId: 'skill-session' })).toBe(1);
    expect(await MongoChatItem.countDocuments({ chatId: 'skill-session' })).toBe(1);
    await MongoChat.updateMany({}, { $unset: { sourceType: '', sourceId: '' } });
    await MongoChatItem.updateMany({}, { $unset: { sourceType: '', sourceId: '' } });
    await resetChat({ appId, chatId: 'skill-session' });
    const chat = await MongoChat.findOne().lean();
    expect(chat?.chatId).not.toBe('skill-session');
    expect(await MongoChatItem.countDocuments({ chatId: chat?.chatId })).toBe(1);
  });

  it('rejects App generating upserts for an existing Skill source', async () => {
    const { user, appId } = await fixture();
    const params = {
      appId,
      chatId: 'skill-session',
      teamId: user.teamId,
      tmbId: user.tmbId,
      source: 'online'
    };
    await expect(ensureGenerateChat(params)).rejects.toThrow('Chat source conflicts');
    await expect(tryStartGenerateChat(params)).rejects.toThrow('Chat source conflicts');
    expect(await MongoChat.countDocuments()).toBe(1);
    expect((await MongoChat.findOne().lean())?.source).toBe('test');
  });

  it.each([
    ['v1 token', completionsV1, AuthUserTypeEnum.token],
    ['v1 API key', completionsV1, AuthUserTypeEnum.apikey],
    ['v2 token', completionsV2, AuthUserTypeEnum.token],
    ['v2 API key', completionsV2, AuthUserTypeEnum.apikey]
  ] as const)(
    'rejects %s completions before executing Skill history as an App',
    async (_, api, authType) => {
      const { user, appId } = await fixture();
      await Call(api, {
        auth: { ...user, authType, appId },
        headers: {},
        cookies: { NEXT_LOCALE: 'zh-CN' },
        body: {
          appId,
          chatId: 'skill-session',
          stream: false,
          messages: [{ role: 'user', content: 'continue' }]
        }
      });
      expect(jsonRes).toHaveBeenCalledWith(expect.anything(), {
        code: 500,
        error: ChatErrEnum.unAuthChat
      });
      expect(dispatchWorkFlow).not.toHaveBeenCalled();
      expect(await MongoChatItem.countDocuments()).toBe(1);
    }
  );

  it.each(['chat', 'item', 'response'] as const)(
    'retains a shared App file prefix when only explicit Skill %s ownership remains',
    async (remaining) => {
      const { user, appId } = await fixture();
      if (remaining !== 'chat') await MongoChat.deleteMany({});
      if (remaining !== 'item') await MongoChatItem.deleteMany({});
      if (remaining !== 'response') await MongoChatItemResponse.deleteMany({});
      const app = await MongoApp.findById(appId).lean();
      if (!app) throw new Error('Expected fixture App');
      await deleteAppDataProcessor({ app, teamId: user.teamId });
      expect(deletePrefix).not.toHaveBeenCalled();
      expect(await MongoChat.countDocuments()).toBe(remaining === 'chat' ? 1 : 0);
      expect(await MongoChatItem.countDocuments()).toBe(remaining === 'item' ? 1 : 0);
      expect(await MongoChatItemResponse.countDocuments()).toBe(remaining === 'response' ? 1 : 0);
      expect(await MongoApp.exists({ _id: appId })).toBeNull();
    }
  );

  it('still deletes App-only rows and their unambiguous file prefix', async () => {
    const { user, appId } = await fixture();
    await MongoChat.updateMany({}, { $unset: { sourceType: '', sourceId: '' } });
    await MongoChatItem.updateMany({}, { $unset: { sourceType: '', sourceId: '' } });
    await MongoChatItemResponse.updateMany({}, { $unset: { sourceType: '', sourceId: '' } });
    const app = await MongoApp.findById(appId).lean();
    if (!app) throw new Error('Expected fixture App');
    await deleteAppDataProcessor({ app, teamId: user.teamId });
    expect(deletePrefix).toHaveBeenCalledWith({ appId });
    expect(await MongoChat.countDocuments()).toBe(0);
    expect(await MongoChatItem.countDocuments()).toBe(0);
    expect(await MongoChatItemResponse.countDocuments()).toBe(0);
  });
});
