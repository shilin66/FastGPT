import handler from '@/pages/api/core/chat/history/delHistory';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';

const { deleteSandboxesMock } = vi.hoisted(() => ({ deleteSandboxesMock: vi.fn() }));
vi.mock('@fastgpt/service/core/ai/sandbox/controller', () => ({
  deleteSandboxesByChatIds: deleteSandboxesMock
}));

describe('delHistory api test', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  let chatId: string;

  beforeEach(async () => {
    deleteSandboxesMock.mockReset().mockResolvedValue(undefined);
    testUser = await getUser('test-user-del-history');

    // Create test app
    const app = await MongoApp.create({
      name: 'Test App',
      type: AppTypeEnum.simple,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      modules: []
    });
    appId = String(app._id);
    // Create log permission
    await MongoResourcePermission.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      resourceId: appId,
      permission: AppReadChatLogPerVal,
      resourceType: PerResourceTypeEnum.app
    });

    chatId = getNanoid();

    // Create chat
    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId,
      chatId,
      source: ChatSourceEnum.test
    });
  });

  it('should soft delete chat history successfully', async () => {
    // Verify chat exists before deletion
    const chatBefore = await MongoChat.findOne(
      {
        appId,
        chatId
      },
      {
        deleteTime: 1
      }
    ).lean();
    expect(chatBefore).toBeDefined();
    expect(chatBefore?.deleteTime).toBeNull();

    const res = await Call<any, { appId: string; chatId: string }, any>(handler, {
      auth: testUser,
      query: {
        appId,
        chatId
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that chat was soft deleted (deleteTime is set)
    const deletedChat = await MongoChat.findOne(
      {
        appId,
        chatId
      },
      { deleteTime: 1 }
    ).lean();

    expect(deletedChat).toBeDefined();
    expect(deletedChat?.deleteTime).not.toBeNull();
    expect(deleteSandboxesMock).toHaveBeenCalledExactlyOnceWith({
      appId,
      chatIds: [chatId],
      runtimeUserId: testUser.tmbId
    });
  });

  it('keeps the chat visible when sandbox cleanup fails so deletion can be retried', async () => {
    deleteSandboxesMock.mockRejectedValueOnce(new Error('sandbox cleanup failed'));

    const failed = await Call(handler, { auth: testUser, query: { appId, chatId } });
    expect(failed.code).toBe(500);
    expect(
      (await MongoChat.findOne({ appId, chatId }, { deleteTime: 1 }).lean())?.deleteTime
    ).toBeNull();

    const retried = await Call(handler, { auth: testUser, query: { appId, chatId } });
    expect(retried.code).toBe(200);
    expect(
      (await MongoChat.findOne({ appId, chatId }, { deleteTime: 1 }).lean())?.deleteTime
    ).toBeInstanceOf(Date);
    expect(deleteSandboxesMock).toHaveBeenCalledTimes(2);
  });

  it('cleans the published portal chat sandbox under the outlink user', async () => {
    const shareId = getNanoid();
    const outLinkUid = getNanoid();
    const portalChatId = getNanoid();
    await MongoOutLink.create({
      appId,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      name: 'Portal',
      shareId,
      type: 'share'
    });
    await MongoChat.create({
      appId,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      chatId: portalChatId,
      outLinkUid,
      source: ChatSourceEnum.online
    });

    const res = await Call(handler, {
      query: { appId, chatId: portalChatId, shareId, outLinkUid }
    });

    expect(res.code).toBe(200);
    expect(deleteSandboxesMock).toHaveBeenCalledExactlyOnceWith({
      appId,
      chatIds: [portalChatId],
      runtimeUserId: outLinkUid
    });
    expect(
      (await MongoChat.findOne({ appId, chatId: portalChatId }, { deleteTime: 1 }).lean())
        ?.deleteTime
    ).toBeInstanceOf(Date);
  });

  it('should fail when chatId is missing', async () => {
    const res = await Call<any, { appId: string; chatId?: string }, any>(handler, {
      auth: testUser,
      query: {
        appId
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should fail when appId is missing', async () => {
    const res = await Call<any, { appId?: string; chatId: string }, any>(handler, {
      auth: testUser,
      query: {
        chatId
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should fail when user does not have permission', async () => {
    const unauthorizedUser = await getUser('unauthorized-user-del-history');

    const res = await Call<any, { appId: string; chatId: string }, any>(handler, {
      auth: unauthorizedUser,
      query: {
        appId,
        chatId
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should succeed even if chat does not exist', async () => {
    const nonExistentChatId = getNanoid();

    const res = await Call<any, { appId: string; chatId: string }, any>(handler, {
      auth: testUser,
      query: {
        appId,
        chatId: nonExistentChatId
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();
    expect(deleteSandboxesMock).not.toHaveBeenCalled();
  });
});
