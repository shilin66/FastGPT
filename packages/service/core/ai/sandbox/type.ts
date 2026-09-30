import z from 'zod';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxProtocolEnum, SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';

// ---- 沙盒实例 DB 类型 ----
export const SandboxProviderSchema = z.enum(['sealosdevbox', 'opensandbox', 'e2b']);
export type SandboxProviderType = z.infer<typeof SandboxProviderSchema>;
export const SharedSandboxStatusSchema = z.enum(SandboxStatusEnum);
export type SharedSandboxStatusType = z.infer<typeof SharedSandboxStatusSchema>;

export const SandboxSourceTypeSchema = z.enum(['appRuntime', 'skillEdit']);
export type SandboxSourceType = z.infer<typeof SandboxSourceTypeSchema>;

export const SandboxOperationSchema = z.object({
  id: z.string(),
  type: z.string(),
  checkpoint: z.string(),
  startedAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  heartbeatAt: z.coerce.date().optional(),
  providerSandboxId: z.string().optional(),
  recoveredAt: z.coerce.date().optional(),
  recoveredFromOperationId: z.string().optional(),
  effectState: z.enum(['idle', 'pending', 'completed']).optional(),
  failureDisposition: z.enum(['retryable', 'unknown']).optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string()
    })
    .optional()
});

export const SandboxLimitSchema = z.object({
  cpuCount: z.number(),
  memoryMiB: z.number(),
  diskGiB: z.number()
});

export const SandboxVolumeSchema = z.object({
  name: z.string(),
  claimName: z.string().optional(),
  mountPath: z.string(),
  subPath: z.string().optional()
});

export const SandboxStorageSchema = z.object({
  volumes: z.array(SandboxVolumeSchema).optional(),
  mountPath: z.string().optional(),
  volumeManager: z
    .object({
      protocol: z.enum(['sessionId', 'claimName']),
      baseUrl: z.string().url(),
      target: z.string().min(1),
      ensured: z.boolean().optional()
    })
    .optional()
});
export type SandboxStorageType = z.infer<typeof SandboxStorageSchema>;

export const SandboxImageSchema = z.object({
  repository: z.string(),
  tag: z.string().optional()
});

export const SandboxEndpointSchema = z.object({
  host: z.string(),
  port: z.number(),
  protocol: z.enum(SandboxProtocolEnum),
  url: z.string()
});

export const SandboxMetadataSchema = z.object({
  sandboxType: z.enum(SandboxTypeEnum).optional(),
  teamId: z.string().optional(),
  tmbId: z.string().optional(),

  volumeEnabled: z.boolean().optional(),
  workspaceRoot: z.string().optional(),

  skillId: z.string().optional(),
  sessionId: z.string().optional(),
  providerSandboxId: z.string().optional(), // real provider sandbox ID (different from sessionId)
  skillIds: z.array(z.string()).optional(),
  image: SandboxImageSchema.optional(),
  endpoint: SandboxEndpointSchema.optional()
});
export type SandboxMetadataType = z.infer<typeof SandboxMetadataSchema>;

export const SandboxInstanceZodSchema = z.object({
  _id: z.string(),
  schemaVersion: z.number().optional(),
  sandboxId: z.string(),
  sourceType: SandboxSourceTypeSchema.optional(),
  sourceId: z.string().optional(),
  teamId: z.string().optional(),
  ownerTmbId: z.string().optional(),
  runtimeUserId: z.string().optional(),
  sessionId: z.string().optional(),
  sourceChatId: z.string().optional(),
  baseVersionId: z.string().optional(),
  workspaceGeneration: z.string().optional(),
  currentDeploymentHash: z.string().optional(),
  capacityReserved: z.boolean().optional(),
  operation: SandboxOperationSchema.optional(),
  appId: z.string().nullish(),
  userId: z.string().nullish(),
  chatId: z.string().nullish(),
  status: SharedSandboxStatusSchema,
  lastActiveAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  archiveAt: z.coerce.date().nullable().optional(),
  deleteTime: z.coerce.date().nullable().optional(),
  limit: SandboxLimitSchema.nullish(),
  provider: SandboxProviderSchema,
  storage: SandboxStorageSchema.nullish(),
  metadata: SandboxMetadataSchema.nullish()
});
export type SandboxInstanceSchemaType = z.infer<typeof SandboxInstanceZodSchema>;

export const SandboxOperationDiagnosisSchema = z.object({
  provider: SandboxProviderSchema,
  sandboxId: z.string(),
  status: SharedSandboxStatusSchema,
  operation: SandboxOperationSchema.optional(),
  remote: z
    .object({ id: z.string(), status: z.object({ state: z.string() }) })
    .nullable()
    .optional(),
  code: z.enum([
    'not_required',
    'unknown_create_result',
    'unclassified_failure',
    'unsupported_operation',
    'provider_id_missing',
    'provider_lookup_failed',
    'remote_outcome_unknown',
    'pre_effect_retry_confirmed',
    'provider_stop_confirmed',
    'provider_delete_confirmed'
  ])
});
export type SandboxOperationDiagnosis = z.infer<typeof SandboxOperationDiagnosisSchema>;
