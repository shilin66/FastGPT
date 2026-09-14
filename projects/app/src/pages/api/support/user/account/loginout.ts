import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert, clearCookie } from '@fastgpt/service/support/permission/auth/common';
import { revokeSandboxProxyUser } from '@/service/core/sandbox/proxyTicket';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authCert({ req, authToken: true }).catch(() => undefined);
  if (auth) {
    await revokeSandboxProxyUser(auth.userId);
  }
  clearCookie(res);
}

export default NextAPI(handler);
