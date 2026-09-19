import { describe, expect, it } from 'vitest';
import { getFeishuReplyText } from '@fastgpt/service/support/outLink/feishu/utils';

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
