import { z } from 'zod';

const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i)
  .transform((value) => value.toLowerCase());
export const AgentSkillDeleteJobSchema = z.object({
  kind: z.literal('delete'),
  teamId: objectId,
  skillId: objectId,
  deleteTime: z.string().datetime(),
  operationId: z.string().uuid()
});
export type AgentSkillDeleteJobData = z.infer<typeof AgentSkillDeleteJobSchema>;
export type AgentSkillDeleteQueueData = AgentSkillDeleteJobData | { kind: 'reconcile' };
