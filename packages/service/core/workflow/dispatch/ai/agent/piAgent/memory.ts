import z from 'zod';
import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { Model, Api } from '@mariozechner/pi-ai';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { readAgentMemory } from '../memory';

const TextSchema = z.looseObject({ type: z.literal('text'), text: z.string() });
const ImageSchema = z.looseObject({
  type: z.literal('image'),
  data: z.string(),
  mimeType: z.string()
});
const ToolCallSchema = z.looseObject({
  type: z.literal('toolCall'),
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown())
});
const UsageSchema = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  totalTokens: z.number(),
  cost: z.object({
    input: z.number(),
    output: z.number(),
    cacheRead: z.number(),
    cacheWrite: z.number(),
    total: z.number()
  })
});
const PiMessageSchema = z.discriminatedUnion('role', [
  z.looseObject({
    role: z.literal('user'),
    content: z.union([z.string(), z.array(z.union([TextSchema, ImageSchema]))]),
    timestamp: z.number()
  }),
  z.looseObject({
    role: z.literal('assistant'),
    content: z.array(
      z.union([
        TextSchema,
        ToolCallSchema,
        z.looseObject({ type: z.literal('thinking'), thinking: z.string() })
      ])
    ),
    api: z.string(),
    provider: z.string(),
    model: z.string(),
    timestamp: z.number(),
    usage: UsageSchema,
    stopReason: z.enum(['stop', 'length', 'toolUse', 'error', 'aborted']),
    errorMessage: z.string().optional()
  }),
  z.looseObject({
    role: z.literal('toolResult'),
    toolCallId: z.string(),
    toolName: z.string(),
    content: z.array(z.union([TextSchema, ImageSchema])),
    isError: z.boolean(),
    timestamp: z.number()
  })
]);
const PiProviderStateSchema = z.object({
  pendingMainContext: z.array(PiMessageSchema),
  pendingToolCallId: z.string().optional(),
  sandboxSkillVersions: z.record(z.string(), z.string()).optional()
});

export const readPiAgentState = (props: { histories: ChatItemMiniType[]; nodeId: string }) => {
  const parsed = PiProviderStateSchema.safeParse(
    readAgentMemory({ ...props, engine: 'pi' })?.providerState
  );
  if (!parsed.success) return;
  const { pendingMainContext, pendingToolCallId } = parsed.data;
  const pendingCall = pendingMainContext
    .flatMap((message) => (message.role === 'assistant' ? message.content : []))
    .findLast(
      (content) =>
        content.type === 'toolCall' &&
        content.name === SubAppIds.ask &&
        (!pendingToolCallId || content.id === pendingToolCallId)
    );
  if (pendingCall?.type !== 'toolCall') return;
  return {
    pendingMainContext,
    pendingToolCallId: pendingCall.id,
    sandboxSkillVersions: parsed.data.sandboxSkillVersions
  };
};

export const resumePiMessages = ({
  state,
  answer
}: {
  state: NonNullable<ReturnType<typeof readPiAgentState>>;
  answer: string;
}): AgentMessage[] => {
  const messages = state.pendingMainContext.filter(
    (message) => message.role !== 'assistant' || !['aborted', 'error'].includes(message.stopReason)
  );
  const result = {
    role: 'toolResult' as const,
    toolCallId: state.pendingToolCallId,
    toolName: SubAppIds.ask,
    content: [{ type: 'text' as const, text: answer }],
    isError: false,
    timestamp: Date.now()
  };
  const index = messages.findIndex(
    (message) => message.role === 'toolResult' && message.toolCallId === state.pendingToolCallId
  );
  if (index < 0) return [...messages, result];
  return messages.map((message, current) => (current === index ? result : message));
};

export const chatHistoriesToPiMessages = ({
  histories,
  model
}: {
  histories: ChatItemMiniType[];
  model: Model<Api>;
}): AgentMessage[] =>
  histories.flatMap((item): AgentMessage[] => {
    if (item.obj === ChatRoleEnum.System) return [];
    const { text } = chatValue2RuntimePrompt(item.value);
    if (!text) return [];
    if (item.obj === ChatRoleEnum.Human) return [{ role: 'user', content: text, timestamp: 0 }];
    return [
      {
        role: 'assistant',
        content: [{ type: 'text', text }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        stopReason: 'stop',
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
