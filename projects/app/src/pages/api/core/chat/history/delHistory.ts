import { getChatSourceFilter } from '@fastgpt/service/core/chat/source';
import type { NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { DelChatHistorySchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { deleteSandboxesByChatIds } from '@fastgpt/service/core/ai/sandbox/controller';

/* delete single chat history (soft delete) */
export async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const { appId, chatId } = DelChatHistorySchema.parse(req.query);

  const { chat, uid } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    ...req.query
  });

  if (!chat) return;

  await deleteSandboxesByChatIds({ appId, chatIds: [chatId], runtimeUserId: uid });
  await MongoChat.updateOne(
    { ...getChatSourceFilter(), _id: chat._id },
    {
      $set: {
        deleteTime: new Date()
      }
    }
  );

  return;
}

export default NextAPI(handler);
