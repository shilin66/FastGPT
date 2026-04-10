import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { FeishuAppType, OutLinkSchema } from '@fastgpt/global/support/outLink/type';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
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
import { axios } from '@fastgpt/service/common/api/axios';
import { SERVICE_LOCAL_HOST } from '@fastgpt/service/common/system/tools';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { getGlobalRedisConnection } from '@fastgpt/service/common/redis';

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
  }).lean<OutLinkSchema<FeishuAppType>>();
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
      senderId
    });
  });
}

export default NextAPI(handler);

async function processFeishuEvent({
  token,
  outLink,
  appConfig,
  message,
  senderId
}: {
  token: string;
  outLink: OutLinkSchema<FeishuAppType>;
  appConfig: FeishuAppType;
  message: FeishuMessage;
  senderId?: FeishuSenderId;
}) {
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
        receiveId: message.chat_id!,
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
      receiveId: message.chat_id!,
      markdown: '已重置上下文，请发送新问题。'
    });
    return;
  }

  if (outLink.immediateResponse?.trim()) {
    await sendFeishuMarkdownMessage({
      appConfig,
      receiveId: message.chat_id!,
      markdown: outLink.immediateResponse.trim()
    });
  }

  const app = await MongoApp.findById(outLink.appId, '_id').lean();
  if (!app) {
    throw new Error(CommonErrEnum.invalidParams);
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

    const answer = result.data?.choices?.[0]?.message?.content;
    const reply = getFeishuReplyText({
      answer,
      defaultResponse: outLink.defaultResponse
    });

    if (reply) {
      await sendFeishuMarkdownMessage({
        appConfig,
        receiveId: message.chat_id!,
        markdown: reply
      });
    }
  } catch (error) {
    logger.error('Failed to process feishu callback', {
      shareId: token,
      appId: String(outLink.appId),
      chatId,
      error
    });

    const reply = getFeishuReplyText({
      answer: '',
      defaultResponse: outLink.exceptionResponse || '消息处理失败，请稍后重试。'
    });

    if (reply) {
      await sendFeishuMarkdownMessage({
        appConfig,
        receiveId: message.chat_id!,
        markdown: reply
      });
    }
  }
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
