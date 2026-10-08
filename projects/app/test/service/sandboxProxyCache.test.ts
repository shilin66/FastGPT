import { describe, expect, it } from 'vitest';
import { getSandboxProxyCacheControl } from '@/service/core/sandbox/proxyCache';

const asset =
  '/proxy/8080/stable-0123456789abcdef0123456789abcdef01234567/static/out/vs/workbench/workbench.web.main.js';
const input = {
  method: 'GET',
  path: asset,
  status: 200,
  upstream: 'public, max-age=31536000'
};

describe('code-server built-in asset caching', () => {
  it('keeps the upstream lifetime in a private browser cache for versioned built-in assets', () => {
    expect(getSandboxProxyCacheControl(input)).toBe('private, max-age=31536000');
  });

  it.each([
    { path: '/proxy/8080/' },
    { path: '/proxy/8080/vscode-remote-resource?path=/workspace/private.js' },
    { path: asset.replace('static/out/vs/', 'static/../../../workspace/') },
    { path: asset.replace('static/out/vs/', 'static/out/vs/%2e%2e/') },
    { path: asset.replace('/stable-0123456789abcdef0123456789abcdef01234567', '') },
    { path: asset.replace('static/out/vs/', 'static/extensions/private/') },
    { method: 'POST' },
    { status: 401 },
    { upstream: 'no-store' },
    { upstream: 'public, max-age=31536000, no-store' },
    { upstream: undefined }
  ])('keeps private documents, errors and non-built-in resources uncached: %s', (change) => {
    expect(getSandboxProxyCacheControl({ ...input, ...change })).toBe('no-store');
  });

  it.each(['out/nls.messages.js', 'node_modules/vsda/rust/web/vsda.wasm'])(
    'caches the built-in resource %s',
    (resource) => {
      expect(
        getSandboxProxyCacheControl({
          ...input,
          path: asset.replace('out/vs/workbench/workbench.web.main.js', resource)
        })
      ).toBe('private, max-age=31536000');
    }
  );
});
