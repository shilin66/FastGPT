import { describe, expect, it } from 'vitest';
import { Script, createContext } from 'node:vm';
import {
  getSandboxProxyRenewalResponse,
  parseSandboxProxyRenewalRequest
} from '@/service/core/sandbox/proxyRenewal';

describe('Sandbox renewal callback', () => {
  const requestId = 'request-1234567890123456';
  const ticket = 'a'.repeat(64);
  const url = `/__fastgpt_proxy_session?requestId=${requestId}&__pt=${ticket}`;

  it('requires a GET request with one nonce and one fresh ticket', () => {
    expect(parseSandboxProxyRenewalRequest({ method: 'GET', url })).toEqual({ requestId, ticket });
    for (const input of [
      { method: 'POST', url },
      { method: 'GET', url: '/__fastgpt_proxy_session' },
      { method: 'GET', url: `/__fastgpt_proxy_session?requestId=${requestId}` },
      { method: 'GET', url: `${url}&requestId=${requestId}` },
      { method: 'GET', url: `${url}&__pt=${ticket}` },
      { method: 'GET', url: `${url}&next=https://evil.example` }
    ])
      expect(() => parseSandboxProxyRenewalRequest(input)).toThrow();
  });

  it('returns only a nonce-protected parent message with the recorded expiration', () => {
    const expiresAt = Date.now() + 900_000;
    const response = getSandboxProxyRenewalResponse({
      requestId,
      expiresAt,
      appOrigin: 'https://app.example'
    });
    expect(response.headers['Cache-Control']).toBe('no-store');
    expect(response.headers['Referrer-Policy']).toBe('no-referrer');
    expect(response.headers['Content-Security-Policy']).toMatch(
      /^default-src 'none'; script-src 'nonce-[a-zA-Z0-9+/=]+'; frame-ancestors https:\/\/app.example; base-uri 'none'; form-action 'none'$/
    );
    const script = response.body.match(/<script nonce="([a-zA-Z0-9+/=]+)">([^]*?)<\/script>/);
    expect(script).not.toBeNull();
    expect(response.headers['Content-Security-Policy']).toContain(`'nonce-${script![1]}'`);
    const messages: unknown[] = [];
    const context = createContext({
      window: { parent: { postMessage: (...args: unknown[]) => messages.push(args) } }
    });
    new Script(script![2]).runInContext(context, { timeout: 100 });
    expect(messages).toEqual([
      [{ type: 'fastgpt:sandbox-session', requestId, expiresAt }, 'https://app.example']
    ]);
    expect(response.body).not.toContain(ticket);
    expect(response.body).not.toContain('fastgpt_sandbox_proxy');
    expect(
      getSandboxProxyRenewalResponse({ requestId, expiresAt, appOrigin: 'https://app.example' })
        .headers['Content-Security-Policy']
    ).not.toBe(response.headers['Content-Security-Policy']);
  });

  it.each([
    { requestId: '</script><script>alert(1)</script>', appOrigin: 'https://app.example' },
    { requestId, appOrigin: 'https://app.example/</script>' },
    { requestId, appOrigin: 'javascript:alert(1)' },
    { requestId, appOrigin: 'https://app.example;script-src *' }
  ])('rejects untrusted callback interpolation %j', (input) => {
    expect(() =>
      getSandboxProxyRenewalResponse({ ...input, expiresAt: Date.now() + 900_000 })
    ).toThrow();
  });
});
