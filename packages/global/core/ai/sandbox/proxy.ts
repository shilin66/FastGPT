import z from 'zod';

export const SandboxProxyScopeSchema = z.object({
  sandboxId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{6,62}[a-zA-Z0-9]$/),
  targetPort: z.number().int().min(1).max(65535),
  audience: z.string().url()
});
export type SandboxProxyScope = z.infer<typeof SandboxProxyScopeSchema>;

// A reset gets a new origin so cookies from another editor tab cannot reconnect an old buffer.
export const getSandboxProxyResourceId = ({
  sandboxId,
  generation
}: {
  sandboxId: string;
  generation?: string;
}) => (generation ? `ws-${generation}` : sandboxId);

export const SandboxProxyGrantSchema = SandboxProxyScopeSchema.extend({
  userId: z.string().min(1),
  teamId: z.string().min(1),
  tmbId: z.string().min(1),
  provider: z.enum(['sealosdevbox', 'opensandbox', 'e2b']),
  sourceType: z.enum(['appRuntime', 'skillEdit']),
  sourceId: z.string().min(1),
  workspaceGeneration: z.string().uuid().optional()
});
export type SandboxProxyGrant = z.infer<typeof SandboxProxyGrantSchema>;

export const SandboxProxyTicketSchema = SandboxProxyGrantSchema.extend({
  expiresAt: z.number(),
  generation: z.string()
});

export const SANDBOX_PROXY_COOKIE = 'fastgpt_sandbox_proxy';
export const SANDBOX_PROXY_SESSION_SECONDS = 15 * 60;
export const SANDBOX_PROXY_RENEW_PATH = '/__fastgpt_proxy_session';
export const SANDBOX_PROXY_RENEW_MESSAGE = 'fastgpt:sandbox-session';
export const SandboxProxyRenewRequestIdSchema = z.string().regex(/^[a-zA-Z0-9-]{16,128}$/);
