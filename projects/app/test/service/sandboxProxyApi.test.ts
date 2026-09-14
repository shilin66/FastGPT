import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { getSandboxProxyInternalSecret } from '@/service/core/sandbox/proxyUtils';

const mocks = vi.hoisted(() => ({
  grant: vi.fn(),
  target: vi.fn(),
  targetForGrant: vi.fn(),
  issue: vi.fn(),
  redeem: vi.fn(),
  password: vi.fn(),
  auth: vi.fn(),
  clear: vi.fn(),
  logout: vi.fn(),
  revoke: vi.fn()
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@/service/core/sandbox/proxy', () => ({
  authorizeSandboxProxyGrant: mocks.grant,
  getSandboxProxyTarget: mocks.target,
  getSandboxProxyTargetForGrant: mocks.targetForGrant,
  getCodeServerPasswordFromSandbox: mocks.password
}));
vi.mock('@/service/core/sandbox/proxyTicket', () => ({
  issueSandboxProxyTicket: mocks.issue,
  redeemSandboxProxyTicket: mocks.redeem,
  revokeSandboxProxyUser: mocks.revoke
}));
vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: mocks.auth,
  clearCookie: mocks.clear
}));
import handler from '@/pages/api/core/sandbox/proxyAuth';
import passwordHandler from '@/pages/api/core/sandbox/proxyCSPassword';
import logoutHandler from '@/pages/api/support/user/account/loginout';

const createRequest = (
  input: Partial<Pick<NextApiRequest, 'headers' | 'method' | 'query' | 'body'>> & {
    socket?: { remoteAddress: string };
  }
): NextApiRequest => {
  const { socket: address, ...fields } = input;
  const socket = new Socket();
  Object.defineProperty(socket, 'remoteAddress', { value: address?.remoteAddress });
  return Object.assign(
    new IncomingMessage(socket),
    { cookies: {}, query: {}, body: undefined, env: process.env },
    fields
  );
};

describe('Sandbox proxy HTTP auth API', () => {
  const scope = {
    sandboxId: 'sandbox-12345678',
    targetPort: 8090,
    proxyHost: '8090--sandbox-12345678.localhost:3000'
  };
  const response = () => {
    const res = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
      json: vi.fn(),
      redirect: vi.fn(),
      status: vi.fn()
    };
    res.status.mockImplementation((code: number) => {
      res.statusCode = code;
      return res;
    });
    return res;
  };
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.grant.mockResolvedValue({
      grant: { userId: 'user-1', ...scope },
      sessionId: 'main-session-1'
    });
    mocks.issue.mockResolvedValue('a'.repeat(64));
    mocks.targetForGrant.mockResolvedValue('http://gateway:8090/sandboxes/provider/proxy/44772');
    mocks.redeem.mockImplementation(async ({ authorize }) => ({
      session: 'b'.repeat(64),
      expiresAt: 1234567890,
      target: await authorize({ userId: 'user-1', ...scope })
    }));
    mocks.target.mockResolvedValue('http://gateway:8090/sandboxes/provider/proxy/44772');
    mocks.auth.mockResolvedValue({ userId: 'user-1' });
    mocks.revoke.mockResolvedValue(undefined);
  });
  it('issues only an opaque ticket on the trusted main origin', async () => {
    const res = response();
    const req = {
      method: 'GET',
      headers: { host: 'localhost:3000', cookie: 'fastgpt_token=main-secret' },
      query: { sandboxId: scope.sandboxId, port: '8090' }
    };
    await handler(createRequest(req), res as unknown as NextApiResponse);
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      `http://${scope.proxyHost}/proxy/8080/?__pt=${'a'.repeat(64)}`
    );
    expect(JSON.stringify(res.redirect.mock.calls)).not.toContain('main-secret');
  });
  it('rejects next targeting another resource before signing', async () => {
    const res = response();
    await handler(
      createRequest({
        method: 'GET',
        headers: { host: 'localhost:3000' },
        query: {
          sandboxId: scope.sandboxId,
          port: '8090',
          next: 'http://8090--other-sandbox.localhost:3000/'
        }
      }),
      res as unknown as NextApiResponse
    );
    expect(res.statusCode).toBe(400);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it('passes the editor generation to fresh main-origin renewal authorization', async () => {
    const res = response();
    await handler(
      createRequest({
        method: 'GET',
        headers: { host: 'localhost:3000', 'sec-fetch-site': 'same-origin' },
        query: {
          sandboxId: scope.sandboxId,
          port: '8090',
          mode: 'renew',
          requestId: 'request-1234567890123456',
          expectedWorkspaceGeneration: 'legacy'
        }
      }),
      res as unknown as NextApiResponse
    );
    expect(mocks.grant).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedWorkspaceGeneration: 'legacy',
        renewal: true
      })
    );
    expect(mocks.issue).toHaveBeenCalledOnce();
  });
  it.each([handler, passwordHandler])(
    'denies direct loopback HTTP without the process credential',
    async (route) => {
      const res = response();
      await route(
        createRequest({
          method: 'POST',
          headers: {},
          socket: { remoteAddress: '127.0.0.1' },
          body: scope
        }),
        res as unknown as NextApiResponse
      );
      expect(res.statusCode).toBe(401);
      expect(mocks.target).not.toHaveBeenCalled();
      expect(mocks.password).not.toHaveBeenCalled();
    }
  );
  it('exchanges once and rechecks resource permissions before returning a scoped cookie', async () => {
    const res = response();
    const req = {
      method: 'POST',
      headers: { 'x-fastgpt-proxy-internal': getSandboxProxyInternalSecret() },
      socket: { remoteAddress: '127.0.0.1' },
      body: { ...scope, ticket: 'a'.repeat(64) }
    };
    await handler(createRequest(req), res as unknown as NextApiResponse);
    expect(mocks.targetForGrant).toHaveBeenCalledWith({ userId: 'user-1', ...scope });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ session: 'b'.repeat(64), expiresAt: 1234567890 })
    );
  });
  it('rejects an internal host/audience mismatch', async () => {
    const res = response();
    await handler(
      createRequest({
        method: 'POST',
        headers: { 'x-fastgpt-proxy-internal': getSandboxProxyInternalSecret() },
        socket: { remoteAddress: '127.0.0.1' },
        body: { ...scope, proxyHost: 'localhost:3000' }
      }),
      res as unknown as NextApiResponse
    );
    expect(res.statusCode).toBe(403);
    expect(mocks.target).not.toHaveBeenCalled();
  });

  it('revokes only the signed-out user before acknowledging logout', async () => {
    await logoutHandler(createRequest({ headers: {} }), response() as unknown as NextApiResponse);
    expect(mocks.revoke).toHaveBeenCalledWith('user-1');
    expect(mocks.logout).not.toHaveBeenCalled();
    expect(mocks.clear).toHaveBeenCalled();
  });

  it('does not silently acknowledge logout if proxy revocation failed', async () => {
    mocks.revoke.mockRejectedValue(new Error('Redis unavailable'));
    await expect(
      logoutHandler(createRequest({ headers: {} }), response() as unknown as NextApiResponse)
    ).rejects.toThrow('Redis unavailable');
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it('issues renewal tickets only for the fixed resource callback after main authentication', async () => {
    const res = response();
    const requestId = 'request-1234567890123456';
    await handler(
      createRequest({
        method: 'GET',
        headers: { host: 'localhost:3000', 'sec-fetch-site': 'same-origin' },
        query: {
          sandboxId: scope.sandboxId,
          port: '8090',
          mode: 'renew',
          requestId
        }
      }),
      res as unknown as NextApiResponse
    );
    expect(mocks.grant).toHaveBeenCalledOnce();
    expect(mocks.issue).toHaveBeenCalledWith({
      grant: { userId: 'user-1', ...scope },
      sessionId: 'main-session-1'
    });
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      `http://${scope.proxyHost}/__fastgpt_proxy_session?requestId=${requestId}&__pt=${'a'.repeat(64)}`
    );
  });

  it.each([undefined, 'same-site', 'cross-site', 'none'])(
    'rejects renewal initiated outside the main page: %s',
    async (site) => {
      const res = response();
      await handler(
        createRequest({
          method: 'GET',
          headers: { host: 'localhost:3000', 'sec-fetch-site': site },
          query: {
            sandboxId: scope.sandboxId,
            port: '8090',
            mode: 'renew',
            requestId: 'request-1234567890123456'
          }
        }),
        res as unknown as NextApiResponse
      );
      expect(res.statusCode).toBe(403);
      expect(mocks.issue).not.toHaveBeenCalled();
    }
  );

  it.each([
    { mode: 'renew' },
    { requestId: 'request-1234567890123456' },
    { mode: 'renew', requestId: '<script>alert(1)</script>' },
    { mode: 'renew', requestId: 'request-1234567890123456', next: 'https://evil.example/' },
    { mode: 'renew', requestId: 'x'.repeat(129) }
  ])('rejects invalid renewal input before signing %j', async (query) => {
    const res = response();
    await handler(
      createRequest({
        method: 'GET',
        headers: { host: 'localhost:3000' },
        query: {
          sandboxId: scope.sandboxId,
          port: '8090',
          ...query
        }
      }),
      res as unknown as NextApiResponse
    );
    expect(res.statusCode).toBe(400);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it('passes an existing resource cookie only for an authenticated renewal ticket exchange', async () => {
    const res = response();
    const existingSession = 'c'.repeat(64);
    await handler(
      createRequest({
        method: 'POST',
        headers: {
          'x-fastgpt-proxy-internal': getSandboxProxyInternalSecret(),
          cookie: `fastgpt_sandbox_proxy=${existingSession}`
        },
        socket: { remoteAddress: '127.0.0.1' },
        body: { ...scope, mode: 'renew', ticket: 'a'.repeat(64) }
      }),
      res as unknown as NextApiResponse
    );
    expect(mocks.redeem).toHaveBeenCalledWith(expect.objectContaining({ existingSession }));
  });

  it('rejects renewal without a fresh ticket and never redeems ordinary session requests', async () => {
    const res = response();
    await handler(
      createRequest({
        method: 'POST',
        headers: {
          'x-fastgpt-proxy-internal': getSandboxProxyInternalSecret()
        },
        socket: { remoteAddress: '127.0.0.1' },
        body: { ...scope, mode: 'renew' }
      }),
      res as unknown as NextApiResponse
    );
    expect(res.statusCode).toBe(400);
    expect(mocks.redeem).not.toHaveBeenCalled();
  });
});
