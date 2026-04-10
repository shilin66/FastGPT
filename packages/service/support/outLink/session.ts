import { MongoChat } from '../../core/chat/chatSchema';
import { getRedisCache, setRedisCache } from '../../common/redis/cache';

export const OUTLINK_CHAT_SESSION_EXPIRE = 60 * 60 * 24 * 30;

const getOutLinkChatSessionKey = ({
  channel,
  shareId,
  outLinkUid
}: {
  channel: string;
  shareId: string;
  outLinkUid: string;
}) => `publish:${channel}:chat:${shareId}:${outLinkUid}`;

export const getOrCreateOutLinkChatId = async ({
  channel,
  appId,
  shareId,
  outLinkUid,
  reset,
  createChatId
}: {
  channel: string;
  appId: string;
  shareId: string;
  outLinkUid: string;
  reset?: boolean;
  createChatId: () => string;
}) => {
  const sessionKey = getOutLinkChatSessionKey({
    channel,
    shareId,
    outLinkUid
  });

  if (reset) {
    const newChatId = createChatId();
    await setRedisCache(sessionKey, newChatId, OUTLINK_CHAT_SESSION_EXPIRE);
    return newChatId;
  }

  const currentChatId = await getRedisCache(sessionKey);
  if (currentChatId) {
    return currentChatId;
  }

  const latestChat = await MongoChat.findOne(
    {
      appId,
      shareId,
      outLinkUid
    },
    'chatId'
  )
    .sort({ updateTime: -1 })
    .lean();

  if (latestChat?.chatId) {
    await setRedisCache(sessionKey, latestChat.chatId, OUTLINK_CHAT_SESSION_EXPIRE);
    return latestChat.chatId;
  }

  const newChatId = createChatId();
  await setRedisCache(sessionKey, newChatId, OUTLINK_CHAT_SESSION_EXPIRE);

  return newChatId;
};
