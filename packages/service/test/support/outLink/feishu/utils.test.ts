import { describe, expect, it } from 'vitest';
import {
  getFeishuReplyText,
  getFeishuSenderMention,
  isFeishuMentionAllMessage
} from '@fastgpt/service/support/outLink/feishu/utils';

describe('isFeishuMentionAllMessage', () => {
  it('忽略群聊中带 @_all 标记的消息', () => {
    const message = {
      chat_type: 'group' as const,
      message_type: 'text',
      content: JSON.stringify({ text: '@_all 请看通知' }),
      mentions: [{ key: '@_all', name: '所有人', id: { open_id: '' } }]
    };

    expect(isFeishuMentionAllMessage(message)).toBe(true);
  });

  it('当 mentions 缺失时仍识别群聊文本中的 @_all', () => {
    expect(
      isFeishuMentionAllMessage({
        chat_type: 'group',
        message_type: 'text',
        content: JSON.stringify({ text: '@_all 通知' })
      })
    ).toBe(true);
  });

  it('识别富文本内容节点中的 @所有人', () => {
    expect(
      isFeishuMentionAllMessage({
        chat_type: 'group',
        message_type: 'post',
        mentions: [],
        content: JSON.stringify({
          zh_cn: {
            content: [[{ tag: 'at', user_id: 'all', user_name: '所有人' }]]
          }
        })
      })
    ).toBe(true);
  });

  it('保留普通群聊 @机器人、单聊和仅包含字面“@所有人”的消息', () => {
    expect(
      isFeishuMentionAllMessage({
        chat_type: 'group',
        message_type: 'text',
        content: JSON.stringify({ text: '@_user_1 帮我看看' }),
        mentions: [{ key: '@_user_1', id: { open_id: 'ou_bot' } }]
      })
    ).toBe(false);
    expect(
      isFeishuMentionAllMessage({
        chat_type: 'p2p',
        message_type: 'text',
        content: JSON.stringify({ text: '@_all' })
      })
    ).toBe(false);
    expect(
      isFeishuMentionAllMessage({
        chat_type: 'group',
        message_type: 'text',
        content: JSON.stringify({ text: '文档里写了 @所有人' })
      })
    ).toBe(false);
  });
});

describe('getFeishuSenderMention', () => {
  it('生成安全的飞书用户 mention', () => {
    expect(getFeishuSenderMention({ openId: 'ou_sender', name: '张<三>&' })).toBe(
      '<at id=ou_sender>张&lt;三&gt;&amp;</at>'
    );
  });

  it('缺少有效 open_id 时不构造 mention', () => {
    expect(getFeishuSenderMention({ name: '张三' })).toBe('');
    expect(getFeishuSenderMention({ openId: 'bad<id', name: '张三' })).toBe('');
  });
});

describe('getFeishuReplyText', () => {
  it('保留超过 4000 字符的完整飞书回复', () => {
    const answer = `${'a'.repeat(4000)}完整结尾`;

    const reply = getFeishuReplyText({ answer });

    expect(reply).toBe(answer);
  });

  it('移除飞书最终回复中的知识库 CITE 引用', () => {
    const answer = `### 4. 运行环境信息

- **Python 版本**：3.12 (基于路径 \`/data/anaconda3/envs/OCR/lib/python3.12\`) [6a4f79a92ce44e159e1af897](CITE)。
- **关键库**：
  - \`fastapi\` 和 \`uvicorn\` 作为 Web 框架 [6a4f79a92ce44e159e1af89e](CITE)[6a4f79a82ce44e159e1af879](CITE)。
- **服务器地址**：\`10.127.211.2:7434\` [6a4f79a92ce44e159e1af88f](CITE)。`;

    const reply = getFeishuReplyText({ answer });

    expect(reply).toBe(`### 4. 运行环境信息

- **Python 版本**：3.12 (基于路径 \`/data/anaconda3/envs/OCR/lib/python3.12\`)。
- **关键库**：
  - \`fastapi\` 和 \`uvicorn\` 作为 Web 框架。
- **服务器地址**：\`10.127.211.2:7434\`。`);
  });
});
