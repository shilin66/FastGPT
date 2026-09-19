import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { FeishuAppType, OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import type { FeishuMessage, FeishuSenderId } from '@fastgpt/service/support/outLink/feishu/type';
import {
  getFeishuChatContext,
  getFeishuMessageText,
  getFeishuReplyText,
  isFeishuResetCommand,
  normalizeFeishuQuestion,
  parseFeishuIncomingPayload,
  parseFeishuPayload
} from '@fastgpt/service/support/outLink/feishu/utils';
import {
  getFeishuUserName,
  sendFeishuMarkdownMessage
} from '@fastgpt/service/support/outLink/feishu/client';
import { createFeishuMarkdownStream } from '@fastgpt/service/support/outLink/feishu/stream';
import type { FeishuMarkdownStream } from '@fastgpt/service/support/outLink/feishu/stream';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { getGlobalRedisConnection } from '@fastgpt/service/common/redis';
import { outlinkInvokeChat } from '@fastgpt/service/support/outLink/runtime/utils';

const logger = getLogger(LogCategories.MODULE.OUTLINK.FEISHU);
const FEISHU_EVENT_DEDUP_EXPIRE = 60 * 60 * 24;
const FEISHU_USERNAME_CACHE_EXPIRE = 60 * 60 * 2; // 2小时缓存

export type OutLinkFeishuQuery = any;
export type OutLinkFeishuBody = any;
export type OutLinkFeishuResponse = {};

async function handler(
  req: ApiRequestProps<OutLinkFeishuBody, OutLinkFeishuQuery>,
  res: ApiResponseType<any>
): Promise<any> {
  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    return Promise.reject(CommonErrEnum.missingParams);
  }
  const outLink = await MongoOutLink.findOne({
    shareId: token,
    type: PublishChannelEnum.feishu
  }).lean<OutLinkSchemaType<FeishuAppType>>();
  if (!outLink) {
    return Promise.reject(CommonErrEnum.invalidParams);
  }
  const appConfig = outLink.app as FeishuAppType | undefined;
  if (!appConfig?.appId || !appConfig?.appSecret) {
    return Promise.reject(CommonErrEnum.invalidParams);
  }

  // const plainPayload = parseFeishuPayload(req.body);
  // if (plainPayload?.type === 'url_verification') {
  //   res.status(200).json({
  //     challenge: plainPayload.challenge
  //   });
  //   return;
  // }

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});

  const payload = parseFeishuIncomingPayload({
    body: req.body,
    rawBody,
    appConfig,
    timestamp: req.headers['x-lark-request-timestamp'] as string | undefined,
    nonce: req.headers['x-lark-request-nonce'] as string | undefined,
    signature: req.headers['x-lark-signature'] as string | undefined
  });

  if (payload?.type === 'url_verification') {
    res.status(200).json({
      challenge: payload.challenge
    });
    return;
  }

  if (!payload) {
    res.status(200).json({});
    return;
  }

  if (payload.header?.event_type !== 'im.message.receive_v1') {
    res.status(200).json({});
    return;
  }

  if (payload.header?.event_id) {
    const isDuplicate = !(await markFeishuEventAsProcessing(payload.header.event_id));
    if (isDuplicate) {
      logger.info('Skip duplicate feishu event', {
        shareId: token,
        eventId: payload.header.event_id
      });
      res.status(200).json({});
      return;
    }
  }

  const message = payload.event?.message;
  const senderId = payload.event?.sender?.sender_id;
  if (!message?.chat_id) {
    logger.warn('Ignore invalid feishu callback payload', {
      shareId: token,
      body: req.body
    });
    res.status(200).json({});
    return;
  }

  res.status(200).json({});

  setImmediate(() => {
    void processFeishuEvent({
      token,
      outLink,
      appConfig,
      message,
      senderId,
      eventId: payload.header?.event_id
    });
  });
}

export default NextAPI(handler);

async function processFeishuEvent({
  token,
  outLink,
  appConfig,
  message,
  senderId,
  eventId
}: {
  token: string;
  outLink: OutLinkSchemaType<FeishuAppType>;
  appConfig: FeishuAppType;
  message: FeishuMessage;
  senderId?: FeishuSenderId;
  eventId?: string;
}) {
  const receiveId = message.chat_id;
  if (!receiveId) return;

  const question = normalizeFeishuQuestion(getFeishuMessageText(message));

  // 尝试从缓存获取用户名
  const userIdentity = senderId?.open_id || senderId?.user_id;
  let userName = '';

  if (userIdentity) {
    userName = await getCachedFeishuUserName({
      appConfig,
      userIdentity,
      openId: senderId?.open_id,
      userId: senderId?.user_id
    }).catch((err) => {
      logger.error('Failed to get feishu username', { userIdentity, error: err });
      return '';
    });
  }

  if (!question) {
    const reply = getFeishuReplyText({
      answer: '暂不支持处理该类型消息，请发送文本消息。',
      defaultResponse: outLink.defaultResponse
    });
    if (reply) {
      await sendFeishuMarkdownMessage({
        appConfig,
        receiveId,
        markdown: reply
      });
    }
    return;
  }

  const { chatId, outLinkUid } = await getFeishuChatContext({
    appId: String(outLink.appId),
    shareId: token,
    message,
    userName,
    senderOpenId: senderId?.open_id,
    senderUserId: senderId?.user_id,
    reset: isFeishuResetCommand(question)
  });

  if (isFeishuResetCommand(question)) {
    await sendFeishuMarkdownMessage({
      appConfig,
      receiveId,
      markdown: '已重置上下文，请发送新问题。'
    });
    return;
  }

  if (outLink.immediateResponse?.trim()) {
    await sendFeishuMarkdownMessage({
      appConfig,
      receiveId,
      markdown: outLink.immediateResponse.trim()
    });
  }

  let stream: FeishuMarkdownStream | undefined;
  try {
    stream = await createFeishuMarkdownStream({
      appConfig,
      receiveId
    });
  } catch (error) {
    logger.warn('Failed to create feishu streaming card, fallback to normal message', {
      shareId: token,
      appId: String(outLink.appId),
      chatId,
      error: error instanceof Error ? error : new Error(String(error))
    });
  }

  let streamUpdateFailed = false;
  await outlinkInvokeChat({
    outLinkConfig: outLink,
    chatId,
    query: [{ text: { content: question } }],
    messageId: message.message_id || eventId || `${receiveId}:${message.create_time || question}`,
    chatUserId: outLinkUid,
    defaultReply: outLink.defaultResponse?.trim() ?? '',
    errorReply: outLink.exceptionResponse?.trim() || '消息处理失败，请稍后重试。',
    onStreamChunk: stream
      ? async (text: string) => {
          if (streamUpdateFailed || !stream) return;

          try {
            await stream.append(text);
          } catch (error) {
            streamUpdateFailed = true;
            logger.warn('Failed to update feishu streaming card', {
              shareId: token,
              appId: String(outLink.appId),
              chatId,
              error: error instanceof Error ? error : new Error(String(error))
            });
          }
        }
      : undefined,
    onReply: async (answer: string) => {
      const reply = getFeishuReplyText({
        answer,
        defaultResponse: outLink.defaultResponse
      });

      if (!stream) {
        if (!reply) return;

        await sendFeishuMarkdownMessage({
          appConfig,
          receiveId,
          markdown: reply
        });
        return;
      }

      const finishResult = await stream.finish(reply);
      if (!finishResult.streamingClosed) {
        logger.warn('Failed to close feishu streaming card', {
          shareId: token,
          appId: String(outLink.appId),
          chatId,
          error: finishResult.closeError
        });
      }

      if (!finishResult.contentUpdated && reply) {
        logger.warn('Failed to finalize feishu streaming card, fallback to normal message', {
          shareId: token,
          appId: String(outLink.appId),
          chatId,
          error: finishResult.contentError
        });

        await sendFeishuMarkdownMessage({
          appConfig,
          receiveId,
          markdown: reply
        });
      }
    }
  });
}

async function markFeishuEventAsProcessing(eventId: string) {
  try {
    const redis = getGlobalRedisConnection();
    const result = await redis.set(
      `outlink:feishu:event:${eventId}`,
      '1',
      'EX',
      FEISHU_EVENT_DEDUP_EXPIRE,
      'NX'
    );

    return result === 'OK';
  } catch (error) {
    logger.error('Failed to deduplicate feishu event', {
      eventId,
      error
    });

    return true;
  }
}

// 获取缓存的飞书用户名
async function getCachedFeishuUserName({
  appConfig,
  userIdentity,
  openId,
  userId
}: {
  appConfig: FeishuAppType;
  userIdentity: string;
  openId?: string;
  userId?: string;
}) {
  try {
    const redis = getGlobalRedisConnection();
    const cacheKey = `outlink:feishu:username:${userIdentity}`;

    // 尝试从缓存获取
    const cachedName = await redis.get(cacheKey);
    if (cachedName) {
      return cachedName;
    }
    // 缓存未命中，调用API获取
    const userName = await getFeishuUserName({
      appConfig,
      openId,
      userId
    });

    // 存入缓存
    if (userName) {
      await redis.set(cacheKey, userName, 'EX', FEISHU_USERNAME_CACHE_EXPIRE);
    }

    return userName;
  } catch (error) {
    logger.error('Failed to get cached feishu username', {
      userIdentity,
      error
    });
    // 出错时直接获取用户名
    return getFeishuUserName({
      appConfig,
      openId,
      userId
    });
  }
}
