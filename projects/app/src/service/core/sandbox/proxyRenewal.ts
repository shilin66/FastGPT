import { randomBytes } from 'crypto';
import {
  SANDBOX_PROXY_RENEW_MESSAGE,
  SANDBOX_PROXY_RENEW_PATH,
  SandboxProxyRenewRequestIdSchema
} from '@fastgpt/global/core/ai/sandbox/proxy';

const invalid = () => Object.assign(new Error('Invalid renewal request'), { statusCode: 400 });

export const parseSandboxProxyRenewalRequest = (input: { method?: string; url: string }) => {
  const url = new URL(input.url, 'http://placeholder');
  const requestId = SandboxProxyRenewRequestIdSchema.safeParse(url.searchParams.get('requestId'));
  const ticket = url.searchParams.get('__pt');
  if (
    input.method !== 'GET' ||
    url.pathname !== SANDBOX_PROXY_RENEW_PATH ||
    !requestId.success ||
    !ticket ||
    !/^[a-f0-9]{64}$/.test(ticket) ||
    [...url.searchParams.keys()].length !== 2
  )
    throw invalid();
  return { requestId: requestId.data, ticket };
};

export const getSandboxProxyRenewalResponse = (input: {
  requestId: string;
  expiresAt: number;
  appOrigin: string;
}) => {
  const requestId = SandboxProxyRenewRequestIdSchema.parse(input.requestId);
  const origin = new URL(input.appOrigin);
  if (
    origin.origin !== input.appOrigin ||
    !['https:', 'http:'].includes(origin.protocol) ||
    !Number.isSafeInteger(input.expiresAt) ||
    input.expiresAt <= 0
  )
    throw invalid();
  const nonce = randomBytes(24).toString('base64');
  const message = JSON.stringify({
    type: SANDBOX_PROXY_RENEW_MESSAGE,
    requestId,
    expiresAt: input.expiresAt
  });
  return {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors ${origin.origin}; base-uri 'none'; form-action 'none'`
    },
    body: `<!doctype html><html><head><meta charset="utf-8"></head><body><script nonce="${nonce}">window.parent.postMessage(${message},${JSON.stringify(origin.origin)});</script></body></html>`
  };
};
