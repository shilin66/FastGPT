import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fitAgentContext } from '@fastgpt/service/core/ai/llm/compress/contextBudget';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import {
  gptMessagesToPi,
  piMessagesToGPT
} from '@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent/context';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@fastgpt/service/core/ai/llm/request', () => ({ createLLMResponse: mocks.request }));
vi.mock('@fastgpt/service/common/string/tiktoken', () => ({
  countGptMessagesTokens: async (messages: unknown, tools?: unknown) =>
    Math.ceil(JSON.stringify({ messages, tools }).length / 4)
}));
const model: LLMModelItemType = {
  provider: 'test',
  model: 'test',
  name: 'test',
  type: ModelTypeEnum.llm,
  maxContext: 8192,
  maxResponse: 512,
  quoteMaxToken: 1000,
  functionCall: true,
  toolChoice: true
};
beforeEach(() => {
  mocks.request.mockReset().mockResolvedValue({
    answerText: 'User needs an email extractor; draft exists; tests remain.',
    finish_reason: 'stop',
    usage: { inputTokens: 100, outputTokens: 20 }
  });
});

describe('Skill context budget', () => {
  it('reserves the model output limit and bounds tool results without losing call IDs', async () => {
    const result = await fitAgentContext({
      model,
      tools: [],
      onUsage: vi.fn(),
      messages: [
        { role: 'user', content: 'Read the log' },
        {
          role: 'assistant',
          tool_calls: [
            { id: 'read-1', type: 'function', function: { name: 'read', arguments: '{}' } }
          ]
        },
        { role: 'tool', tool_call_id: 'read-1', content: 'x'.repeat(30000) }
      ]
    });
    expect(result).toMatchObject({ compressed: false, truncated: true, maxOutputTokens: 512 });
    expect(result.messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'read-1' });
    expect(String(result.messages.at(-1)?.content).length).toBeLessThan(13000);
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('compresses old turns, retains the current tool pair, and bills every compression request', async () => {
    const onUsage = vi.fn();
    const tail: ChatCompletionMessageParam[] = [
      { role: 'user', content: 'Now test the existing files' },
      {
        role: 'assistant',
        tool_calls: [
          { id: 'test-1', type: 'function', function: { name: 'execute', arguments: '{}' } }
        ]
      },
      { role: 'tool', tool_call_id: 'test-1', content: 'exitCode: 0' }
    ];
    const result = await fitAgentContext({
      model,
      tools: [],
      onUsage,
      messages: [
        { role: 'system', content: 'Trusted instructions' },
        { role: 'user', content: 'Extract email addresses' },
        { role: 'assistant', content: 'old transcript '.repeat(2300) },
        ...tail
      ]
    });
    expect(result.compressed).toBe(true);
    expect(result.messages.slice(-3)).toEqual(tail);
    expect(result.messages[0]).toEqual({ role: 'system', content: 'Trusted instructions' });
    expect(onUsage).toHaveBeenCalledTimes(mocks.request.mock.calls.length);
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 100, outputTokens: 20 })
    );
  });

  it('counts tool schemas and refuses an oversized current request without calling the model', async () => {
    const tools: ChatCompletionTool[] = [
      { type: 'function', function: { name: 'large', description: 'schema '.repeat(6000) } }
    ];
    await expect(
      fitAgentContext({
        model,
        tools,
        onUsage: vi.fn(),
        messages: [{ role: 'user', content: 'test' }]
      })
    ).rejects.toThrow('context_budget_exceeded');
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('bounds empty compression retries and records both charges', async () => {
    mocks.request.mockResolvedValue({
      answerText: '',
      finish_reason: 'stop',
      usage: { inputTokens: 10, outputTokens: 0 }
    });
    const onUsage = vi.fn();
    await expect(
      fitAgentContext({
        model,
        tools: [],
        onUsage,
        messages: [
          { role: 'user', content: 'earlier requirement' },
          { role: 'assistant', content: 'x'.repeat(30000) },
          { role: 'user', content: 'continue' }
        ]
      })
    ).rejects.toThrow('context_compression_failed');
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(onUsage).toHaveBeenCalledTimes(2);
  });
});

describe('Skill persisted context', () => {
  it('does not discard history for a malformed checkpoint or one containing an orphan tool result', () => {
    const messages = chats2GPTMessages({
      reserveId: false,
      reserveTool: true,
      checkpointNodeId: 'agent',
      messages: [
        { obj: ChatRoleEnum.Human, value: [{ text: { content: 'Original requirement' } }] },
        {
          obj: ChatRoleEnum.AI,
          value: [
            {
              contextCheckpoint: {
                schemaVersion: 1,
                nodeId: 'agent',
                createdAt: new Date().toISOString(),
                messages: [{ role: 'tool', tool_call_id: 'missing', content: 'invalid result' }]
              }
            }
          ]
        }
      ]
    });
    expect(messages).toEqual([{ role: 'user', content: 'Original requirement' }]);
  });

  it('round trips image content and tool identifiers through Pi checkpoint conversion', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Inspect this' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,YQ==' } }
        ]
      },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'one',
            type: 'function',
            function: { name: 'read', arguments: '{"path":"SKILL.md"}' }
          }
        ]
      },
      { role: 'tool', tool_call_id: 'one', content: 'skill instructions' }
    ];
    const piModel: Parameters<typeof gptMessagesToPi>[1] = {
      id: 'test',
      name: 'test',
      api: 'openai-completions',
      provider: 'openai',
      baseUrl: 'http://localhost/v1',
      reasoning: false,
      input: ['text', 'image'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 8192,
      maxTokens: 512
    };
    expect(piMessagesToGPT(gptMessagesToPi(messages, piModel))).toEqual(messages);
  });
});
