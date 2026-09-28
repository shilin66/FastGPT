import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createServer,
  request,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'http';
import { once } from 'events';
import { createHash } from 'crypto';
import { getSandboxProxyInternalSecret } from '@/service/core/sandbox/proxyUtils';

const fixture = vi.hoisted(() => ({
  handler: (_req: IncomingMessage, res: ServerResponse) => {
    res.end();
  }
}));
vi.mock('next', () => ({
  default: () => ({
    prepare: async () => {},
    getRequestHandler: () => fixture.handler,
    getUpgradeHandler: () => () => {}
  })
}));

describe('IP path proxy over real HTTP and WebSocket connections', () => {
  let upstream: Server;
  let app: Server;
  let origin: string;
  let target: string;
  let lastUpstream: { url?: string; headers: IncomingHttpHeaders };
  const prefix = '/absproxy/sandbox-12345678/8090';
  const session = 'b'.repeat(64);
  const cookie = `fastgpt_sandbox_proxy=${session}; fastgpt_token=main-secret`;
  const ticket = 'a'.repeat(64);
  const portOf = (server: Server) => {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No TCP listener');
    return address.port;
  };
  const listen = async (server: Server) => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
  };

  beforeAll(async () => {
    upstream = createServer((req, res) => {
      lastUpstream = { url: req.url, headers: req.headers };
      if (req.url?.endsWith('/login')) {
        res.writeHead(302, { location: './' });
        res.end();
        return;
      }
      if (req.url?.endsWith('/redirect')) {
        res.writeHead(302, { location: './?folder=/workspace' });
        res.end();
        return;
      }
      if (req.url?.endsWith('/post')) {
        req.pipe(res);
        return;
      }
      if (req.url?.endsWith('/main.js')) {
        res.setHeader('Content-Type', 'text/javascript');
        res.end('window.editorReady=true');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'X-Frame-Options': 'DENY',
        'Set-Cookie': ['fastgpt_token=attacker; Path=/', 'theme=dark; Domain=upstream; Path=/']
      });
      res.end('<html><head></head><body><script src="./main.js"></script></body></html>');
    });
    upstream.on('upgrade', (req, socket) => {
      lastUpstream = { url: req.url, headers: req.headers };
      const accept = createHash('sha1')
        .update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest('base64');
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`
      );
      socket.once('data', () => socket.end(Buffer.from([0x81, 2, 111, 107])));
    });
    await listen(upstream);
    target = `http://127.0.0.1:${portOf(upstream)}/sandboxes/provider/proxy/44772`;
    const reserve = createServer();
    await listen(reserve);
    const appPort = portOf(reserve);
    await new Promise<void>((resolve) => reserve.close(() => resolve()));
    origin = `http://127.0.0.1:${appPort}`;
    vi.stubEnv('PORT', String(appPort));
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AGENT_SANDBOX_PROXY_MODE', 'ip-path');
    vi.stubEnv('AGENT_SANDBOX_PROXY_APP_ORIGIN', origin);
    vi.stubEnv('AGENT_SANDBOX_PROXY_BASE_URL', origin);
    fixture.handler = (req, res) => {
      if (req.url !== '/api/core/sandbox/proxyAuth') {
        res.end('main app');
        return;
      }
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const scope = JSON.parse(body);
        const allowed =
          req.headers['x-fastgpt-proxy-internal'] === getSandboxProxyInternalSecret() &&
          scope.proxyHost === new URL(origin).host &&
          scope.sandboxId === 'sandbox-12345678' &&
          scope.targetPort === 8090 &&
          (scope.ticket === ticket ||
            req.headers.cookie?.includes(`fastgpt_sandbox_proxy=${session}`));
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = allowed ? 200 : 401;
        res.end(
          JSON.stringify(
            allowed
              ? {
                  target,
                  appOrigin: origin,
                  ...(scope.ticket ? { session, expiresAt: Date.now() + 900_000 } : {})
                }
              : { code: 401 }
          )
        );
      });
    };
    const { startServer } = await import('../../server');
    app = await startServer();
    if (!app.listening) await once(app, 'listening');
  });

  afterAll(async () => {
    for (const server of [app, upstream]) {
      server?.closeAllConnections();
      if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    vi.unstubAllEnvs();
  });

  it('exchanges the ticket, sets a path cookie and redirects with the full prefix', async () => {
    const response = await fetch(
      `${origin}${prefix}/proxy/8080/?__pt=${ticket}&folder=/workspace`,
      { redirect: 'manual' }
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${prefix}/proxy/8080/?folder=%2Fworkspace`);
    expect(response.headers.get('set-cookie')).toContain(
      `Path=${prefix}/; HttpOnly; SameSite=Strict`
    );
    expect(response.headers.get('set-cookie')).not.toContain('Secure');
  });

  it('renews through the path-scoped callback without forwarding the ticket upstream', async () => {
    const response = await fetch(
      `${origin}${prefix}/__fastgpt_proxy_session?__pt=${ticket}&requestId=request-1234567890123456`,
      { headers: { cookie } }
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('window.parent.postMessage');
    expect(response.headers.get('set-cookie')).toContain(`Path=${prefix}/`);
  });

  it('serves the editor and assets while stripping app credentials and constraining upstream cookies', async () => {
    const response = await fetch(`${origin}${prefix}/proxy/8080/`, {
      headers: { cookie, authorization: 'Bearer main-secret' }
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(`<base href="${prefix}/proxy/8080/">`);
    expect(response.headers.get('x-frame-options')).toBeNull();
    expect(response.headers.get('content-security-policy')).toContain(origin);
    expect(response.headers.get('set-cookie')).toBe(`theme=dark; Path=${prefix}/`);
    expect(lastUpstream.headers.cookie).toBeUndefined();
    expect(lastUpstream.headers.authorization).toBeUndefined();
    expect(lastUpstream.url).toBe('/sandboxes/provider/proxy/44772/proxy/8080/');
    const asset = await fetch(`${origin}${prefix}/proxy/8080/main.js`, { headers: { cookie } });
    expect(await asset.text()).toBe('window.editorReady=true');
  });

  it('rewrites upstream redirects back into the same editor path', async () => {
    const response = await fetch(`${origin}${prefix}/proxy/8080/redirect`, {
      headers: { cookie },
      redirect: 'manual'
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${prefix}/proxy/8080/?folder=/workspace`);
  });

  it('preserves request bodies for editor file operations', async () => {
    const response = await fetch(`${origin}${prefix}/proxy/8080/post`, {
      method: 'POST',
      headers: { cookie, origin },
      body: 'editor-body'
    });
    expect(await response.text()).toBe('editor-body');
    expect(lastUpstream.headers.origin).toBe(new URL(target).origin);
  });

  it('rejects unauthenticated assets, other resources and non-editor gateway paths', async () => {
    expect((await fetch(`${origin}${prefix}/proxy/8080/main.js`)).status).toBe(401);
    expect(
      (
        await fetch(`${origin}/absproxy/another-sandbox/8090/proxy/8080/main.js`, {
          headers: { cookie }
        })
      ).status
    ).toBe(401);
    expect((await fetch(`${origin}${prefix}/execute`, { headers: { cookie } })).status).toBe(403);
    expect((await fetch(`${origin}/absproxy/sandbox-12345678/999999/proxy/8080/`)).status).toBe(
      400
    );
    expect(await (await fetch(`${origin}/`)).text()).toBe('main app');
  });

  it('upgrades an authenticated WebSocket with the prefix stripped and credentials removed', async () => {
    const result = await new Promise<Buffer>((resolve, reject) => {
      const req = request(`${origin}${prefix}/proxy/8080/?reconnectionToken=test`, {
        headers: {
          cookie,
          origin,
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '13'
        }
      });
      req.on('error', reject);
      req.on('response', (res) => reject(new Error(`Upgrade returned ${res.statusCode}`)));
      req.on('upgrade', (_res, socket) => {
        socket.once('data', (chunk) => {
          resolve(chunk);
          socket.destroy();
        });
        socket.on('error', reject);
        socket.write(Buffer.from([0x81, 0x82, 1, 2, 3, 4, 105, 107]));
      });
      req.end();
    });
    expect(result).toEqual(Buffer.from([0x81, 2, 111, 107]));
    expect(lastUpstream.url).toBe(
      '/sandboxes/provider/proxy/44772/proxy/8080/?reconnectionToken=test'
    );
    expect(lastUpstream.headers.cookie).toBeUndefined();
    expect(lastUpstream.headers.origin).toBeUndefined();
  });
});
