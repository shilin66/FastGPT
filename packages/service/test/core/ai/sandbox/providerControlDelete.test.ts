import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenSandboxAdapter } from '@fastgpt-sdk/sandbox-adapter';

const commonJs: typeof import('@fastgpt-sdk/sandbox-adapter') = createRequire(import.meta.url)(
  '@fastgpt-sdk/sandbox-adapter'
);

describe.each([
  { module: 'ESM', Adapter: OpenSandboxAdapter },
  { module: 'CommonJS', Adapter: commonJs.OpenSandboxAdapter }
])('Provider control-plane deletion ($module)', ({ Adapter }) => {
  afterEach(() => vi.unstubAllGlobals());

  const setup = ({
    state = 'Running',
    lookupStatus = 200,
    lookupCount = 1,
    lookupId = 'expected-provider',
    lookupSession = 'delete-test',
    totalPages = 1,
    infoStatus = 200,
    infoId = 'expected-provider',
    infoSession = 'delete-test',
    deleteStatus = 204,
    deleteNetworkFailure = false
  } = {}) => {
    const requests: { method: string; path: string }[] = [];
    const fetchStub: typeof fetch = async (input, options) => {
      const request = new Request(input, options);
      const path = new URL(request.url).pathname;
      requests.push({ method: request.method, path });
      if (path === '/v1/sandboxes' && request.method === 'GET') {
        return Response.json(
          {
            pagination: { totalPages, totalItems: lookupCount },
            items: Array.from({ length: lookupCount }, (_, index) => ({
              id: index === 0 ? lookupId : 'duplicate-provider',
              metadata: { sessionId: lookupSession },
              status: { state },
              createdAt: '2026-10-11T00:00:00Z'
            }))
          },
          { status: lookupStatus }
        );
      }
      if (path === '/v1/sandboxes/expected-provider' && request.method === 'GET') {
        return Response.json(
          {
            id: infoId,
            metadata: { sessionId: infoSession },
            status: { state },
            createdAt: '2026-10-11T00:00:00Z'
          },
          { status: infoStatus }
        );
      }
      if (path === '/v1/sandboxes/expected-provider' && request.method === 'DELETE') {
        if (deleteNetworkFailure) throw new TypeError('fetch failed');
        return deleteStatus === 204
          ? new Response(null, { status: deleteStatus })
          : Response.json({ message: 'delete failed' }, { status: deleteStatus });
      }
      throw new TypeError(`Unavailable data plane: ${request.method} ${path}`);
    };
    vi.stubGlobal('fetch', fetchStub);
    const adapter = new Adapter(
      { baseUrl: 'http://sandbox.example.test', sessionId: 'delete-test', runtime: 'docker' },
      { image: { repository: 'test-image' } }
    );
    return { adapter, requests };
  };

  const inspectionRequests = [
    { method: 'GET', path: '/v1/sandboxes' },
    { method: 'GET', path: '/v1/sandboxes/expected-provider' }
  ];
  const deletionRequest = { method: 'DELETE', path: '/v1/sandboxes/expected-provider' };

  it.each(['Running', 'Paused', 'Error'])(
    'deletes the exact %s instance when the data plane is unavailable',
    async (state) => {
      const { adapter, requests } = setup({ state });

      await expect(adapter.deleteExisting('expected-provider')).resolves.toBeUndefined();

      expect(requests).toEqual([...inspectionRequests, deletionRequest]);
      expect(adapter.id).toBeUndefined();
      expect(adapter.status).toEqual({ state: 'UnExist' });
    }
  );

  it('accepts an exact id 404 without issuing DELETE when the provider is already absent', async () => {
    const { adapter, requests } = setup({ lookupCount: 0, infoStatus: 404 });

    await expect(adapter.deleteExisting('expected-provider')).resolves.toBeUndefined();

    expect(requests).toEqual(inspectionRequests);
    expect(adapter.status).toEqual({ state: 'UnExist' });
  });

  it('still deletes the exact verified id when a list result omits it', async () => {
    const { adapter, requests } = setup({ lookupCount: 0 });

    await expect(adapter.deleteExisting('expected-provider')).resolves.toBeUndefined();

    expect(requests).toEqual([...inspectionRequests, deletionRequest]);
  });

  it('accepts a DELETE 404 when the verified target disappears concurrently', async () => {
    const { adapter, requests } = setup({ deleteStatus: 404 });

    await expect(adapter.deleteExisting('expected-provider')).resolves.toBeUndefined();

    expect(requests).toEqual([...inspectionRequests, deletionRequest]);
    expect(adapter.status).toEqual({ state: 'UnExist' });
  });

  it.each([
    { scenario: 'list lookup fails', options: { lookupStatus: 503 } },
    { scenario: 'list lookup returns 404', options: { lookupStatus: 404 } },
    { scenario: 'session matches duplicate instances', options: { lookupCount: 2 } },
    { scenario: 'session matches hidden duplicate instances', options: { totalPages: 2 } },
    { scenario: 'list returns a different id', options: { lookupId: 'another-provider' } },
    { scenario: 'list returns a different session', options: { lookupSession: 'another-session' } },
    { scenario: 'exact id returns a different id', options: { infoId: 'another-provider' } },
    {
      scenario: 'exact id returns a different session',
      options: { infoSession: 'another-session' }
    },
    { scenario: 'exact id is forbidden', options: { infoStatus: 403 } },
    { scenario: 'exact id lookup fails', options: { infoStatus: 503 } }
  ])('rejects without mutation when $scenario', async ({ options }) => {
    const { adapter, requests } = setup(options);

    await expect(adapter.deleteExisting('expected-provider')).rejects.toThrow();

    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every(({ method }) => method === 'GET')).toBe(true);
  });

  it.each([
    { scenario: 'DELETE is forbidden', options: { deleteStatus: 403 } },
    { scenario: 'DELETE fails', options: { deleteStatus: 503 } },
    { scenario: 'DELETE transport fails', options: { deleteNetworkFailure: true } }
  ])('propagates failure when $scenario', async ({ options }) => {
    const { adapter, requests } = setup(options);

    await expect(adapter.deleteExisting('expected-provider')).rejects.toThrow();

    expect(requests).toEqual([...inspectionRequests, deletionRequest]);
  });

  it('rejects an empty target id without provider requests', async () => {
    const { adapter, requests } = setup();

    await expect(adapter.deleteExisting('')).rejects.toThrow();

    expect(requests).toEqual([]);
  });
});
