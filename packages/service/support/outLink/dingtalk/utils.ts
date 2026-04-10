import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { DingtalkMessage, DingtalkChatContext } from './type';
import { getOrCreateOutLinkChatId } from '../session';

const resetCommand = /^reset$/i;
const mentionPrefixPattern = /^@\S+\s*/;

export const parseDingtalkMessage = (body: any): DingtalkMessage | undefined => {
  console.log('parseDingtalkMessage>>>>>>>>>>>>>>>>>>>>>>>>', body);
  if (!body) return;

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return;
    }
  }

  if (typeof body.data === 'string') {
    try {
      return JSON.parse(body.data);
    } catch {
      return;
    }
  }

  if (body.data && typeof body.data === 'object') {
    return body.data;
  }

  if (body.msgtype || body.sessionWebhook || body.msgId) {
    return body;
  }
};

export const getDingtalkMessageText = (message: DingtalkMessage): string => {
  switch (message.msgtype) {
    case 'text':
      return message.text?.content?.trim() || '';
    case 'audio':
      return message.content?.recognition?.trim() || '';
    case 'file':
      return message.content?.fileName?.trim()
        ? `[文件] ${message.content.fileName.trim()}`
        : '[文件]';
    case 'picture':
      return '[图片]';
    case 'video':
      return '[视频]';
    case 'richText':
      return (
        message.content?.richText
          ?.map((item) => item.text?.trim())
          .filter(Boolean)
          .join('\n') || ''
      );
    default:
      return message.content?.unknownMsgType?.trim() || '';
  }
};

export const normalizeDingtalkQuestion = (text: string) =>
  text
    .split('\n')
    .map((item) => item.replace(mentionPrefixPattern, '').trim())
    .filter(Boolean)
    .join('\n')
    .trim();

export const isDingtalkResetCommand = (text: string) => resetCommand.test(text.trim());

export const createDingtalkOutLinkUid = ({
  message,
  shareId
}: {
  message: DingtalkMessage;
  shareId: string;
}) => `dingtalk-${message.senderNick || message.senderStaffId || message.senderId}-${shareId}`;

const createDingtalkChatId = () => `dingtalk-${Date.now()}-${getNanoid(12)}`;

export const getDingtalkChatContext = async ({
  appId,
  shareId,
  outLinkUid,
  reset
}: {
  appId: string;
  shareId: string;
  outLinkUid: string;
  reset?: boolean;
}): Promise<DingtalkChatContext> => {
  return {
    outLinkUid,
    chatId: await getOrCreateOutLinkChatId({
      channel: 'dingtalk',
      appId,
      shareId,
      outLinkUid,
      reset,
      createChatId: createDingtalkChatId
    })
  };
};

export const getDingtalkReplyText = ({
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
