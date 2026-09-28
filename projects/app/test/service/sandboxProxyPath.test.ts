import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSandboxProxyOrigins,
  getSandboxProxyBasePath,
  getSandboxProxyRedirect,
  getSandboxProxySessionCookie,
  rewriteHtml
} from '@/service/core/sandbox/proxyUtils';

describe('explicit same-origin IP path deployment', () => {
  const origin = 'http://192.0.2.10:38026';
  const scope = { sandboxId: 'sandbox-12345678', targetPort: 8090, host: '192.0.2.10:38026' };
  const prefix = '/absproxy/sandbox-12345678/8090';

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AGENT_SANDBOX_PROXY_MODE', 'ip-path');
    vi.stubEnv('AGENT_SANDBOX_PROXY_APP_ORIGIN', origin);
    vi.stubEnv('AGENT_SANDBOX_PROXY_BASE_URL', origin);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('keeps the IP, HTTP scheme and app port without adding a DNS label', () => {
    expect(getSandboxProxyOrigins(scope)).toEqual({ appOrigin: origin, audience: origin });
    expect(getSandboxProxyRedirect(scope).href).toBe(`${origin}${prefix}/proxy/8080/`);
  });

  it('keeps HTTPS/subdomain validation when the mode is not explicitly enabled', () => {
    vi.stubEnv('AGENT_SANDBOX_PROXY_MODE', '');
    expect(() => getSandboxProxyOrigins(scope)).toThrow('Invalid proxy origin configuration');
    expect(getSandboxProxyBasePath(scope)).toBe('');
  });

  it.each(['http://192.0.2.10:38027', 'http://other.example', `${origin}/api`, `${origin}?q=x`])(
    'rejects a mismatched or non-origin proxy setting %s',
    (proxy) => {
      vi.stubEnv('AGENT_SANDBOX_PROXY_BASE_URL', proxy);
      expect(() => getSandboxProxyOrigins(scope)).toThrow();
    }
  );

  it.each([
    '/api/support/user/account/loginout',
    '/absproxy/another-sandbox/8090/proxy/8080/',
    `${prefix}/__fastgpt_proxy_session`,
    `${prefix}/proxy/8080/../../../execute`,
    `${prefix}/proxy/8080/%252e%252e/execute`,
    'http://other.example/'
  ])('rejects next outside this editor: %s', (next) => {
    expect(() => getSandboxProxyRedirect({ ...scope, next })).toThrow();
  });

  it('preserves editor queries and removes only the bootstrap ticket', () => {
    expect(
      getSandboxProxyRedirect({
        ...scope,
        next: `${prefix}/proxy/8080/?folder=/workspace&__pt=old`
      }).href
    ).toBe(`${origin}${prefix}/proxy/8080/?folder=%2Fworkspace`);
  });

  it('scopes HTTP cookies to one resource and generation, while HTTPS retains Secure', () => {
    const cookie = getSandboxProxySessionCookie({
      session: 'secret',
      basePath: prefix,
      appOrigin: origin
    });
    expect(cookie).toContain(`Path=${prefix}/; HttpOnly; SameSite=Strict`);
    expect(cookie).not.toContain('Secure');
    expect(
      getSandboxProxySessionCookie({
        session: 'secret',
        basePath: prefix,
        appOrigin: 'https://app.example'
      })
    ).toContain('; Secure;');
    expect(
      getSandboxProxySessionCookie({
        session: 'secret',
        basePath: '',
        appOrigin: 'https://app.example'
      })
    ).toContain('Path=/; HttpOnly; SameSite=None; Secure;');
    expect(getSandboxProxyBasePath({ ...scope, sandboxId: 'sandbox-87654321' })).not.toBe(prefix);
  });

  it('retains the execd editor prefix for relative scripts and root-relative assets', () => {
    const html =
      '<html><head></head><body><script src="stable/main.js"></script><img src="/_static/icon.svg"><a href="/proxy/8080/login">login</a></body></html>';
    const rewritten = rewriteHtml(html, prefix, `${prefix}/proxy/8080/?folder=/workspace`);
    expect(rewritten).toContain(`<base href="${prefix}/proxy/8080/">`);
    expect(rewritten).toContain('src="stable/main.js"');
    expect(rewritten).toContain(`src="${prefix}/proxy/8080/_static/icon.svg"`);
    expect(rewritten).toContain(`href="${prefix}/proxy/8080/login"`);
  });
});
