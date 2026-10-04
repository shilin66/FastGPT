// sessionId: lowercase alphanumeric and hyphens, no leading/trailing hyphen, 1-253 chars
const SESSION_ID_RE = /^[a-z0-9]([a-z0-9-]{0,251}[a-z0-9])?$/;

export function toClaimName(claimName: string): string {
  if (!SESSION_ID_RE.test(claimName)) {
    throw new Error(`Invalid claimName: ${claimName}`);
  }
  return claimName;
}

export function toVolumeName(prefix: string, sessionId: string): string {
  const normalized = sessionId.toLowerCase();
  if (!SESSION_ID_RE.test(normalized)) {
    throw new Error(
      `Invalid sessionId: must be lowercase alphanumeric/hyphens, got "${sessionId}"`
    );
  }
  return `${prefix}-${normalized}`;
}
