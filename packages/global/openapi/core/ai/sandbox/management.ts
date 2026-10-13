import z from 'zod';

export const SandboxManagementScopeSchema = z.object({
  sourceType: z.enum(['appRuntime', 'skillEdit']),
  sourceId: z.string().min(1)
});

export const SandboxWorkspacesListBodySchema = SandboxManagementScopeSchema.extend({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(100).optional()
});
export type SandboxWorkspacesListBody = z.input<typeof SandboxWorkspacesListBodySchema>;

export const SandboxWorkspaceItemSchema = z.object({
  sandboxId: z.string(),
  sourceType: SandboxManagementScopeSchema.shape.sourceType,
  sourceId: z.string(),
  sourceName: z.string(),
  reuseScope: z.enum(['user', 'session', 'source', 'unknown']),
  purpose: z.enum(['runtime', 'chat', 'debug', 'edit', 'unknown']),
  runtimeUserId: z.string().optional(),
  runtimeUserName: z.string().optional(),
  runtimeUserAccount: z.string().optional(),
  sourceChatId: z.string().optional(),
  sessionId: z.string().optional(),
  technicalName: z.string(),
  providerSandboxId: z.string().optional(),
  storageClaimName: z.string().optional(),
  status: z.string(),
  providerStatus: z.enum(['running', 'stopped', 'absent', 'transitioning', 'error', 'unknown']),
  statusMismatch: z.boolean(),
  operation: z
    .object({ type: z.string(), checkpoint: z.string(), failureDisposition: z.string().optional() })
    .optional(),
  createdAt: z.string(),
  lastActiveAt: z.string(),
  releasedAt: z.string().optional(),
  hasPersistentStorage: z.boolean(),
  canRelease: z.boolean(),
  canDelete: z.boolean(),
  canRecover: z.boolean().optional(),
  canForceDelete: z.boolean().optional(),
  forceDeletionPending: z.boolean().optional(),
  deletionRevision: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional()
});
export type SandboxWorkspaceItem = z.infer<typeof SandboxWorkspaceItemSchema>;

export const SandboxWorkspacesListResponseSchema = z.object({
  supported: z.boolean(),
  total: z.number(),
  list: z.array(SandboxWorkspaceItemSchema)
});
export type SandboxWorkspacesListResponse = z.infer<typeof SandboxWorkspacesListResponseSchema>;

export const SandboxWorkspaceActionBodySchema = SandboxManagementScopeSchema.extend({
  sandboxId: z.string().min(1),
  action: z.enum(['release', 'delete', 'forceDelete', 'recover']),
  rebuildEmpty: z.boolean().optional(),
  recoveryRevision: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  deletionRevision: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional()
})
  .refine((body) => !body.rebuildEmpty || (body.action === 'recover' && !!body.recoveryRevision), {
    message: 'recoveryRevision is required to rebuild an empty Sandbox',
    path: ['recoveryRevision']
  })
  .refine((body) => body.action !== 'forceDelete' || !!body.deletionRevision, {
    message: 'deletionRevision is required for forceDelete',
    path: ['deletionRevision']
  });
export type SandboxWorkspaceActionBody = z.infer<typeof SandboxWorkspaceActionBodySchema>;

export type SandboxWorkspaceActionResponse = {
  success: boolean;
  status?: 'deleted' | 'pending' | 'recovered' | 'confirmation_required';
  reason?: string;
  recoveryRevision?: string;
  strategy?: 'original' | 'backup' | 'empty';
};
