import crypto from 'crypto';
import * as lark from '@larksuiteoapi/node-sdk';
import type { FeishuAppType } from '@fastgpt/global/support/outLink/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type {
  FeishuCallbackPayload,
  FeishuChatContext,
  FeishuMessage,
  FeishuMessageTextContent
} from './type';
import { getOrCreateOutLinkChatId } from '../session';

const resetCommand = /^reset$/i;
const mentionPattern = /@_user_\d+\s*/g;

export const parseFeishuPayload = (body: any): FeishuCallbackPayload | undefined => {
  if (!body) return;

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return;
    }
  }

  if (typeof body === 'object') {
    return body;
  }
};

export const verifyFeishuSignature = ({
  body,
  encryptKey,
  timestamp,
  nonce,
  signature
}: {
  body: string;
  encryptKey?: string;
  timestamp?: string;
  nonce?: string;
  signature?: string;
}) => {
  if (!encryptKey || !timestamp || !nonce || !signature) return true;

  const sign = crypto
    .createHash('sha256')
    .update(`${timestamp}${nonce}${encryptKey}${body}`)
    .digest('hex');

  return sign === signature;
};

export const decryptFeishuEncryptPayload = ({
  encrypt,
  encryptKey
}: {
  encrypt: string;
  encryptKey: string;
}): FeishuCallbackPayload => JSON.parse(new lark.AESCipher(encryptKey).decrypt(encrypt));

export const getFeishuMessageText = (message?: FeishuMessage) => {
  if (!message?.content) return '';
  if (message.message_type !== 'text') return '';

  try {
    const content = JSON.parse(message.content) as FeishuMessageTextContent;
    return content.text?.trim() || '';
  } catch {
    return '';
  }
};

export const normalizeFeishuQuestion = (text: string) =>
  text
    .replace(mentionPattern, '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .join('\n')
    .trim();

export const isFeishuResetCommand = (text: string) => resetCommand.test(text.trim());

export const createFeishuOutLinkUid = ({
  userName,
  shareId
}: {
  userName?: string;
  shareId: string;
}) => `feishu-${userName}-${shareId}`;

const createFeishuChatId = () => `feishu-${Date.now()}-${getNanoid(12)}`;

const buildFeishuBaseChatId = ({
  shareId,
  message,
  userName,
  senderOpenId,
  senderUserId
}: {
  shareId: string;
  message: FeishuMessage;
  userName?: string;
  senderOpenId?: string;
  senderUserId?: string;
}): FeishuChatContext => {
  const chatId = message.chat_id || 'unknown';
  const threadId = message.root_id || message.thread_id || message.parent_id;
  const userId = senderOpenId || senderUserId || 'unknown';

  if (message.chat_type === 'p2p') {
    return {
      outLinkUid: createFeishuOutLinkUid({ userName, shareId }),
      chatId: `feishu-p2p-${chatId}`
    };
  }

  if (threadId) {
    return {
      outLinkUid: createFeishuOutLinkUid({ userName, shareId }),
      chatId: `feishu-thread-${chatId}-${threadId}`
    };
  }

  return {
    outLinkUid: createFeishuOutLinkUid({ userName, shareId }),
    chatId: `feishu-group-${chatId}-${userId}`
  };
};

export const getFeishuChatContext = async ({
  appId,
  shareId,
  message,
  userName,
  senderOpenId,
  senderUserId,
  reset
}: {
  appId: string;
  shareId: string;
  message: FeishuMessage;
  userName?: string;
  senderOpenId?: string;
  senderUserId?: string;
  reset?: boolean;
}): Promise<FeishuChatContext> => {
  const context = buildFeishuBaseChatId({
    shareId,
    message,
    userName,
    senderOpenId,
    senderUserId
  });

  return {
    outLinkUid: context.outLinkUid,
    chatId: await getOrCreateOutLinkChatId({
      channel: 'feishu',
      appId,
      shareId,
      outLinkUid: context.outLinkUid,
      reset,
      createChatId: createFeishuChatId
    })
  };
};

export const getFeishuReplyText = ({
  answer,
  defaultResponse
}: {
  answer?: string;
  defaultResponse?: string;
}) => {
  const text = answer?.trim() || defaultResponse?.trim() || '';
  if (!text) return '';

  return text.slice(0, 4000);
};

export const parseFeishuIncomingPayload = ({
  body,
  rawBody,
  appConfig,
  timestamp,
  nonce,
  signature
}: {
  body: any;
  rawBody: string;
  appConfig: FeishuAppType;
  timestamp?: string;
  nonce?: string;
  signature?: string;
}) => {
  if (
    !verifyFeishuSignature({
      body: rawBody,
      encryptKey: appConfig.encryptKey,
      timestamp,
      nonce,
      signature
    })
  ) {
    throw new Error('Invalid feishu signature');
  }

  const payload = parseFeishuPayload(body);
  if (!payload) return;

  if (payload.encrypt && appConfig.encryptKey) {
    return decryptFeishuEncryptPayload({
      encrypt: payload.encrypt,
      encryptKey: appConfig.encryptKey
    });
  }

  return payload;
};
