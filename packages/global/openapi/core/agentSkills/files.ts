import { z } from 'zod';

const identity = { skillId: z.string().regex(/^[a-f0-9]{24}$/i) };
const filePath = z.string().min(1).max(1024);
export const SkillWorkspaceFileBodySchema = z.discriminatedUnion('action', [
  z.object({ ...identity, action: z.literal('list') }),
  z.object({ ...identity, action: z.literal('read'), path: filePath }),
  z.object({
    ...identity,
    action: z.literal('write'),
    path: filePath,
    content: z.string().max(262144),
    expectedHash: z.string().regex(/^[a-f0-9]{64}$/)
  })
]);
export type SkillWorkspaceFileBody = z.infer<typeof SkillWorkspaceFileBodySchema>;
export const SkillWorkspaceFileResponseSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('list'),
    files: z.array(
      z.object({
        path: filePath,
        type: z.enum(['file', 'directory']),
        version: z.string(),
        size: z.number()
      })
    ),
    truncated: z.boolean()
  }),
  z.object({
    action: z.literal('read'),
    path: filePath,
    content: z.string(),
    hash: z.string(),
    version: z.string()
  }),
  z.object({ action: z.literal('write'), path: filePath, hash: z.string(), version: z.string() })
]);
export type SkillWorkspaceFileResponse = z.infer<typeof SkillWorkspaceFileResponseSchema>;
