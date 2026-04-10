import crypto from 'crypto';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { WecomChatContext, WecomRobotEnvelope, WecomRobotMessage } from './type';
import { getOrCreateOutLinkChatId } from '../session';

const resetCommand = /^reset$/i;
const pkcs7BlockSize = 32;

const sha1 = (content: string) => crypto.createHash('sha1').update(content).digest('hex');

const getWecomAesKey = (encodingAesKey: string) => Buffer.from(`${encodingAesKey}=`, 'base64');

const getWecomSignature = ({
  token,
  timestamp,
  nonce,
  encrypt
}: {
  token: string;
  timestamp: string;
  nonce: string;
  encrypt: string;
}) => sha1([token, timestamp, nonce, encrypt].sort().join(''));

const pkcs7Decode = (buffer: Buffer) => {
  const pad = buffer[buffer.length - 1];
  if (pad < 1 || pad > pkcs7BlockSize) return buffer;
  return buffer.subarray(0, buffer.length - pad);
};

export const parseWecomEnvelope = (body: string): WecomRobotEnvelope | undefined => {
  if (!body.trim()) return;

  try {
    return JSON.parse(body) as WecomRobotEnvelope;
  } catch {
    return;
  }
};

export const parseWecomMessage = (message: string): WecomRobotMessage | undefined => {
  if (!message.trim()) return;

  try {
    return JSON.parse(message) as WecomRobotMessage;
  } catch {
    return;
  }
};

export const verifyWecomSignature = ({
  token,
  timestamp,
  nonce,
  encrypt,
  signature
}: {
  token: string;
  timestamp: string;
  nonce: string;
  encrypt: string;
  signature?: string;
}) => {
  if (!signature) return false;
  return getWecomSignature({ token, timestamp, nonce, encrypt }) === signature;
};

export const decryptWecomMessage = ({
  encrypt,
  encodingAesKey,
  receiveId = ''
}: {
  encrypt: string;
  encodingAesKey: string;
  receiveId?: string;
}) => {
  const aesKey = getWecomAesKey(encodingAesKey);
  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, aesKey.subarray(0, 16));
  decipher.setAutoPadding(false);

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypt, 'base64')),
    decipher.final()
  ]);
  const decoded = pkcs7Decode(decrypted);
  const messageLength = decoded.subarray(16, 20).readUInt32BE(0);
  const message = decoded.subarray(20, 20 + messageLength).toString('utf8');
  const fromReceiveId = decoded.subarray(20 + messageLength).toString('utf8');

  if (fromReceiveId !== receiveId) {
    throw new Error('Wecom receiveId mismatch');
  }

  return message;
};

export const verifyWecomUrl = ({
  token,
  encodingAesKey,
  msgSignature,
  timestamp,
  nonce,
  echostr
}: {
  token: string;
  encodingAesKey: string;
  msgSignature: string;
  timestamp: string;
  nonce: string;
  echostr: string;
}) => {
  if (
    !verifyWecomSignature({
      token,
      timestamp,
      nonce,
      encrypt: echostr,
      signature: msgSignature
    })
  ) {
    throw new Error('Invalid wecom signature');
  }

  return decryptWecomMessage({
    encrypt: echostr,
    encodingAesKey
  });
};

export const getWecomMessageText = (message: WecomRobotMessage) => {
  switch (message.msgtype) {
    case 'text':
      return message.text?.content?.trim() || '';
    default:
      return '';
  }
};

export const normalizeWecomQuestion = (text: string) => text.trim();

export const isWecomResetCommand = (text: string) => resetCommand.test(text.trim());

export const createWecomOutLinkUid = (message: WecomRobotMessage) => {
  const userId = message.from?.userid || 'unknown';
  const chatId = message.chatid || 'single';

  return `${userId}::${chatId}`;
};

const createWecomChatId = () => `wecom-${Date.now()}-${getNanoid(12)}`;

export const getWecomChatContext = async ({
  appId,
  shareId,
  outLinkUid,
  reset
}: {
  appId: string;
  shareId: string;
  outLinkUid: string;
  reset?: boolean;
}): Promise<WecomChatContext> => ({
  outLinkUid,
  chatId: await getOrCreateOutLinkChatId({
    channel: 'wecom',
    appId,
    shareId,
    outLinkUid,
    reset,
    createChatId: createWecomChatId
  })
});

export const getWecomReplyText = ({
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
