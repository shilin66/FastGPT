import z from 'zod';

export const SandboxVolumeNameSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);

export const SandboxVolumeEnsureRequestSchema = z
  .object({
    claimName: SandboxVolumeNameSchema,
    storageSize: z
      .string()
      .regex(/^[1-9]\d*(?:Mi|Gi|Ti)$/)
      .optional()
  })
  .strict();

export const SandboxVolumeEnsureResponseSchema = z.object({
  claimName: SandboxVolumeNameSchema,
  created: z.boolean()
});

export const SandboxVolumeInspectResponseSchema = z.object({
  claimName: SandboxVolumeNameSchema,
  exists: z.boolean()
});

export type SandboxVolumeEnsureRequest = z.infer<typeof SandboxVolumeEnsureRequestSchema>;
export type SandboxVolumeEnsureResponse = z.infer<typeof SandboxVolumeEnsureResponseSchema>;
export type SandboxVolumeInspectResponse = z.infer<typeof SandboxVolumeInspectResponseSchema>;
