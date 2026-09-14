import z from 'zod';

export const SandboxIdentitySchema = z.discriminatedUnion('sourceType', [
  z.object({
    sourceType: z.literal('appRuntime'),
    sourceId: z.string().min(1),
    runtimeUserId: z.string().min(1),
    sessionId: z.string().min(1)
  }),
  z.object({
    sourceType: z.literal('skillEdit'),
    sourceId: z.string().min(1)
  })
]);

export type SandboxIdentity = z.infer<typeof SandboxIdentitySchema>;
