import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cardCreate: vi.fn(),
  cardSettings: vi.fn(),
  cardElementContent: vi.fn(),
  messageCreate: vi.fn()
}));

vi.mock('@larksuiteoapi/node-sdk', () => ({
  AppType: { SelfBuild: 'SelfBuild' },
  Domain: { Feishu: 'Feishu' },
  Client: vi.fn(function Client() {
    return {
      cardkit: {
        v1: {
          card: {
            create: mocks.cardCreate,
            settings: mocks.cardSettings
          },
          cardElement: {
            content: mocks.cardElementContent
          }
        }
      },
      im: {
        message: {
          create: mocks.messageCreate
        }
      }
    };
  })
}));

import { createFeishuMarkdownStream } from '@fastgpt/service/support/outLink/feishu/stream';

const appConfig = {
  appId: 'app-id',
  appSecret: 'app-secret'
};

describe('createFeishuMarkdownStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T00:00:00.000Z'));

    mocks.cardCreate.mockResolvedValue({ code: 0, data: { card_id: 'card-id' } });
    mocks.messageCreate.mockResolvedValue({ code: 0 });
    mocks.cardElementContent.mockResolvedValue({ code: 0 });
    mocks.cardSettings.mockResolvedValue({ code: 0 });
  });

  it('创建流式卡片并以完整累计内容按每秒最多 10 次更新', async () => {
    const stream = await createFeishuMarkdownStream({
      appConfig,
      receiveId: 'chat-id'
    });

    const cardCreateRequest = mocks.cardCreate.mock.calls[0]?.[0];
    const card = JSON.parse(cardCreateRequest.data.data);
    expect(card).toMatchObject({
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
          {
            tag: 'markdown',
            element_id: 'markdown_1',
            content: '🤔 生成中...'
          }
        ]
      }
    });

    const messageRequest = mocks.messageCreate.mock.calls[0]?.[0];
    expect(messageRequest).toMatchObject({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: 'chat-id',
        msg_type: 'interactive'
      }
    });
    expect(JSON.parse(messageRequest.data.content)).toEqual({
      type: 'card',
      data: { card_id: 'card-id' }
    });

    await stream.append('你');
    vi.advanceTimersByTime(50);
    await stream.append('好');
    vi.advanceTimersByTime(50);
    await stream.append('！');

    expect(mocks.cardElementContent).toHaveBeenCalledTimes(2);
    expect(mocks.cardElementContent.mock.calls[0]?.[0]).toMatchObject({
      path: { card_id: 'card-id', element_id: 'markdown_1' },
      data: { content: '你', sequence: 1 }
    });
    expect(mocks.cardElementContent.mock.calls[1]?.[0]).toMatchObject({
      path: { card_id: 'card-id', element_id: 'markdown_1' },
      data: { content: '你好！', sequence: 2 }
    });

    const finishPromise = stream.finish('你好！');
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.cardSettings).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    const result = await finishPromise;

    expect(result).toEqual({ contentUpdated: true, streamingClosed: true });
    expect(mocks.cardElementContent).toHaveBeenCalledTimes(2);
    expect(mocks.cardSettings.mock.calls[0]?.[0]).toMatchObject({
      path: { card_id: 'card-id' },
      data: {
        settings: JSON.stringify({ config: { streaming_mode: false } }),
        sequence: 3
      }
    });
  });

  it('最终内容更新失败时仍关闭流式模式并返回兜底信号', async () => {
    mocks.cardElementContent.mockRejectedValueOnce(new Error('update failed'));

    const stream = await createFeishuMarkdownStream({
      appConfig,
      receiveId: 'chat-id'
    });
    const finishPromise = stream.finish('完整回答');
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.cardSettings).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    const result = await finishPromise;

    expect(result.contentUpdated).toBe(false);
    expect(result.streamingClosed).toBe(true);
    expect(result.contentError).toEqual(new Error('update failed'));
    expect(mocks.cardSettings).toHaveBeenCalledOnce();
  });
});
