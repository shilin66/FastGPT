import z from 'zod';

export const SandboxIdentitySchema = z
  .discriminatedUnion('sourceType', [
    z.object({
      sourceType: z.literal('appRuntime'),
      sourceId: z.string().min(1),
      runtimeUserId: z.string().min(1),
      sessionId: z.string().min(1).optional(),
      reuseScope: z.enum(['user', 'session']).optional()
    }),
    z.object({
      sourceType: z.literal('skillEdit'),
      sourceId: z.string().min(1)
    })
  ])
  .refine(
    (identity) =>
      identity.sourceType !== 'appRuntime' ||
      (identity.reuseScope === 'user' ? identity.sessionId === undefined : !!identity.sessionId),
    { message: 'App sandbox identity must specify either user reuse or a legacy session' }
  );

export type SandboxIdentity = z.infer<typeof SandboxIdentitySchema>;
