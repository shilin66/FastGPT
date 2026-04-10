import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import {
  createDingtalkOutLinkUid,
  getDingtalkChatContext,
  getDingtalkMessageText,
  getDingtalkReplyText,
  isDingtalkResetCommand,
  normalizeDingtalkQuestion,
  parseDingtalkMessage
} from '@fastgpt/service/support/outLink/dingtalk/utils';
import { sendDingtalkTextBySessionWebhook } from '@fastgpt/service/support/outLink/dingtalk/client';
import { axios } from '@fastgpt/service/common/api/axios';
import { SERVICE_LOCAL_HOST } from '@fastgpt/service/common/system/tools';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.MODULE.OUTLINK.DINGTALK);

export type OutLinkDingtalkQuery = any;
export type OutLinkDingtalkBody = any;
export type OutLinkFeishuResponse = {};

async function handler(
  req: ApiRequestProps<OutLinkDingtalkBody, OutLinkDingtalkQuery>,
  res: ApiResponseType<any>
): Promise<any> {
  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  if (req.method === 'GET') {
    return {
      success: true
    };
  }

  const outLink = await MongoOutLink.findOne({
    shareId: token,
    type: PublishChannelEnum.dingtalk
  });
  if (!outLink) {
    return Promise.reject(CommonErrEnum.invalidParams);
  }

  const message = parseDingtalkMessage(req.body);
  if (!message?.sessionWebhook) {
    logger.warn('Ignore invalid dingtalk callback payload', {
      shareId: token,
      body: req.body
    });
    return {
      success: true
    };
  }

  const rawQuestion = getDingtalkMessageText(message);
  const question = normalizeDingtalkQuestion(rawQuestion);

  if (!question) {
    const reply = getDingtalkReplyText({
      answer: '暂不支持处理该类型消息，请发送文本、语音或带文字的富文本消息。',
      defaultResponse: outLink.defaultResponse
    });
    if (reply) {
      await sendDingtalkTextBySessionWebhook({
        sessionWebhook: message.sessionWebhook,
        markdown: reply
      });
    }
    return {
      success: true
    };
  }
  const outLinkUid = createDingtalkOutLinkUid({
    message,
    shareId: token
  });
  const { chatId } = await getDingtalkChatContext({
    appId: String(outLink.appId),
    shareId: token,
    outLinkUid,
    reset: isDingtalkResetCommand(question)
  });

  if (isDingtalkResetCommand(question)) {
    await sendDingtalkTextBySessionWebhook({
      sessionWebhook: message.sessionWebhook,
      markdown: '已重置上下文，请发送新问题。'
    });
    return {
      success: true
    };
  }

  if (outLink.immediateResponse?.trim()) {
    await sendDingtalkTextBySessionWebhook({
      sessionWebhook: message.sessionWebhook,
      markdown: outLink.immediateResponse.trim()
    });
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
    const reply = getDingtalkReplyText({
      answer,
      defaultResponse: outLink.defaultResponse
    });

    if (reply) {
      await sendDingtalkTextBySessionWebhook({
        sessionWebhook: message.sessionWebhook,
        markdown: reply
      });
    }
  } catch (error) {
    logger.error('Failed to process dingtalk callback', {
      shareId: token,
      appId: String(outLink.appId),
      chatId,
      error
    });

    const reply = getDingtalkReplyText({
      answer: '',
      defaultResponse: outLink.exceptionResponse || '消息处理失败，请稍后重试。'
    });

    if (reply) {
      await sendDingtalkTextBySessionWebhook({
        sessionWebhook: message.sessionWebhook,
        markdown: reply
      });
    }
  }

  return {
    success: true
  };
}

export default NextAPI(handler);
