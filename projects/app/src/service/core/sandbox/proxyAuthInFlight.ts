import { createHash } from 'crypto';
import type { IncomingMessage } from 'http';

export type SandboxProxyAuthorizationInput = {
  reqHeaders: IncomingMessage['headers'];
  sandboxId: string;
  targetPort: number;
  ticket?: string;
  mode?: 'renew';
  connection?: { id: string; mode: 'open' | 'renew' | 'close' };
};

export function coalesceSandboxProxyAuthorization<T>(
  authorize: (input: SandboxProxyAuthorizationInput) => Promise<T>,
  maximumPending = 1024
) {
  const pending = new Map<string, Promise<T>>();
  return async (input: SandboxProxyAuthorizationInput): Promise<T> => {
    // Ticket exchange, renewal and connection accounting must each perform their own writes.
    if (input.ticket !== undefined || input.mode !== undefined || input.connection !== undefined)
      return authorize(input);
    const key = createHash('sha256')
      .update(
        JSON.stringify([
          input.sandboxId,
          input.targetPort,
          input.reqHeaders.host ?? '',
          input.reqHeaders.origin ?? '',
          input.reqHeaders.cookie ?? ''
        ])
      )
      .digest('hex');
    const existing = pending.get(key);
    if (existing) return existing;
    if (pending.size >= maximumPending) return authorize(input);
    const result = authorize(input);
    pending.set(key, result);
    try {
      return await result;
    } finally {
      pending.delete(key);
    }
  };
}
