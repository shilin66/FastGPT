import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSandbox, type OpenSandboxConfigType } from '@fastgpt-sdk/sandbox-adapter';

const requireFromService = createRequire(import.meta.url);
const commonJsAdapter: typeof import('@fastgpt-sdk/sandbox-adapter') = requireFromService(
  '@fastgpt-sdk/sandbox-adapter'
);

describe.each([
  { module: 'ESM', factory: createSandbox },
  { module: 'CommonJS', factory: commonJsAdapter.createSandbox }
])('Sandbox network policy transport ($module)', ({ factory }) => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const policies: { name: string; policy: OpenSandboxConfigType['networkPolicy'] }[] = [
    { name: 'deny all', policy: { defaultAction: 'deny', egress: [] } },
    {
      name: 'allowlist',
      policy: {
        defaultAction: 'deny',
        egress: [{ action: 'allow', target: 'example.test' }]
      }
    },
    { name: 'explicit unrestricted', policy: { defaultAction: 'allow', egress: [] } },
    { name: 'legacy omitted policy', policy: undefined }
  ];

  it.each(policies)('preserves $name in the provider create request', async ({ policy }) => {
    const requests: { method: string; pathname: string; body: unknown }[] = [];
    const fetchStub: typeof fetch = async (input, options) => {
      const request = new Request(input, options);
      requests.push({
        method: request.method,
        pathname: new URL(request.url).pathname,
        body: await request.json()
      });
      return new Response(
        JSON.stringify({ code: 'TEST_STOP', message: 'Transport probe complete' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    };
    vi.stubGlobal('fetch', fetchStub);

    const adapter = factory(
      'opensandbox',
      {
        baseUrl: 'http://sandbox.example.test',
        sessionId: 'network-policy-test',
        runtime: 'docker'
      },
      {
        image: { repository: 'test-image', tag: 'latest' },
        networkPolicy: policy
      }
    );
    await expect(adapter.create()).rejects.toThrow('Failed to create sandbox');

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'POST', pathname: '/v1/sandboxes' });
    if (policy) {
      expect(requests[0].body).toHaveProperty('networkPolicy', policy);
    } else {
      expect(requests[0].body).not.toHaveProperty('networkPolicy');
    }
  });
});
