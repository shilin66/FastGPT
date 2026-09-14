// Pure utility functions with minimal imports.
// Kept separate so server.ts (tsx CJS mode) can import without triggering
// the ESM-only @fastgpt-sdk/otel dependency chain.
import { randomBytes, timingSafeEqual } from 'crypto';
import type { SkillSandboxEndpointType } from '@fastgpt/global/core/agentSkills/type';
import type { IncomingHttpHeaders } from 'http';
import { SANDBOX_PROXY_COOKIE } from '@fastgpt/global/core/ai/sandbox/proxy';

export function stripFastGPTCredentials(headers: IncomingHttpHeaders): void {
  delete headers.authorization;
  delete headers.token;
  delete headers.rootkey;
  delete headers['proxy-authorization'];
  delete headers['x-fastgpt-proxy-internal'];
  if (headers.cookie) {
    headers.cookie = headers.cookie
      .split(';')
      .map((cookie) => cookie.trim())
      .filter((cookie) => !['fastgpt_token', SANDBOX_PROXY_COOKIE].includes(cookie.split('=')[0]))
      .join('; ');
    if (!headers.cookie) delete headers.cookie;
  }
}

export function resolveSandboxProxyTarget(
  endpoint: SkillSandboxEndpointType | undefined,
  targetPort: number
): string {
  if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
    throw Object.assign(new Error('Invalid port'), { statusCode: 400 });
  }
  if (!endpoint?.url) {
    throw Object.assign(new Error('Sandbox endpoint unavailable'), { statusCode: 503 });
  }

  const target = new URL(endpoint.url);
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw Object.assign(new Error('Invalid endpoint protocol'), { statusCode: 503 });
  }
  if (targetPort !== endpoint.port) {
    throw Object.assign(new Error('Unsupported proxy port'), { statusCode: 400 });
  }
  return target.toString().replace(/\/$/, '');
}

// Parse subdomain proxy from Host header.
// Formats: {port}--{sandboxId-with-hyphens}.{domain} or {port}-{sandboxId-alphanumeric}.{domain}
export function parseSubdomainProxy(
  host: string | undefined
): { port: number; sandboxId: string } | null {
  if (!host) return null;
  // Strip optional :port suffix to get the pure hostname
  const hostname = host.split(':')[0];

  // New format: {port}--{sandboxId-with-hyphens}.{domain}
  // sandboxId: starts/ends with alnum, may contain hyphens, 8–64 chars.
  let match = hostname.match(/^(\d+)--([a-zA-Z0-9][a-zA-Z0-9-]{6,62}[a-zA-Z0-9])\./);
  if (!match) {
    // Legacy format: {port}-{sandboxId-alphanumeric}.{domain}
    match = hostname.match(/^(\d+)-([a-zA-Z0-9]{8,32})\./);
  }

  if (!match) return null;
  const port = Number(match[1]);
  if (port < 1 || port > 65535) return null;
  return { port, sandboxId: match[2] };
}

type ProxyOriginInput = { sandboxId: string; targetPort: number; host?: string; next?: string };

export function getSandboxProxyContentSecurityPolicy(appOrigin: string): string {
  return `frame-ancestors 'self' ${appOrigin}; object-src 'none'; base-uri 'self'`;
}

export function getSandboxProxyOrigins({ sandboxId, targetPort, host }: ProxyOriginInput) {
  const configuredApp = process.env.AGENT_SANDBOX_PROXY_APP_ORIGIN?.trim() || undefined;
  const configuredProxy = process.env.AGENT_SANDBOX_PROXY_BASE_URL?.trim() || undefined;
  const localHost = `localhost:${process.env.PORT ?? '3000'}`;
  const isLocal =
    process.env.NODE_ENV !== 'production' &&
    [localHost, `${targetPort}--${sandboxId}.${localHost}`].includes(host ?? '');
  if ((!configuredApp || !configuredProxy) && !isLocal) {
    throw Object.assign(new Error('Proxy origin configuration required'), { statusCode: 503 });
  }
  const app = new URL(configuredApp ?? `http://${localHost}`);
  const preview = new URL(configuredProxy ?? `http://${localHost}`);
  if (
    app.username ||
    app.password ||
    app.pathname !== '/' ||
    app.search ||
    app.hash ||
    preview.username ||
    preview.password ||
    preview.pathname !== '/' ||
    preview.search ||
    preview.hash ||
    (!isLocal && (app.protocol !== 'https:' || preview.protocol !== 'https:')) ||
    !['http:', 'https:'].includes(app.protocol) ||
    !['http:', 'https:'].includes(preview.protocol)
  )
    throw Object.assign(new Error('Invalid proxy origin configuration'), { statusCode: 503 });
  const label = `${targetPort}--${sandboxId}`;
  if (label.length > 63)
    throw Object.assign(new Error('Invalid sandbox hostname'), { statusCode: 400 });
  preview.hostname = `${label}.${preview.hostname}`;
  if (preview.origin === app.origin)
    throw Object.assign(new Error('Proxy requires an independent origin'), { statusCode: 503 });
  return { appOrigin: app.origin, audience: preview.origin };
}

export function getSandboxProxyRedirect(input: ProxyOriginInput): URL {
  const { audience } = getSandboxProxyOrigins(input);
  const target = new URL(input.next ?? '/proxy/8080/', audience);
  if (
    target.origin !== audience ||
    target.username ||
    target.password ||
    target.hash ||
    /[\x00-\x1f\\]/.test(input.next ?? '')
  ) {
    throw Object.assign(new Error('Invalid next URL'), { statusCode: 400 });
  }
  target.searchParams.delete('__pt');
  return target;
}

export function assertSandboxProxyPath(input: { target: string; path: string }) {
  if (new URL(input.target).pathname === '/') return;
  const rawPath = input.path.split('?')[0];
  if (
    !rawPath.startsWith('/proxy/8080/') ||
    /[%\\\x00-\x20]/.test(rawPath) ||
    rawPath.split('/').some((segment) => segment === '.' || segment === '..')
  )
    throw Object.assign(new Error('Unsupported proxy path'), { statusCode: 403 });
}

export function watchSandboxProxySession(input: {
  verify: () => Promise<unknown>;
  close: () => void;
}) {
  let verifying = false;
  const timer = setInterval(async () => {
    if (verifying) return;
    verifying = true;
    try {
      await input.verify();
    } catch {
      clearInterval(timer);
      input.close();
    } finally {
      verifying = false;
    }
  }, 10_000);
  timer.unref?.();
  return () => clearInterval(timer);
}

const internalKey = Symbol.for('fastgpt.sandbox.proxy.internal');
const internalState = globalThis as typeof globalThis & { [internalKey]?: string };

export function getSandboxProxyInternalSecret(): string {
  return (internalState[internalKey] ??= randomBytes(32).toString('hex'));
}

export function assertSandboxProxyInternalRequest(input: {
  headers: IncomingHttpHeaders;
  remoteAddress?: string;
}) {
  const provided = input.headers['x-fastgpt-proxy-internal'];
  const secret = getSandboxProxyInternalSecret();
  if (
    !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(input.remoteAddress ?? '') ||
    typeof provided !== 'string' ||
    provided.length !== secret.length ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))
  )
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
}

// ---- code-server session store ----
// This is only an upstream login cache; every browser request still needs a resource ticket.
const CS_SESSION_TTL = 2 * 60 * 60 * 1000; // 2 h
const CS_COOKIE_LESS_TTL = 60_000;
const CS_REQUEST_TIMEOUT = 5_000;
const MAX_CS_SESSION_STORE_SIZE = 1000;

type CsSession = { target: string; keyCookie: string | null; exp: number };
type CsPending = { target: string; token: symbol; promise: Promise<string | null> };

const _csStore = (): Map<string, CsSession> => {
  const g = globalThis as typeof globalThis & { __csSessionStore?: Map<string, CsSession> };
  if (!g.__csSessionStore) g.__csSessionStore = new Map();
  return g.__csSessionStore;
};

const _csPending = (): Map<string, CsPending> => {
  const g = globalThis as typeof globalThis & { __csSessionPending?: Map<string, CsPending> };
  return (g.__csSessionPending ??= new Map());
};

function getCsSession(sandboxId: string, target: string): CsSession | undefined {
  const entry = _csStore().get(sandboxId);
  if (!entry || entry.target !== target || entry.exp <= Date.now()) {
    _csStore().delete(sandboxId);
    return;
  }
  if (entry.keyCookie) entry.exp = Date.now() + CS_SESSION_TTL;
  return entry;
}

export function deleteCsSession(sandboxId: string): void {
  _csStore().delete(sandboxId);
  _csPending().delete(sandboxId);
}

async function withCsRequestTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Code-server login request timed out'));
    }, CS_REQUEST_TIMEOUT);
  });
  try {
    return await Promise.race([run(controller.signal), expired]);
  } finally {
    clearTimeout(timer);
  }
}

function isCookieLessLoginRedirect(response: Response, target: string): boolean {
  const location = response.headers.get('location');
  if (
    ![301, 302].includes(response.status) ||
    response.headers.has('set-cookie') ||
    !location ||
    /[%\\\x00-\x20]/.test(location)
  )
    return false;
  try {
    const root = new URL(`${target}/`);
    return new URL(location, `${target}/login`).href === root.href;
  } catch {
    return false;
  }
}

async function loadCsSession(
  target: string,
  getPassword: (signal: AbortSignal) => Promise<string | null>
): Promise<CsSession | undefined> {
  const probe = await withCsRequestTimeout((signal) =>
    fetch(`${target}/login`, { method: 'GET', redirect: 'manual', signal })
  );
  void probe.body?.cancel().catch(() => {});
  if (isCookieLessLoginRedirect(probe, target)) {
    return { target, keyCookie: null, exp: Date.now() + CS_COOKIE_LESS_TTL };
  }
  if (probe.status !== 200) return;
  const password = await withCsRequestTimeout(getPassword);
  if (!password) return;

  const response = await withCsRequestTimeout((signal) =>
    fetch(`${target}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        origin: new URL(target).origin
      },
      body: `password=${encodeURIComponent(password)}`,
      redirect: 'manual',
      signal
    })
  );
  void response.body?.cancel().catch(() => {});
  if (![301, 302].includes(response.status)) return;

  const setCookies = response.headers.getSetCookie?.() ?? [
    response.headers.get('set-cookie') ?? ''
  ];
  for (const cookie of setCookies) {
    const match = cookie.match(/(?:^|;\s*)code-server-session=([^;]+)/i);
    const keyCookie = match?.[1].trim();
    if (keyCookie) {
      return { target, keyCookie, exp: Date.now() + CS_SESSION_TTL };
    }
  }
}

function storeCsSession(sandboxId: string, session: CsSession) {
  const csStore = _csStore();
  for (const [key, value] of csStore) {
    if (value.exp <= Date.now()) csStore.delete(key);
  }
  if (!csStore.has(sandboxId) && csStore.size >= MAX_CS_SESSION_STORE_SIZE) {
    let evictKey: string | null = null;
    let minExp = Infinity;
    for (const [k, v] of csStore) {
      if (v.exp < minExp) {
        minExp = v.exp;
        evictKey = k;
      }
    }
    if (evictKey) csStore.delete(evictKey);
  }
  csStore.set(sandboxId, session);
}

export async function ensureCodeServerSession(
  sandboxId: string,
  target: string,
  getPassword: (signal: AbortSignal) => Promise<string | null>
): Promise<string | null> {
  const cached = getCsSession(sandboxId, target);
  if (cached) return cached.keyCookie;
  const pendingStore = _csPending();
  const pending = pendingStore.get(sandboxId);
  if (pending?.target === target) return pending.promise;
  if (pending) pendingStore.delete(sandboxId);
  if (pendingStore.size >= MAX_CS_SESSION_STORE_SIZE) return null;

  const token = Symbol();
  const promise = Promise.resolve()
    .then(() => loadCsSession(target, getPassword))
    .then((session) => {
      if (pendingStore.get(sandboxId)?.token !== token) return null;
      if (session) storeCsSession(sandboxId, session);
      return session?.keyCookie ?? null;
    })
    .catch(() => {
      console.warn(`[csLogin] upstream login unavailable sandboxId=${sandboxId}`);
      return null;
    })
    .finally(() => {
      if (pendingStore.get(sandboxId)?.token === token) pendingStore.delete(sandboxId);
    });
  pendingStore.set(sandboxId, { target, token, promise });
  return promise;
}

// Rewrite absolute paths in HTML for the absproxy mode
export function rewriteHtml(html: string, basePath: string): string {
  return (
    html
      // Rewrite src/href/action attributes pointing to absolute paths (not protocol-relative)
      .replace(/((?:src|href|action)=["'])(\/(?!\/))/g, `$1${basePath}/`)
      // Rewrite url() in CSS with absolute paths
      .replace(/(url\(['"]?)(\/(?!\/))/g, `$1${basePath}/`)
      // Inject <base> tag last to avoid self-rewrite by the replacements above
      .replace(/(<head[^>]*>)/i, `$1<base href="${basePath}/">`)
  );
}
