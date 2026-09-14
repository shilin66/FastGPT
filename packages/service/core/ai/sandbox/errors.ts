const infrastructureCodes = new Set([
  'CONNECTION_ERROR',
  'INVALID_STATE',
  'READY_TIMEOUT',
  'UNHEALTHY',
  'SANDBOX_NOT_FOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'ECONNABORTED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'SANDBOX_UNAVAILABLE'
]);

export const isSandboxInfrastructureError = (error: unknown): boolean => {
  const visited = new Set<unknown>();
  let current = error;
  while (current instanceof Error && !visited.has(current)) {
    visited.add(current);
    if (
      'code' in current &&
      typeof current.code === 'string' &&
      infrastructureCodes.has(current.code.toUpperCase())
    )
      return true;
    if (
      current.name === 'SandboxApiException' &&
      'statusCode' in current &&
      typeof current.statusCode === 'number' &&
      current.statusCode >= 500
    )
      return true;
    if (
      'error' in current &&
      current.error &&
      typeof current.error === 'object' &&
      'code' in current.error &&
      typeof current.error.code === 'string' &&
      infrastructureCodes.has(current.error.code.toUpperCase())
    )
      return true;
    current = current.cause;
  }
  return false;
};

// Only the Volume Manager boundary may attest that its authentication middleware rejected before dispatch.
export class VolumeManagerAuthRejectedBeforeEffectError extends Error {
  readonly code = 'VOLUME_MANAGER_AUTH_REJECTED';
  readonly status = 401;

  constructor({ cause }: { status: 401; cause?: unknown }) {
    super('Volume Manager authentication rejected before any volume action', { cause });
    this.name = 'VolumeManagerAuthRejectedBeforeEffectError';
  }
}
