import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { OutLinkSchemaType, WecomAppType } from '@fastgpt/global/support/outLink/type';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import {
  createWecomOutLinkUid,
  decryptWecomMessage,
  getWecomChatContext,
  getWecomMessageText,
  getWecomReplyText,
  isWecomResetCommand,
  normalizeWecomQuestion,
  parseWecomEnvelope,
  parseWecomMessage,
  verifyWecomSignature,
  verifyWecomUrl
} from '@fastgpt/service/support/outLink/wecom/utils';
import { axios } from '@fastgpt/service/common/api/axios';
import { SERVICE_LOCAL_HOST } from '@fastgpt/service/common/system/tools';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { sendWecomMarkdownByResponseUrl } from '../../../../../../../../packages/service/support/outLink/wecom/client';

export type OutLinkWecomQuery = any;
export type OutLinkWecomBody = any;
export type OutLinkWecomResponse = {};

const logger = getLogger(LogCategories.MODULE.OUTLINK.WECOM);

async function handler(
  req: ApiRequestProps<OutLinkWecomBody, OutLinkWecomQuery>,
  res: ApiResponseType<any>
): Promise<any> {
  const { token, msg_signature, timestamp, nonce, echostr } = req.query;
  if (!token || typeof token !== 'string') {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const outLink = await MongoOutLink.findOne({
    shareId: token,
    type: PublishChannelEnum.wecom
  }).lean<OutLinkSchemaType<WecomAppType>>();
  if (!outLink) {
    return Promise.reject(CommonErrEnum.invalidParams);
  }

  const appConfig = outLink.app;
  if (!appConfig?.CallbackToken || !appConfig?.CallbackEncodingAesKey) {
    return Promise.reject(CommonErrEnum.invalidParams);
  }

  if (req.method === 'GET') {
    if (
      typeof msg_signature !== 'string' ||
      typeof timestamp !== 'string' ||
      typeof nonce !== 'string' ||
      typeof echostr !== 'string'
    ) {
      return Promise.reject(CommonErrEnum.missingParams);
    }

    const plainEcho = verifyWecomUrl({
      token: appConfig.CallbackToken,
      encodingAesKey: appConfig.CallbackEncodingAesKey,
      msgSignature: msg_signature,
      timestamp,
      nonce,
      echostr
    });

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(plainEcho);
    return;
  }

  const rawBody = await readRawBody(req);
  const envelope = parseWecomEnvelope(rawBody);
  if (
    !envelope?.encrypt ||
    typeof msg_signature !== 'string' ||
    typeof timestamp !== 'string' ||
    typeof nonce !== 'string'
  ) {
    logger.warn('Ignore invalid wecom callback payload', {
      shareId: token,
      body: rawBody
    });
    res.status(200).send('success');
    return;
  }

  if (
    !verifyWecomSignature({
      token: appConfig.CallbackToken,
      timestamp,
      nonce,
      encrypt: envelope.encrypt,
      signature: msg_signature
    })
  ) {
    throw new Error('Invalid wecom signature');
  }

  const plainMessage = decryptWecomMessage({
    encrypt: envelope.encrypt,
    encodingAesKey: appConfig.CallbackEncodingAesKey
  });
  const message = parseWecomMessage(plainMessage);
  if (!message?.msgtype) {
    res.status(200).send('success');
    return;
  }

  res.status(200).send('success');

  setImmediate(() => {
    void processWecomEvent({
      token,
      outLink,
      message
    });
  });
}

export default NextAPI(handler);

async function processWecomEvent({
  token,
  outLink,
  message
}: {
  token: string;
  outLink: OutLinkSchemaType<WecomAppType>;
  message: NonNullable<ReturnType<typeof parseWecomMessage>>;
}) {
  if (!message.response_url) return;
  if (!['text', 'image', 'mixed', 'event'].includes(message.msgtype || '')) return;

  const question = normalizeWecomQuestion(getWecomMessageText(message));
  const outLinkUid = createWecomOutLinkUid(message);
  const { chatId } = await getWecomChatContext({
    appId: String(outLink.appId),
    shareId: token,
    outLinkUid,
    reset: isWecomResetCommand(question)
  });

  const reply = await getReply({
    outLink,
    token,
    question,
    chatId,
    outLinkUid,
    messageType: message.msgtype
  });

  if (!reply) return;

  await sendWecomMarkdownByResponseUrl({
    responseUrl: message.response_url,
    markdown: reply
  });
}

async function getReply({
  outLink,
  token,
  question,
  chatId,
  outLinkUid,
  messageType
}: {
  outLink: OutLinkSchemaType<WecomAppType>;
  token: string;
  question: string;
  chatId: string;
  outLinkUid: string;
  messageType?: string;
}) {
  if (messageType !== 'text') {
    return (
      getWecomReplyText({
        answer: '',
        defaultResponse: outLink.defaultResponse || '暂不支持处理该类型消息，请发送文本消息。'
      }) || '暂不支持处理该类型消息，请发送文本消息。'
    );
  }

  if (!question) {
    return (
      getWecomReplyText({
        answer: '',
        defaultResponse: outLink.defaultResponse || '请发送文本消息。'
      }) || '请发送文本消息。'
    );
  }

  if (isWecomResetCommand(question)) {
    return '已重置上下文，请发送新问题。';
  }

  try {
    const result = await axios.post(`http://${SERVICE_LOCAL_HOST}/api/v1/chat/completions`, {
      appId: String(outLink.appId),
      chatId,
      shareId: token,
      outLinkUid,
      stream: false,
      detail: false,
      messages: [
        {
          role: 'user',
          content: question
        }
      ],
      variables: {}
    });

    return (
      getWecomReplyText({
        answer: result.data?.choices?.[0]?.message?.content,
        defaultResponse: outLink.defaultResponse
      }) || '消息处理失败，请稍后重试。'
    );
  } catch (error) {
    logger.error('Failed to process wecom callback', {
      shareId: token,
      appId: String(outLink.appId),
      chatId,
      error
    });

    return (
      getWecomReplyText({
        answer: '',
        defaultResponse: outLink.exceptionResponse || '消息处理失败，请稍后重试。'
      }) || '消息处理失败，请稍后重试。'
    );
  }
}

async function readRawBody(req: ApiRequestProps) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

export const config = {
  api: {
    bodyParser: false
  }
};
