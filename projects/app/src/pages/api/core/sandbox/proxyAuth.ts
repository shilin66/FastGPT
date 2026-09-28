import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import {
  authorizeSandboxProxyGrant,
  getSandboxProxyTarget,
  getSandboxProxyTargetForGrant
} from '@/service/core/sandbox/proxy';
import {
  issueSandboxProxyTicket,
  redeemSandboxProxyTicket
} from '@/service/core/sandbox/proxyTicket';
import {
  assertSandboxProxyInternalRequest,
  getSandboxProxyOrigins,
  getSandboxProxyRedirect,
  getSandboxProxyBasePath
} from '@/service/core/sandbox/proxyUtils';
import {
  SandboxProxyAuthQuerySchema,
  SandboxProxyInternalBodySchema
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import {
  SANDBOX_PROXY_COOKIE,
  SANDBOX_PROXY_RENEW_PATH
} from '@fastgpt/global/core/ai/sandbox/proxy';
import { ZodError } from 'zod';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method === 'GET') {
    const {
      sandboxId,
      port: targetPort,
      next,
      mode,
      expectedWorkspaceGeneration,
      requestId
    } = SandboxProxyAuthQuerySchema.parse(req.query);
    const input = { sandboxId, targetPort, host: req.headers.host, next };
    const { appOrigin, audience } = getSandboxProxyOrigins(input);
    if (req.headers.host !== new URL(appOrigin).host) return res.status(403).end('Invalid origin');
    const sameOriginRenewal =
      req.headers['sec-fetch-site'] === 'same-origin' ||
      (getSandboxProxyBasePath(input) &&
        req.headers.referer &&
        URL.canParse(req.headers.referer) &&
        new URL(req.headers.referer).origin === appOrigin);
    if (mode === 'renew' && !sameOriginRenewal) return res.status(403).end('Invalid origin');
    const target =
      mode === 'renew'
        ? new URL(`${getSandboxProxyBasePath(input)}${SANDBOX_PROXY_RENEW_PATH}`, audience)
        : getSandboxProxyRedirect(input);
    if (requestId) target.searchParams.set('requestId', requestId);
    const authorization = await authorizeSandboxProxyGrant({
      req,
      sandboxId,
      targetPort,
      audience,
      ...(expectedWorkspaceGeneration !== undefined ? { expectedWorkspaceGeneration } : {}),
      ...(mode === 'renew' ? { renewal: true } : {})
    });
    target.searchParams.set('__pt', await issueSandboxProxyTicket(authorization));
    return res.redirect(302, target.toString());
  }
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');
  assertSandboxProxyInternalRequest({
    headers: req.headers,
    remoteAddress: req.socket.remoteAddress
  });
  const { sandboxId, targetPort, proxyHost, ticket, mode } = SandboxProxyInternalBodySchema.parse(
    req.body
  );
  const { audience, appOrigin } = getSandboxProxyOrigins({
    sandboxId,
    targetPort,
    host: proxyHost
  });
  if (proxyHost !== new URL(audience).host) return res.status(403).end('Invalid origin');
  if (ticket) {
    const cookies = (req.headers.cookie ?? '')
      .split(';')
      .map((cookie) => cookie.trim())
      .filter((cookie) => cookie.startsWith(`${SANDBOX_PROXY_COOKIE}=`));
    const existingSession =
      mode === 'renew' && cookies.length === 1
        ? cookies[0].slice(SANDBOX_PROXY_COOKIE.length + 1)
        : undefined;
    const result = await redeemSandboxProxyTicket({
      ticket,
      sandboxId,
      targetPort,
      audience,
      existingSession,
      authorize: getSandboxProxyTargetForGrant
    });
    return res.json({ ...result, appOrigin });
  }
  const target = await getSandboxProxyTarget({ req, sandboxId, targetPort, audience });
  return res.json({ target, appOrigin });
}

export default NextAPI(async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    const code =
      error instanceof ZodError
        ? 400
        : error &&
            typeof error === 'object' &&
            'statusCode' in error &&
            typeof error.statusCode === 'number'
          ? error.statusCode
          : 503;
    return res
      .status(code)
      .json({ code, message: code === 401 ? 'Unauthorized' : 'Sandbox proxy unavailable' });
  }
});
