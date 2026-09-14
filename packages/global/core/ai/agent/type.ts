import { getNanoid } from '../../../common/string/tools';
import z from 'zod';

export const AgentStepItemSchema = z.object({
  id: z.string().default(getNanoid(6)),
  title: z.string(),
  description: z.string(),
  depends_on: z.array(z.string()).nullish(),
  response: z.string().nullish(),
  summary: z.string().nullish()
});
export type AgentStepItemType = z.infer<typeof AgentStepItemSchema>;

export const AgentPlanSchema = z.object({
  planId: z.string().default(getNanoid(6)),
  task: z.string(),
  description: z.string(),
  background: z.string().nullish(),
  steps: z.array(AgentStepItemSchema)
});
export type AgentPlanType = z.infer<typeof AgentPlanSchema>;

export const AgentPlanEventSchema = z.object({
  nodeId: z.string(),
  type: z.enum(['create', 'update', 'completed']),
  plan: AgentPlanSchema.nullable()
});
export type AgentPlanEvent = z.infer<typeof AgentPlanEventSchema>;

export const AgentMemorySchema = z.object({
  schemaVersion: z.literal(1),
  engine: z.enum(['default', 'pi']),
  status: z.enum(['paused', 'completed', 'failed']),
  providerState: z.record(z.string(), z.unknown()).optional()
});
export type AgentMemory = z.infer<typeof AgentMemorySchema>;
