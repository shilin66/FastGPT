import type { FeishuAppType } from '@fastgpt/global/support/outLink/type';
import { randomUUID } from 'node:crypto';
import { getFeishuClient } from './sdk';

const FEISHU_STREAM_ELEMENT_ID = 'markdown_1';
const FEISHU_STREAM_UPDATE_INTERVAL_MS = 100;
const FEISHU_STREAM_LOADING_TEXT = '🤔 生成中...';

type FeishuReceiveIdType = 'chat_id' | 'open_id' | 'user_id' | 'union_id' | 'email';

export type FeishuMarkdownStreamFinishResult = {
  readonly contentUpdated: boolean;
  readonly streamingClosed: boolean;
  readonly contentError?: Error;
  readonly closeError?: Error;
};

export type FeishuMarkdownStream = {
  append: (text: string) => Promise<void>;
  finish: (markdown: string) => Promise<FeishuMarkdownStreamFinishResult>;
};

class FeishuApiError extends Error {
  constructor(operation: string, code?: number, apiMessage?: string) {
    super(
      `${operation} failed${code === undefined ? '' : ` (${code})`}: ${apiMessage || 'unknown error'}`
    );
    this.name = 'FeishuApiError';
  }
}

export const createFeishuMarkdownStream = async ({
  appConfig,
  receiveId,
  receiveIdType = 'chat_id',
  replyToMessageId,
  senderMention
}: {
  appConfig: FeishuAppType;
  receiveId: string;
  receiveIdType?: FeishuReceiveIdType;
  replyToMessageId?: string;
  senderMention?: string;
}): Promise<FeishuMarkdownStream> => {
  const client = getFeishuClient(appConfig);
  const createResult = await client.cardkit.v1.card.create({
    data: {
      type: 'card_json',
      data: JSON.stringify({
        schema: '2.0',
        config: {
          streaming_mode: true,
          streaming_config: {
            print_frequency_ms: { default: 70, android: 70, ios: 70, pc: 70 },
            print_step: { default: 1, android: 1, ios: 1, pc: 1 },
            print_strategy: 'fast'
          }
        },
        body: {
          elements: [
            ...(senderMention ? [{ tag: 'markdown', content: senderMention }] : []),
            {
              tag: 'markdown',
              element_id: FEISHU_STREAM_ELEMENT_ID,
              content: FEISHU_STREAM_LOADING_TEXT
            }
          ]
        }
      })
    }
  });

  if (createResult.code !== 0 || !createResult.data?.card_id) {
    throw new FeishuApiError('Create feishu streaming card', createResult.code, createResult.msg);
  }

  const cardId = createResult.data.card_id;
  const content = JSON.stringify({ type: 'card', data: { card_id: cardId } });
  const sendResult = replyToMessageId
    ? await client.im.message.reply({
        path: { message_id: replyToMessageId },
        data: { msg_type: 'interactive', content }
      })
    : await client.im.message.create({
        params: { receive_id_type: receiveIdType },
        data: { receive_id: receiveId, msg_type: 'interactive', content }
      });

  if (sendResult.code !== 0) {
    throw new FeishuApiError('Send feishu streaming card', sendResult.code, sendResult.msg);
  }

  let accumulatedMarkdown = '';
  let lastSentMarkdown = FEISHU_STREAM_LOADING_TEXT;
  let lastOperationAt = Number.NEGATIVE_INFINITY;
  let sequence = 0;
  let operationQueue: Promise<void> = Promise.resolve();

  const nextSequence = () => {
    sequence += 1;
    return sequence;
  };

  const waitForOperationSlot = async () => {
    const waitMs = lastOperationAt + FEISHU_STREAM_UPDATE_INTERVAL_MS - Date.now();
    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }
    lastOperationAt = Date.now();
  };

  const updateContent = async (force: boolean) => {
    if (accumulatedMarkdown === lastSentMarkdown) return;

    if (!force && Date.now() - lastOperationAt < FEISHU_STREAM_UPDATE_INTERVAL_MS) return;
    await waitForOperationSlot();

    const content = accumulatedMarkdown;
    const result = await client.cardkit.v1.cardElement.content({
      path: {
        card_id: cardId,
        element_id: FEISHU_STREAM_ELEMENT_ID
      },
      data: {
        content,
        sequence: nextSequence(),
        uuid: randomUUID()
      }
    });

    if (result.code !== 0) {
      throw new FeishuApiError('Update feishu streaming card', result.code, result.msg);
    }
    lastSentMarkdown = content;
  };

  const closeStreaming = async () => {
    await waitForOperationSlot();
    const result = await client.cardkit.v1.card.settings({
      path: { card_id: cardId },
      data: {
        settings: JSON.stringify({ config: { streaming_mode: false } }),
        sequence: nextSequence(),
        uuid: randomUUID()
      }
    });

    if (result.code !== 0) {
      throw new FeishuApiError('Close feishu streaming card', result.code, result.msg);
    }
  };

  const enqueue = <T>(operation: () => Promise<T>) => {
    const result = operationQueue.then(operation);
    operationQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };

  return {
    append: (text: string) => {
      accumulatedMarkdown += text;
      return enqueue(() => updateContent(false));
    },
    finish: (markdown: string) => {
      accumulatedMarkdown = markdown;
      return enqueue(async () => {
        let contentError: Error | undefined;
        let closeError: Error | undefined;

        try {
          await updateContent(true);
        } catch (error) {
          contentError = error instanceof Error ? error : new Error(String(error));
        }

        try {
          await closeStreaming();
        } catch (error) {
          closeError = error instanceof Error ? error : new Error(String(error));
        }

        return {
          contentUpdated: !contentError,
          streamingClosed: !closeError,
          ...(contentError ? { contentError } : {}),
          ...(closeError ? { closeError } : {})
        };
      });
    }
  };
};
