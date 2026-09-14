import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import {
  getCodeServerPasswordFromSandbox,
  getSandboxProxyTarget
} from '@/service/core/sandbox/proxy';
import {
  assertSandboxProxyInternalRequest,
  getSandboxProxyOrigins
} from '@/service/core/sandbox/proxyUtils';
import { SandboxProxyInternalBodySchema } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { ZodError } from 'zod';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');
  assertSandboxProxyInternalRequest({
    headers: req.headers,
    remoteAddress: req.socket.remoteAddress
  });
  const { sandboxId, targetPort, proxyHost } = SandboxProxyInternalBodySchema.parse(req.body);
  const { audience } = getSandboxProxyOrigins({ sandboxId, targetPort, host: proxyHost });
  if (proxyHost !== new URL(audience).host) return res.status(403).end('Invalid origin');
  await getSandboxProxyTarget({ req, sandboxId, targetPort, audience });
  const password = await getCodeServerPasswordFromSandbox(sandboxId);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ password });
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
    return res.status(code).json({ code, message: 'Sandbox proxy unavailable' });
  }
});
