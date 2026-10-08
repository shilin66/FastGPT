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
import { gzipSync, brotliCompressSync, deflateSync } from 'zlib';
import { getSandboxProxyInternalSecret } from '@/service/core/sandbox/proxyUtils';
import * as proxyUtils from '@/service/core/sandbox/proxyUtils';

const fixture = vi.hoisted(() => ({
  dropLoginCookie: false,
  beforeAuth: undefined as undefined | ((scope: any) => Promise<void>),
  connections: [] as { id: string; mode: string }[],
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
  const editorId = 'ed-17810c80-8958-4f5b-9400-92834e7634de';
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
        if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('login form');
          return;
        }
        res.writeHead(302, {
          location: './',
          ...(fixture.dropLoginCookie
            ? {}
            : { 'Set-Cookie': 'code-server-session=editor-key; HttpOnly' })
        });
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
      if (req.url?.endsWith('/compressed.js')) {
        const source = Buffer.from('window.editorReady=true;'.repeat(1000));
        const encoding = req.headers['accept-encoding'] === 'br' ? 'br' : 'gzip';
        const compressed = encoding === 'br' ? brotliCompressSync(source) : gzipSync(source);
        res.writeHead(200, {
          'Content-Type': 'text/javascript',
          'Content-Encoding': encoding,
          'Content-Length': compressed.length,
          Vary: 'Accept-Encoding'
        });
        res.end(req.method === 'HEAD' ? undefined : compressed);
        return;
      }
      if (req.url?.endsWith('/compressed.html')) {
        const source = Buffer.from(
          '<html><head></head><body><script src="./main.js"></script></body></html>'
        );
        const encoding = req.headers['accept-encoding'];
        const compressed =
          encoding === 'br'
            ? brotliCompressSync(source)
            : encoding === 'deflate'
              ? deflateSync(source)
              : gzipSync(source);
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Content-Encoding': encoding ?? 'gzip',
          'Content-Length': compressed.length,
          ETag: 'upstream-html'
        });
        res.end(compressed);
        return;
      }
      if (req.url?.endsWith('/not-modified.js')) {
        res.writeHead(304, { ETag: 'same-asset' });
        res.end();
        return;
      }
      if (req.url?.endsWith('/main.js')) {
        res.setHeader('Content-Type', 'text/javascript');
        res.end('window.editorReady=true');
        return;
      }
      if (req.url?.endsWith('/workbench.web.main.js')) {
        res.setHeader('Content-Type', 'text/javascript');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
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
      if (
        !['/api/core/sandbox/proxyAuth', '/api/core/sandbox/proxyCSPassword'].includes(
          req.url ?? ''
        )
      ) {
        res.end('main app');
        return;
      }
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', async () => {
        const scope = JSON.parse(body);
        if (scope.connection) fixture.connections.push(scope.connection);
        await fixture.beforeAuth?.(scope);
        const allowed =
          req.headers['x-fastgpt-proxy-internal'] === getSandboxProxyInternalSecret() &&
          scope.proxyHost === new URL(origin).host &&
          ['sandbox-12345678', editorId].includes(scope.sandboxId) &&
          scope.targetPort === 8090 &&
          (scope.ticket === ticket ||
            req.headers.cookie?.includes(`fastgpt_sandbox_proxy=${session}`));
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = allowed ? 200 : 401;
        res.end(
          JSON.stringify(
            allowed
              ? req.url === '/api/core/sandbox/proxyCSPassword'
                ? { password: 'test-only-password' }
                : {
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
    expect(lastUpstream.headers.cookie).toBe('code-server-session=editor-key');
    expect(lastUpstream.headers.authorization).toBeUndefined();
    expect(lastUpstream.url).toBe('/sandboxes/provider/proxy/44772/proxy/8080/');
    const asset = await fetch(`${origin}${prefix}/proxy/8080/main.js`, { headers: { cookie } });
    expect(await asset.text()).toBe('window.editorReady=true');
    expect(asset.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('caches only versioned built-in code-server assets after proxy authorization', async () => {
    const path = `${prefix}/proxy/8080/stable-0123456789abcdef0123456789abcdef01234567/static/out/vs/workbench/workbench.web.main.js`;
    const asset = await fetch(`${origin}${path}`, { headers: { cookie } });
    expect(asset.status).toBe(200);
    expect(asset.headers.get('cache-control')).toBe('private, max-age=31536000');
    expect((await fetch(`${origin}${path}`)).status).toBe(401);
    const workspace = await fetch(
      `${origin}${prefix}/proxy/8080/vscode-remote-resource?path=/workspace/workbench.web.main.js`,
      { headers: { cookie } }
    );
    expect(workspace.headers.get('cache-control')).toBe('no-store');
  });

  it.each(['gzip', 'br'])(
    'preserves %s bytes and headers for static resources',
    async (encoding) => {
      const expected =
        encoding === 'br'
          ? brotliCompressSync(Buffer.from('window.editorReady=true;'.repeat(1000)))
          : gzipSync(Buffer.from('window.editorReady=true;'.repeat(1000)));
      const response = await new Promise<{ headers: IncomingHttpHeaders; body: Buffer }>(
        (resolve, reject) => {
          const req = request(
            `${origin}${prefix}/proxy/8080/compressed.js`,
            {
              headers: { cookie, 'accept-encoding': encoding }
            },
            (res) => {
              const chunks: Buffer[] = [];
              res.on('data', (chunk) => chunks.push(chunk));
              res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
              res.on('error', reject);
            }
          );
          req.on('error', reject);
          req.end();
        }
      );
      console.info('static transfer bytes', {
        encoding,
        actual: response.body.length,
        compressed: expected.length,
        original: 24000
      });
      expect(response.headers['content-encoding']).toBe(encoding);
      expect(response.headers['content-length']).toBe(String(expected.length));
      expect(response.headers.vary).toBe('Accept-Encoding');
      expect(response.body).toEqual(expected);
    }
  );

  it.each(['gzip', 'br', 'deflate'])('decodes %s HTML before path rewriting', async (encoding) => {
    const response = await fetch(`${origin}${prefix}/proxy/8080/compressed.html`, {
      headers: { cookie, 'accept-encoding': encoding }
    });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain(`<base href="${prefix}/proxy/8080/">`);
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('content-length')).toBe(String(Buffer.byteLength(html)));
    expect(response.headers.get('etag')).toBeNull();
  });

  it('preserves HEAD representation metadata and bodyless 304 responses', async () => {
    const head = await fetch(`${origin}${prefix}/proxy/8080/compressed.js`, {
      method: 'HEAD',
      headers: { cookie, 'accept-encoding': 'gzip' }
    });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-encoding')).toBe('gzip');
    expect(head.headers.get('content-length')).toBe('122');
    expect(await head.text()).toBe('');
    const unchanged = await fetch(`${origin}${prefix}/proxy/8080/not-modified.js`, {
      headers: { cookie }
    });
    expect(unchanged.status).toBe(304);
    expect(unchanged.headers.get('etag')).toBe('same-asset');
    expect(await unchanged.text()).toBe('');
  });

  it('keeps unauthorized cookies and origins separate during concurrent requests', async () => {
    fixture.beforeAuth = async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    };
    try {
      const responses = await Promise.all([
        fetch(`${origin}${prefix}/proxy/8080/main.js`, { headers: { cookie } }),
        fetch(`${origin}${prefix}/proxy/8080/main.js`, {
          headers: { cookie: 'fastgpt_sandbox_proxy=invalid' }
        }),
        fetch(`${origin}${prefix}/proxy/8080/main.js`, {
          headers: { cookie, origin: 'http://attacker.invalid' }
        })
      ]);
      expect(responses.map((res) => res.status)).toEqual([200, 401, 403]);
      await Promise.all(responses.map((res) => res.text()));
    } finally {
      fixture.beforeAuth = undefined;
    }
  });

  it('coalesces concurrent session authorization and rechecks subsequent requests', async () => {
    let checks = 0;
    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const observe = (req: IncomingMessage) => {
      if (req.url === '/proxy/8080/main.js' && ++arrivals === 12) release();
    };
    app.on('request', observe);
    fixture.beforeAuth = async () => {
      checks++;
      await gate;
    };
    try {
      const responses = await Promise.all(
        Array.from({ length: 12 }, () =>
          fetch(`${origin}${prefix}/proxy/8080/main.js`, { headers: { cookie } })
        )
      );
      await Promise.all(responses.map((res) => res.text()));
      console.info('concurrent authorization calls', checks);
      expect(responses.every((res) => res.status === 200)).toBe(true);
      expect(checks).toBe(1);
      await (await fetch(`${origin}${prefix}/proxy/8080/main.js`, { headers: { cookie } })).text();
      expect(checks).toBe(2);
    } finally {
      release();
      app.off('request', observe);
      fixture.beforeAuth = undefined;
    }
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
    expect(lastUpstream.headers.cookie).toBe('code-server-session=editor-key');
    expect(lastUpstream.headers.origin).toBeUndefined();
  });

  it('fails HTTP promptly instead of forwarding without an upstream login cookie', async () => {
    fixture.dropLoginCookie = true;
    proxyUtils.deleteCsSession('sandbox-12345678');
    try {
      const response = await fetch(`${origin}${prefix}/proxy/8080/main.js`, {
        headers: { cookie }
      });
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain('window.editorReady');
      expect(lastUpstream.url).toContain('/login');
    } finally {
      fixture.dropLoginCookie = false;
      proxyUtils.deleteCsSession('sandbox-12345678');
    }
  });

  it('rejects WebSocket upgrade when upstream authentication fails', async () => {
    fixture.dropLoginCookie = true;
    proxyUtils.deleteCsSession(editorId);
    try {
      const status = await new Promise<number | undefined>((resolve, reject) => {
        const req = request(`${origin}/absproxy/${editorId}/8090/proxy/8080/`, {
          headers: {
            cookie,
            Connection: 'Upgrade',
            Upgrade: 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': '13'
          }
        });
        req.on('response', (res) => {
          res.resume();
          resolve(res.statusCode);
        });
        req.on('error', reject);
        req.on('upgrade', (_res, socket) => {
          socket.destroy();
          reject(new Error('Unexpected upgrade'));
        });
        req.end();
      });
      expect(status).toBe(502);
    } finally {
      fixture.dropLoginCookie = false;
      proxyUtils.deleteCsSession(editorId);
    }
  });

  it('does not start a renewal timer when an editor socket closes during authorization', async () => {
    let incoming!: import('stream').Duplex;
    app.once('upgrade', (_request, socket) => {
      incoming = socket;
    });
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fixture.connections = [];
    fixture.beforeAuth = async (scope) => {
      if (scope.connection?.mode === 'open') {
        entered();
        await gate;
      }
    };
    const watcher = vi.spyOn(proxyUtils, 'watchSandboxProxySession');
    const req = request(`${origin}/absproxy/${editorId}/8090/proxy/8080/`, {
      headers: {
        cookie,
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version': '13'
      }
    });
    req.on('error', () => {});
    req.end();
    try {
      await started;
      incoming.destroy();
      req.destroy();
      await new Promise((resolve) => setTimeout(resolve, 30));
      release();
      await vi.waitFor(() => {
        expect(fixture.connections.filter((x) => x.mode === 'close').length).toBeGreaterThanOrEqual(
          2
        );
      });
      expect(watcher).not.toHaveBeenCalled();
    } finally {
      release();
      fixture.beforeAuth = undefined;
      watcher.mockRestore();
    }
  });
});
