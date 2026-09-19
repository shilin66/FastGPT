import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { Api, Model, TextContent, ImageContent } from '@mariozechner/pi-ai';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { z } from 'zod';

export const piMessagesToGPT = (messages: AgentMessage[]): ChatCompletionMessageParam[] =>
  messages.flatMap((message): ChatCompletionMessageParam[] => {
    if (message.role === 'user')
      return [
        {
          role: 'user',
          content:
            typeof message.content === 'string'
              ? message.content
              : message.content.map((part) =>
                  part.type === 'image'
                    ? {
                        type: 'image_url',
                        image_url: { url: `data:${part.mimeType};base64,${part.data}` }
                      }
                    : { type: 'text', text: part.text }
                )
        }
      ];
    if (message.role === 'toolResult')
      return [
        {
          role: 'tool',
          tool_call_id: message.toolCallId,
          content: message.content
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('\n')
        }
      ];
    if (message.role === 'assistant')
      return [
        {
          role: 'assistant',
          content: message.content
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('\n'),
          tool_calls: message.content
            .filter((part) => part.type === 'toolCall')
            .map((part) => ({
              id: part.id,
              type: 'function',
              function: { name: part.name, arguments: JSON.stringify(part.arguments) }
            }))
        }
      ];
    return [];
  });

export const gptMessagesToPi = (
  messages: ChatCompletionMessageParam[],
  model: Model<Api>
): AgentMessage[] => {
  const names = new Map(
    messages.flatMap((message) =>
      message.role === 'assistant'
        ? (message.tool_calls ?? []).map((call) => [call.id, call.function.name] as const)
        : []
    )
  );
  return messages.flatMap((message): AgentMessage[] => {
    const text =
      typeof message.content === 'string'
        ? message.content
        : (message.content ?? [])
            .flatMap((part) => (part.type === 'text' ? [part.text] : []))
            .join('\n');
    if (message.role === 'user')
      return [
        {
          role: 'user',
          content:
            typeof message.content === 'string'
              ? message.content
              : message.content.flatMap((part): (TextContent | ImageContent)[] => {
                  if (part.type === 'text') return [{ type: 'text', text: part.text }];
                  if (part.type === 'image_url') {
                    const encoded = /^data:([^;,]+);base64,(.*)$/s.exec(part.image_url.url);
                    return encoded
                      ? [{ type: 'image', mimeType: encoded[1], data: encoded[2] }]
                      : [{ type: 'text', text: `[Image attachment: ${part.image_url.url}]` }];
                  }
                  return [{ type: 'text', text: JSON.stringify(part) }];
                }),
          timestamp: 0
        }
      ];
    if (message.role === 'tool')
      return [
        {
          role: 'toolResult',
          toolCallId: message.tool_call_id,
          toolName: names.get(message.tool_call_id) ?? 'unknown',
          content: [{ type: 'text', text }],
          isError: false,
          timestamp: 0
        }
      ];
    if (message.role !== 'assistant') return [];
    return [
      {
        role: 'assistant',
        content: [
          ...(text ? [{ type: 'text' as const, text }] : []),
          ...(message.tool_calls ?? []).map((call) => ({
            type: 'toolCall' as const,
            id: call.id,
            name: call.function.name,
            arguments: z.record(z.string(), z.unknown()).parse(JSON.parse(call.function.arguments))
          }))
        ],
        api: model.api,
        provider: model.provider,
        model: model.id,
        stopReason: message.tool_calls?.length ? 'toolUse' : 'stop',
        timestamp: 0,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
        }
      }
    ];
  });
};
