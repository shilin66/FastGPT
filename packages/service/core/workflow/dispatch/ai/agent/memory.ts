import z from 'zod';
import {
  AgentMemorySchema,
  AgentPlanEventSchema,
  AgentPlanSchema,
  type AgentMemory
} from '@fastgpt/global/core/ai/agent/type';
import { ChatCompletionMessageParamSchema } from '@fastgpt/global/core/ai/llm/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { getHistories } from '../../utils';
import { PlanAgentParamsSchema } from './sub/plan/constants';

const DefaultProviderStateSchema = z.object({
  pendingMainContext: z.array(ChatCompletionMessageParamSchema),
  pendingPlanContext: z.array(ChatCompletionMessageParamSchema).optional(),
  planBuffer: PlanAgentParamsSchema.optional(),
  sandboxSkillVersions: z.record(z.string(), z.string()).optional()
});

export const getPendingAgentInteraction = ({
  histories,
  nodeId
}: {
  histories: ChatItemMiniType[];
  nodeId: string;
}) => {
  const last = histories.at(-1);
  if (last?.obj !== ChatRoleEnum.AI) return;
  const interactive = last.value.at(-1)?.interactive;
  if (!interactive || !interactive.entryNodeIds?.includes(nodeId)) return;
  if (interactive.type === 'agentPlanAskQuery' && !interactive.params?.answer) return interactive;
  if (interactive.type === 'agentPlanAskUserForm' && !interactive.params?.submitted)
    return interactive;
  if (interactive.type === 'agentPlanAskUserSelect' && !interactive.params?.userSelectedVal)
    return interactive;
  if (interactive.type === 'agentPlanCheck' && !interactive.params?.confirmed) return interactive;
};

export const getAgentHistories = ({
  history,
  histories,
  nodeId
}: {
  history: ChatItemMiniType[] | number;
  histories: ChatItemMiniType[];
  nodeId: string;
}) => {
  const selected = getHistories(history, histories);
  if (history !== 0 || !getPendingAgentInteraction({ histories, nodeId })) return selected;
  const humanIndex = histories.findLastIndex((item) => item.obj === ChatRoleEnum.Human);
  return humanIndex < 0 ? histories.slice(-1) : histories.slice(humanIndex);
};

export const buildAgentMemory = ({
  nodeId,
  ...memory
}: Omit<AgentMemory, 'schemaVersion'> & { nodeId: string }): Record<string, unknown> => ({
  [`agentLoopMemory-${nodeId}`]: {
    schemaVersion: 1,
    engine: memory.engine,
    status: memory.status,
    ...(memory.status === 'paused' ? { providerState: memory.providerState } : {})
  },
  [`masterMessages-${nodeId}`]: undefined,
  [`planMessages-${nodeId}`]: undefined,
  [`agentPlan-${nodeId}`]: undefined,
  [`planBuffer-${nodeId}`]: undefined,
  [`piMessages-${nodeId}`]: undefined
});

export const readAgentMemory = ({
  histories,
  nodeId,
  engine
}: {
  histories: ChatItemMiniType[];
  nodeId: string;
  engine: AgentMemory['engine'];
}) => {
  if (!getPendingAgentInteraction({ histories, nodeId })) return;
  const last = histories.at(-1);
  if (last?.obj !== ChatRoleEnum.AI) return;
  const memories = last.memories;
  const key = `agentLoopMemory-${nodeId}`;
  if (memories && key in memories) {
    const parsed = AgentMemorySchema.safeParse(memories[key]);
    if (!parsed.success || parsed.data.status !== 'paused' || parsed.data.engine !== engine) return;
    return parsed.data;
  }
  const pendingMainContext =
    memories?.[engine === 'pi' ? `piMessages-${nodeId}` : `masterMessages-${nodeId}`];
  if (!Array.isArray(pendingMainContext)) return;
  const providerState = {
    pendingMainContext,
    ...(engine === 'default'
      ? {
          ...(memories?.[`planMessages-${nodeId}`]
            ? { pendingPlanContext: memories[`planMessages-${nodeId}`] }
            : {}),
          ...(memories?.[`planBuffer-${nodeId}`]
            ? { planBuffer: memories[`planBuffer-${nodeId}`] }
            : {})
        }
      : {})
  };
  if (engine === 'default' && !DefaultProviderStateSchema.safeParse(providerState).success) return;
  return AgentMemorySchema.parse({ schemaVersion: 1, engine, status: 'paused', providerState });
};

export const readDefaultAgentState = (
  props: Omit<Parameters<typeof readAgentMemory>[0], 'engine'>
) => {
  const result = DefaultProviderStateSchema.safeParse(
    readAgentMemory({ ...props, engine: 'default' })?.providerState
  );
  return result.success ? result.data : undefined;
};

export const restoreAgentPlan = ({
  histories,
  nodeId
}: {
  histories: ChatItemMiniType[];
  nodeId: string;
}) => {
  for (const item of [...histories].reverse()) {
    if (item.obj !== ChatRoleEnum.AI) continue;
    for (const value of [...item.value].reverse()) {
      const event = AgentPlanEventSchema.safeParse(value.planEvent);
      if (!event.success || event.data.nodeId !== nodeId) continue;
      return event.data.type === 'completed' ? undefined : event.data.plan ?? undefined;
    }
  }
  if (!getPendingAgentInteraction({ histories, nodeId })) return;
  const last = histories.at(-1);
  if (
    last?.obj !== ChatRoleEnum.AI ||
    (last.memories && `agentLoopMemory-${nodeId}` in last.memories)
  )
    return;
  const legacy = AgentPlanSchema.safeParse(last.memories?.[`agentPlan-${nodeId}`]);
  return legacy.success ? legacy.data : undefined;
};
