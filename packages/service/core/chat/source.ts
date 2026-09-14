import type { ChatSourceScope } from '@fastgpt/global/core/chat/type';
import type { ClientSession } from '../../common/mongo';
import { MongoChat } from './chatSchema';
import { UserError } from '@fastgpt/global/common/error/utils';

export const getChatSourceFilter = (scope?: ChatSourceScope) =>
  scope ?? { sourceType: { $ne: 'skillEdit' } };

export const assertChatSourceSession = async (
  { appId, chatId, sourceScope }: { appId: string; chatId: string; sourceScope?: ChatSourceScope },
  session?: ClientSession
) => {
  const chat = await MongoChat.findOne({ appId, chatId })
    .select('teamId sourceType sourceId +deleteTime')
    .session(session ?? null)
    .lean();
  if (!chat) return;
  const matches = sourceScope
    ? String(chat.teamId) === sourceScope.teamId &&
      chat.sourceType === sourceScope.sourceType &&
      String(chat.sourceId) === sourceScope.sourceId &&
      !chat.deleteTime
    : chat.sourceType === undefined || chat.sourceType === 'appRuntime';
  if (!matches) throw new UserError('Chat source conflicts with the requested session');
};
