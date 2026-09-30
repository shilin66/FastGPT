import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenSandboxAdapter } from '@fastgpt-sdk/sandbox-adapter';

const commonJs: typeof import('@fastgpt-sdk/sandbox-adapter') = createRequire(import.meta.url)(
  '@fastgpt-sdk/sandbox-adapter'
);

describe.each([
  { module: 'ESM', Adapter: OpenSandboxAdapter },
  { module: 'CommonJS', Adapter: commonJs.OpenSandboxAdapter }
])('Provider lifecycle transport ($module)', ({ Adapter }) => {
  afterEach(() => vi.unstubAllGlobals());

  const setup = ({
    exists = true,
    failLookup = false,
    duplicate = false,
    wrongSession = false,
    hiddenDuplicate = false,
    targetState = 'Paused',
    targetMissing = false
  } = {}) => {
    const requests: { method: string; path: string }[] = [];
    const fetchStub: typeof fetch = async (input, options) => {
      const request = new Request(input, options);
      const path = new URL(request.url).pathname;
      requests.push({ method: request.method, path });
      if (path === '/v1/sandboxes' && request.method === 'GET') {
        if (failLookup) return new Response('lookup unavailable', { status: 503 });
        return Response.json({
          ...(hiddenDuplicate ? { pagination: { totalItems: 2, totalPages: 2 } } : {}),
          items: exists
            ? Array.from({ length: duplicate ? 2 : 1 }, (_, index) => ({
                id: index === 0 ? 'existing-provider' : 'duplicate-provider',
                metadata: { sessionId: wrongSession ? 'other-session' : 'lifecycle-test' },
                status: { state: targetState },
                createdAt: '2026-09-13T00:00:00Z'
              }))
            : []
        });
      }
      if (path.includes('/endpoints/')) {
        return Response.json({ endpoint: 'sandbox.example.test' });
      }
      if (path === '/v1/sandboxes/existing-provider' && request.method === 'GET') {
        if (targetMissing) return Response.json({ message: 'not found' }, { status: 404 });
        return Response.json({
          id: 'existing-provider',
          metadata: { sessionId: 'lifecycle-test' },
          status: { state: targetState },
          createdAt: '2026-09-13T00:00:00Z'
        });
      }
      if (request.method === 'DELETE' || path.endsWith('/pause')) {
        return new Response(null, { status: 204 });
      }
      if (path.endsWith('/resume') && request.method === 'POST') {
        targetState = 'Running';
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected provider request ${request.method} ${path}`);
    };
    vi.stubGlobal('fetch', fetchStub);
    const adapter = new Adapter(
      { baseUrl: 'http://sandbox.example.test', sessionId: 'lifecycle-test', runtime: 'docker' },
      { image: { repository: 'test-image' }, skipHealthCheck: true }
    );
    return { adapter, requests };
  };

  it('pauses rather than deleting the container on stop', async () => {
    const { adapter, requests } = setup();
    await adapter.connect('existing-provider');
    await adapter.stop();
    expect(requests).toContainEqual({
      method: 'POST',
      path: '/v1/sandboxes/existing-provider/pause'
    });
    expect(requests.some(({ method }) => method === 'DELETE')).toBe(false);
  });

  it('connects to a paused existing container without creating, resuming or health probing', async () => {
    const { adapter, requests } = setup();
    expect(await adapter.connectExisting()).toBe(true);
    expect(adapter.id).toBe('existing-provider');
    expect(requests.every(({ method }) => method === 'GET')).toBe(true);
    expect(requests.some(({ path }) => path.includes('health'))).toBe(false);
  });

  it('resumes the same paused container without creating a replacement', async () => {
    const { adapter, requests } = setup();
    await adapter.ensureRunning();
    expect(adapter.id).toBe('existing-provider');
    expect(requests.filter(({ method }) => method !== 'GET')).toEqual([
      { method: 'POST', path: '/v1/sandboxes/existing-provider/resume' }
    ]);
  });

  it('returns absent without creating a replacement', async () => {
    const { adapter, requests } = setup({ exists: false });
    expect(await adapter.connectExisting()).toBe(false);
    expect(requests).toEqual([{ method: 'GET', path: '/v1/sandboxes' }]);
  });

  it('does not treat a failed provider lookup as absence', async () => {
    const { adapter } = setup({ failLookup: true });
    await expect(adapter.connectExisting()).rejects.toThrow();
  });

  it.each(['connectExisting', 'ensureRunning'] as const)(
    'rejects duplicate exact sessionId matches during %s without a remote mutation',
    async (method) => {
      const { adapter, requests } = setup({ duplicate: true });
      await expect(adapter[method]()).rejects.toThrow('Ambiguous');
      expect(requests.every(({ method }) => method === 'GET')).toBe(true);
    }
  );

  it.each(['connectExisting', 'ensureRunning'] as const)(
    'rejects a non-exact sessionId result during %s without mutation',
    async (method) => {
      const { adapter, requests } = setup({ wrongSession: true });
      await expect(adapter[method]()).rejects.toThrow('sessionId');
      expect(requests.every(({ method }) => method === 'GET')).toBe(true);
    }
  );

  it('rejects a paginated duplicate rather than trusting the first page', async () => {
    const { adapter, requests } = setup({ hiddenDuplicate: true });
    await expect(adapter.connectExisting()).rejects.toThrow('Ambiguous');
    expect(requests.every(({ method }) => method === 'GET')).toBe(true);
  });

  it('inspects the exact provider id without connecting, resuming or creating', async () => {
    const { adapter, requests } = setup();
    await expect(adapter.inspectExisting('existing-provider')).resolves.toMatchObject({
      id: 'existing-provider',
      status: { state: 'Stopped' }
    });
    expect(requests).toEqual([
      { method: 'GET', path: '/v1/sandboxes' },
      { method: 'GET', path: '/v1/sandboxes/existing-provider' }
    ]);
  });

  it('requires an exact provider-id 404 to confirm deletion', async () => {
    const { adapter, requests } = setup({ exists: false, targetMissing: true });
    await expect(adapter.inspectExisting('existing-provider')).resolves.toBeNull();
    expect(requests.at(-1)).toEqual({ method: 'GET', path: '/v1/sandboxes/existing-provider' });
  });

  it('does not interpret lookup failure as a confirmed provider deletion', async () => {
    const { adapter } = setup({ failLookup: true });
    await expect(adapter.inspectExisting('existing-provider')).rejects.toThrow();
  });
});
