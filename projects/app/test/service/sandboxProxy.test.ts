import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  parseSubdomainProxy,
  rewriteHtml,
  resolveSandboxProxyTarget,
  getSandboxProxyOrigins,
  getSandboxProxyRedirect,
  getSandboxProxyContentSecurityPolicy,
  stripFastGPTCredentials
} from '@/service/core/sandbox/proxyUtils';
import {
  assertSandboxProxyPath,
  assertSandboxProxyInternalRequest,
  getSandboxProxyInternalSecret,
  watchSandboxProxySession
} from '@/service/core/sandbox/proxyUtils';
import type { IncomingHttpHeaders } from 'http';
import { SandboxProtocolEnum } from '@fastgpt/global/core/agentSkills/constants';

describe('proxy upstream credentials', () => {
  it('removes app credentials while retaining sandbox cookies', () => {
    const headers: IncomingHttpHeaders = {
      authorization: 'Bearer app-api-key',
      cookie: 'fastgpt_token=app-session; theme=dark; code-server-session=editor-session'
    };
    stripFastGPTCredentials(headers);
    expect(headers).toEqual({ cookie: 'theme=dark; code-server-session=editor-session' });
  });

  it('drops an empty cookie header', () => {
    const headers: IncomingHttpHeaders = { cookie: 'fastgpt_token=app-session' };
    stripFastGPTCredentials(headers);
    expect(headers).toEqual({});
  });

  it('strips every app and resource credential, including custom token headers', () => {
    const headers: IncomingHttpHeaders = {
      authorization: 'secret',
      token: 'secret',
      rootkey: 'secret',
      'proxy-authorization': 'secret',
      'x-fastgpt-proxy-internal': 'secret',
      cookie: 'fastgpt_token=secret; fastgpt_sandbox_proxy=secret; theme=dark'
    };
    stripFastGPTCredentials(headers);
    expect(headers).toEqual({ cookie: 'theme=dark' });
  });
});

describe('sandbox proxy endpoint routing', () => {
  const endpoint = {
    host: '192.168.110.64',
    port: 8090,
    protocol: SandboxProtocolEnum.http,
    url: 'http://192.168.110.64:8090/sandboxes/provider-id/proxy/44772'
  };

  it('preserves the complete server-proxy endpoint path', () => {
    expect(resolveSandboxProxyTarget(endpoint, 8090)).toBe(endpoint.url);
  });

  it('does not turn another port into a request to the gateway management API', () => {
    expect(() => resolveSandboxProxyTarget(endpoint, 8080)).toThrow('Unsupported proxy port');
  });

  it('only permits the declared endpoint port for direct endpoints too', () => {
    expect(() =>
      resolveSandboxProxyTarget({ ...endpoint, url: 'http://192.168.110.64:8090' }, 8080)
    ).toThrow('Unsupported proxy port');
  });

  it.each([0, 65536, NaN, 80.5])('rejects invalid port %s', (port) => {
    expect(() => resolveSandboxProxyTarget(endpoint, port)).toThrow('Invalid port');
  });

  it('fails closed when the endpoint is unavailable', () => {
    expect(() => resolveSandboxProxyTarget(undefined, 8090)).toThrow(
      'Sandbox endpoint unavailable'
    );
  });

  it('builds an independent local resource origin instead of an identifier-only auth cache', () => {
    expect(
      getSandboxProxyOrigins({
        sandboxId: 'proxy-endpoint-test',
        targetPort: 8090,
        host: 'localhost:3000'
      })
    ).toEqual({
      appOrigin: 'http://localhost:3000',
      audience: 'http://8090--proxy-endpoint-test.localhost:3000'
    });
  });
});

describe('Sandbox proxy redirect scope', () => {
  const scope = { sandboxId: 'sandbox-12345678', targetPort: 8090, host: 'localhost:3000' };
  it('builds the editor path without a client-supplied next URL', () => {
    expect(getSandboxProxyRedirect(scope).toString()).toBe(
      'http://8090--sandbox-12345678.localhost:3000/proxy/8080/'
    );
  });
  it.each([
    'http://evil.localhost:3000/',
    'http://localhost:3000/',
    'http://8080--sandbox-12345678.localhost:3000/'
  ])('rejects other audience %s', (next) => {
    expect(() => getSandboxProxyRedirect({ ...scope, next })).toThrow('Invalid next URL');
  });
  it('rejects unconfigured non-local hosts', () => {
    expect(() => getSandboxProxyOrigins({ ...scope, host: 'app.example.com' })).toThrow(
      'Proxy origin configuration required'
    );
  });
});

describe('Sandbox proxy frame ancestors', () => {
  it.each(['http://localhost:3000', 'https://app.example.com'])(
    'permits the editor nested worker frame and only the exact trusted main origin %s',
    (appOrigin) => {
      expect(getSandboxProxyContentSecurityPolicy(appOrigin)).toBe(
        `frame-ancestors 'self' ${appOrigin}; object-src 'none'; base-uri 'self'`
      );
    }
  );
});

describe('Sandbox proxy blank origin configuration', () => {
  const scope = { sandboxId: 'sandbox-12345678', targetPort: 8090, host: 'localhost:3000' };
  let originalEnv: Record<string, string | undefined>;
  beforeEach(() => {
    originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      AGENT_SANDBOX_PROXY_APP_ORIGIN: process.env.AGENT_SANDBOX_PROXY_APP_ORIGIN,
      AGENT_SANDBOX_PROXY_BASE_URL: process.env.AGENT_SANDBOX_PROXY_BASE_URL
    };
    vi.stubEnv('PORT', '3000');
  });
  afterEach(() => {
    for (const [name, value] of Object.entries(originalEnv)) vi.stubEnv(name, value);
  });
  it.each(['', ' \t '])('uses the local development default for blank values %j', (value) => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AGENT_SANDBOX_PROXY_APP_ORIGIN', value);
    vi.stubEnv('AGENT_SANDBOX_PROXY_BASE_URL', value);
    expect(getSandboxProxyOrigins(scope)).toEqual({
      appOrigin: 'http://localhost:3000',
      audience: 'http://8090--sandbox-12345678.localhost:3000'
    });
  });
  it.each(['', ' \t '])('still rejects blank production values %j on localhost', (value) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AGENT_SANDBOX_PROXY_APP_ORIGIN', value);
    vi.stubEnv('AGENT_SANDBOX_PROXY_BASE_URL', value);
    expect(() => getSandboxProxyOrigins(scope)).toThrow('Proxy origin configuration required');
  });
  it('preserves explicit production origins', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AGENT_SANDBOX_PROXY_APP_ORIGIN', 'https://app.example.com');
    vi.stubEnv('AGENT_SANDBOX_PROXY_BASE_URL', 'https://preview.example.net');
    expect(getSandboxProxyOrigins({ ...scope, host: 'app.example.com' })).toEqual({
      appOrigin: 'https://app.example.com',
      audience: 'https://8090--sandbox-12345678.preview.example.net'
    });
  });
});

describe('Sandbox gateway path and RPC boundary', () => {
  const target = 'http://gateway:8090/sandboxes/provider/proxy/44772';
  it('permits editor assets and query paths', () => {
    expect(() =>
      assertSandboxProxyPath({
        target,
        path: '/proxy/8080/stable/static/main.js?path=%2Fworkspace'
      })
    ).not.toThrow();
  });
  it.each([
    '/execute',
    '/proxy/3000/',
    '/proxy/8080/../../execute',
    '/proxy/8080/%2e%2e/execute',
    '/proxy/8080/%252e%252e/',
    '/proxy/8080\\../'
  ])('rejects editor port bypass %s', (path) => {
    expect(() => assertSandboxProxyPath({ target, path })).toThrow('Unsupported proxy path');
  });
  it('does not treat a loopback address as an RPC credential', () => {
    expect(() =>
      assertSandboxProxyInternalRequest({ headers: {}, remoteAddress: '127.0.0.1' })
    ).toThrow('Unauthorized');
  });
  it('requires both the process secret and loopback source', () => {
    const headers = { 'x-fastgpt-proxy-internal': getSandboxProxyInternalSecret() };
    expect(() =>
      assertSandboxProxyInternalRequest({ headers, remoteAddress: '127.0.0.1' })
    ).not.toThrow();
    expect(() =>
      assertSandboxProxyInternalRequest({ headers, remoteAddress: '192.168.1.1' })
    ).toThrow('Unauthorized');
  });
});

describe('established WebSocket / TCP resource authorization', () => {
  it('closes an established connection when its resource authorization expires or is revoked', async () => {
    vi.useFakeTimers();
    const verify = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    const stop = watchSandboxProxySession({ verify, close });
    try {
      await vi.advanceTimersByTimeAsync(10_000);
      expect(verify).toHaveBeenCalledTimes(1);
      expect(close).not.toHaveBeenCalled();
      verify.mockRejectedValue(new Error('revoked'));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(close).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(verify).toHaveBeenCalledTimes(2);
    } finally {
      stop();
      vi.useRealTimers();
    }
  });
});

describe('parseSubdomainProxy', () => {
  it('returns null for undefined host', () => {
    expect(parseSubdomainProxy(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSubdomainProxy('')).toBeNull();
  });

  it('returns null for plain localhost', () => {
    expect(parseSubdomainProxy('localhost:3000')).toBeNull();
  });

  it('returns null for normal domain without port-sandboxId prefix', () => {
    expect(parseSubdomainProxy('example.com')).toBeNull();
    expect(parseSubdomainProxy('app.example.com')).toBeNull();
  });

  it('parses valid subdomain with host port', () => {
    expect(parseSubdomainProxy('5000-abcdefgh1234.localhost:3000')).toEqual({
      port: 5000,
      sandboxId: 'abcdefgh1234'
    });
  });

  it('parses valid subdomain without host port', () => {
    expect(parseSubdomainProxy('8080-abc123defabc1.example.com')).toEqual({
      port: 8080,
      sandboxId: 'abc123defabc1'
    });
  });

  it('parses 16-char sandboxId', () => {
    expect(parseSubdomainProxy('3000-a1b2c3d4e5f6g7h8.localhost')).toEqual({
      port: 3000,
      sandboxId: 'a1b2c3d4e5f6g7h8'
    });
  });

  it('returns null when sandboxId is shorter than 8 chars', () => {
    expect(parseSubdomainProxy('5000-short.localhost')).toBeNull();
  });

  it('returns null when sandboxId is longer than 32 chars', () => {
    expect(
      parseSubdomainProxy('5000-averylongsandboxidthatexceedsthethirtytwocharacterlimit.localhost')
    ).toBeNull();
  });

  it('returns null for port 0', () => {
    expect(parseSubdomainProxy('0-abcdefgh1234.localhost')).toBeNull();
  });

  it('returns null for port > 65535', () => {
    expect(parseSubdomainProxy('99999-abcdefgh1234.localhost')).toBeNull();
  });

  it('returns null for port 65535 boundary', () => {
    expect(parseSubdomainProxy('65535-abcdefgh1234.localhost')).toEqual({
      port: 65535,
      sandboxId: 'abcdefgh1234'
    });
  });

  it('returns null for port 65536 (just over boundary)', () => {
    expect(parseSubdomainProxy('65536-abcdefgh1234.localhost')).toBeNull();
  });

  // double-hyphen format (sandboxId with hyphens)
  it('double-hyphen: parses UUID sandboxId', () => {
    const result = parseSubdomainProxy('55914--a535c42a-9c94-4aa3-8953-db78bb96d56b.example.com');
    expect(result).toEqual({ port: 55914, sandboxId: 'a535c42a-9c94-4aa3-8953-db78bb96d56b' });
  });

  it('double-hyphen: parses the canonical 55-character identity', () => {
    const sandboxId = `sbx-v2-${'a'.repeat(48)}`;
    expect(parseSubdomainProxy(`8090--${sandboxId}.localhost:3000`)).toEqual({
      port: 8090,
      sandboxId
    });
  });

  it('double-hyphen: parses with host port suffix', () => {
    const result = parseSubdomainProxy(
      '55914--a535c42a-9c94-4aa3-8953-db78bb96d56b.example.com:3000'
    );
    expect(result).toEqual({ port: 55914, sandboxId: 'a535c42a-9c94-4aa3-8953-db78bb96d56b' });
  });

  it('double-hyphen: returns null if sandboxId starts with hyphen', () => {
    expect(parseSubdomainProxy('55914---bad-id.example.com')).toBeNull();
  });

  it('double-hyphen: returns null if sandboxId ends with hyphen', () => {
    expect(parseSubdomainProxy('55914--a535c42a-.example.com')).toBeNull();
  });

  // legacy single-hyphen format still works
  it('legacy: still parses alphanumeric sandboxId', () => {
    const result = parseSubdomainProxy('55914-a535c42a9c944aa38953db78bb96d56b.example.com');
    expect(result).toEqual({ port: 55914, sandboxId: 'a535c42a9c944aa38953db78bb96d56b' });
  });
});

describe('rewriteHtml', () => {
  const basePath = '/absproxy/abc123def456/5000';

  it('injects <base> tag right after <head> opening tag', () => {
    const html = '<html><head><title>Test</title></head><body></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain(`<head><base href="${basePath}/">`);
  });

  it('handles <head> with attributes', () => {
    const html = '<html><head lang="en"><title>Test</title></head><body></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain(`<head lang="en"><base href="${basePath}/">`);
  });

  it('rewrites absolute src paths', () => {
    const html = '<html><head></head><body><script src="/app.js"></script></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain(`src="${basePath}/app.js"`);
  });

  it('rewrites absolute href paths', () => {
    const html = '<html><head><link href="/style.css"></head><body></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain(`href="${basePath}/style.css"`);
  });

  it('rewrites action attributes', () => {
    const html = '<html><head></head><body><form action="/submit"></form></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain(`action="${basePath}/submit"`);
  });

  it('does not rewrite protocol-relative URLs (//)', () => {
    const html = '<html><head></head><body><a href="//example.com">x</a></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain('href="//example.com"');
  });

  it('does not rewrite relative paths', () => {
    const html = '<html><head></head><body><a href="relative/path">x</a></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain('href="relative/path"');
  });

  it('rewrites url() in inline CSS with absolute paths', () => {
    const html = '<html><head></head><body style="background: url(/img.png)"></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain(`url(${basePath}/img.png)`);
  });

  it('rewrites url() with quoted paths', () => {
    const html = '<html><head></head><body style="background: url(\'/img.png\')"></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain(`url('${basePath}/img.png')`);
  });

  it('does not rewrite url() with protocol-relative paths', () => {
    const html =
      '<html><head></head><body style="background: url(//example.com/img.png)"></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain('url(//example.com/img.png)');
  });

  it('rewrites multiple occurrences', () => {
    const html = '<html><head></head><body><img src="/a.png"><img src="/b.png"></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain(`src="${basePath}/a.png"`);
    expect(result).toContain(`src="${basePath}/b.png"`);
  });
});
