import { afterEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => ({
  AGENT_SANDBOX_EDITOR_DIRECT_HOST: undefined as string | undefined,
  AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://gateway:8090',
  AGENT_SANDBOX_OPENSANDBOX_API_KEY: 'provider-key'
}));
const endpoint = vi.hoisted(() => vi.fn());
vi.mock('@fastgpt/service/env', () => ({ env: settings }));
vi.mock('@fastgpt/service/core/agentSkills/sandboxConfig', () => ({
  getSandboxDefaults: () => ({ targetPort: 44772 }),
  getProviderSandboxEndpoint: endpoint
}));

import { getSandboxEditorEndpoint } from '@fastgpt/service/core/ai/sandbox/editorEndpoint';

describe('shared Skill and Chat editor transport endpoint', () => {
  const provider = { provider: 'opensandbox', id: 'physical-123' } as never;
  afterEach(() => {
    settings.AGENT_SANDBOX_EDITOR_DIRECT_HOST = undefined;
    settings.AGENT_SANDBOX_OPENSANDBOX_BASEURL = 'http://gateway:8090';
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('retains the configured provider transport by default', async () => {
    endpoint.mockResolvedValue({ url: 'http://gateway/sandboxes/physical-123/proxy/44772' });
    await getSandboxEditorEndpoint(provider);
    expect(endpoint).toHaveBeenCalledWith(provider, 44772);
  });

  it('uses the fixed execd endpoint and only replaces its host when explicitly configured', async () => {
    settings.AGENT_SANDBOX_EDITOR_DIRECT_HOST = 'sandbox-host';
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ endpoint: 'host.docker.internal:45441/proxy/44772' }));
    vi.stubGlobal('fetch', fetcher);
    await expect(getSandboxEditorEndpoint(provider)).resolves.toEqual({
      host: 'sandbox-host',
      port: 45441,
      protocol: 'http',
      url: 'http://sandbox-host:45441/proxy/44772'
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(url.toString()).toBe(
      'http://gateway:8090/v1/sandboxes/physical-123/endpoints/44772?use_server_proxy=false'
    );
    expect(init.headers['OPEN-SANDBOX-API-KEY']).toBe('provider-key');
    expect(endpoint).not.toHaveBeenCalled();
  });

  it('does not duplicate the API version prefix', async () => {
    settings.AGENT_SANDBOX_EDITOR_DIRECT_HOST = 'sandbox-host';
    settings.AGENT_SANDBOX_OPENSANDBOX_BASEURL = 'https://gateway/v1/';
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ endpoint: 'https://internal:45441/proxy/44772' }));
    vi.stubGlobal('fetch', fetcher);
    await getSandboxEditorEndpoint(provider);
    expect(fetcher.mock.calls[0][0].pathname).toBe('/v1/sandboxes/physical-123/endpoints/44772');
  });

  it.each([
    { endpoint: 'http://user:password@internal:45441/proxy/44772' },
    { endpoint: 'http://internal:45441/proxy/8080' },
    { endpoint: 'http://internal:45441/proxy/44772?token=secret' },
    { endpoint: 'ftp://internal:45441' },
    {
      endpoint: 'http://internal:45441/proxy/44772',
      headers: { 'OpenSandbox-Secure-Access': 'secret' }
    }
  ])(
    'rejects unsupported endpoint paths or transport credentials without leaking them',
    async (body) => {
      settings.AGENT_SANDBOX_EDITOR_DIRECT_HOST = 'sandbox-host';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
      await expect(getSandboxEditorEndpoint(provider)).rejects.toThrow(
        'sandbox_editor_unavailable'
      );
    }
  );

  it('sanitizes provider failures', async () => {
    settings.AGENT_SANDBOX_EDITOR_DIRECT_HOST = 'sandbox-host';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('private upstream address with key'))
    );
    await expect(getSandboxEditorEndpoint(provider)).rejects.toThrow(
      /^sandbox_editor_unavailable$/
    );
  });
});
