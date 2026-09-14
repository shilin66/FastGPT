import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const envBackup = { ...process.env };
const loadConfig = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/ai/sandbox/config');
};

describe('shared Sandbox provider configuration', () => {
  beforeEach(() => {
    process.env = { ...envBackup };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('AGENT_SANDBOX_')) delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  it.each(['docker', 'kubernetes'])(
    'uses the same OpenSandbox %s connection for Skill and shared clients',
    async (runtime) => {
      process.env.AGENT_SANDBOX_PROVIDER = 'opensandbox';
      process.env.AGENT_SANDBOX_OPENSANDBOX_BASEURL = 'http://sandbox.example.test:8090';
      process.env.AGENT_SANDBOX_OPENSANDBOX_API_KEY = 'test-api-key';
      process.env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME = runtime;
      process.env.AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY = 'false';
      const { getSandboxProviderConfig, getOpenSandboxConnectionConfig } = await loadConfig();
      const { provider, ...connection } = getSandboxProviderConfig();

      expect(provider).toBe('opensandbox');
      expect(connection).toEqual({
        baseUrl: 'http://sandbox.example.test:8090',
        apiKey: 'test-api-key',
        runtime,
        useServerProxy: false
      });
      expect(getOpenSandboxConnectionConfig({ sessionId: 'session-1' })).toEqual({
        ...connection,
        sessionId: 'session-1'
      });
    }
  );

  it('preserves runtime and proxy defaults and allows an unauthenticated provider', async () => {
    process.env.AGENT_SANDBOX_OPENSANDBOX_BASEURL = 'http://sandbox.example.test:8090';
    const { getSandboxProviderConfig } = await loadConfig();
    expect(getSandboxProviderConfig()).toEqual({
      provider: 'opensandbox',
      baseUrl: 'http://sandbox.example.test:8090',
      apiKey: undefined,
      runtime: 'docker',
      useServerProxy: true
    });
  });

  it('rejects a missing OpenSandbox URL instead of silently choosing localhost', async () => {
    process.env.AGENT_SANDBOX_PROVIDER = 'opensandbox';
    const { getSandboxProviderConfig, getOpenSandboxConnectionConfig } = await loadConfig();
    expect(() => getSandboxProviderConfig()).toThrow(
      'AGENT_SANDBOX_OPENSANDBOX_BASEURL is required'
    );
    expect(() => getOpenSandboxConnectionConfig({ sessionId: 'session-1' })).toThrow(
      'AGENT_SANDBOX_OPENSANDBOX_BASEURL is required'
    );
  });

  it('uses Sealos credentials without forwarding OpenSandbox credentials', async () => {
    process.env.AGENT_SANDBOX_PROVIDER = 'sealosdevbox';
    process.env.AGENT_SANDBOX_SEALOS_BASEURL = 'https://devbox.example.test';
    process.env.AGENT_SANDBOX_SEALOS_TOKEN = 'test-sealos-token';
    process.env.AGENT_SANDBOX_OPENSANDBOX_BASEURL = 'http://sandbox.example.test:8090';
    process.env.AGENT_SANDBOX_OPENSANDBOX_API_KEY = 'test-open-key';
    const { getSandboxProviderConfig, getSealosConnectionConfig } = await loadConfig();

    expect(getSandboxProviderConfig()).toEqual({
      provider: 'sealosdevbox',
      baseUrl: 'https://devbox.example.test',
      token: 'test-sealos-token',
      runtime: 'docker'
    });
    expect(getSealosConnectionConfig('devbox-1')).toEqual({
      baseUrl: 'https://devbox.example.test',
      token: 'test-sealos-token',
      sandboxId: 'devbox-1'
    });
  });

  it.each(['AGENT_SANDBOX_SEALOS_BASEURL', 'AGENT_SANDBOX_SEALOS_TOKEN'])(
    'rejects missing %s even when OpenSandbox credentials are present',
    async (missingKey) => {
      process.env.AGENT_SANDBOX_PROVIDER = 'sealosdevbox';
      process.env.AGENT_SANDBOX_SEALOS_BASEURL = 'https://devbox.example.test';
      process.env.AGENT_SANDBOX_SEALOS_TOKEN = 'test-sealos-token';
      process.env.AGENT_SANDBOX_OPENSANDBOX_BASEURL = 'http://sandbox.example.test:8090';
      process.env.AGENT_SANDBOX_OPENSANDBOX_API_KEY = 'test-open-key';
      delete process.env[missingKey];
      const { getSandboxProviderConfig, getSealosConnectionConfig } = await loadConfig();
      const error = 'AGENT_SANDBOX_SEALOS_BASEURL / AGENT_SANDBOX_SEALOS_TOKEN required';

      expect(() => getSandboxProviderConfig()).toThrow(error);
      expect(() => getSealosConnectionConfig('devbox-1')).toThrow(error);
    }
  );

  it('keeps E2B unsupported for Skill workflows', async () => {
    process.env.AGENT_SANDBOX_PROVIDER = 'e2b';
    const { getSandboxProviderConfig } = await loadConfig();
    expect(() => getSandboxProviderConfig()).toThrow('Sandbox provider "e2b" is not supported');
  });

  it('rejects an invalid runtime at the shared environment boundary', async () => {
    process.env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME = 'unsupported';
    await expect(loadConfig()).rejects.toThrow('AGENT_SANDBOX_OPENSANDBOX_RUNTIME');
  });

  it('preserves explicit create overrides and volume-manager ownership without adding networkPolicy', async () => {
    process.env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO = 'default-image';
    const { buildOpenSandboxCreateConfig } = await loadConfig();
    const volume = { name: 'workspace', pvc: { claimName: 'claim-1' }, mountPath: '/workspace' };
    expect(
      buildOpenSandboxCreateConfig({
        resourceLimits: { cpu: '1', memory: '1Gi' },
        createConfig: {
          image: { repository: 'override-image', tag: 'v2' },
          entrypoint: ['/home/sandbox/entrypoint.sh'],
          env: { FASTGPT_WORKDIR: '/workspace' },
          volumes: [{ ...volume, mountPath: '/ignored' }]
        },
        volumes: [volume]
      })
    ).toEqual({
      image: { repository: 'override-image', tag: 'v2' },
      entrypoint: ['/home/sandbox/entrypoint.sh'],
      env: { FASTGPT_WORKDIR: '/workspace' },
      resourceLimits: { cpu: '1', memory: '1Gi' },
      volumes: [volume]
    });
  });

  it('uses standalone OpenSandbox volume settings through the existing volume manager', async () => {
    process.env.AGENT_SANDBOX_ENABLE_VOLUME = 'true';
    process.env.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL = 'http://127.0.0.1:3005';
    process.env.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN = 'local-test-token';
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ claimName: 'qa-volume' }) });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { getVolumeManagerConfig } = await loadConfig();
      await expect(getVolumeManagerConfig('qa-session')).resolves.toMatchObject({
        storage: { mountPath: '/workspace', volumes: [{ claimName: 'qa-volume' }] }
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:3005/v1/volumes/ensure',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer local-test-token' }
        })
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each(['URL', 'TOKEN'])(
    'rejects conflicting old and standalone volume manager %s settings without exposing values',
    async (suffix) => {
      process.env[`AGENT_SANDBOX_VOLUME_MANAGER_${suffix}`] =
        suffix === 'URL' ? 'http://old.example.test:5008' : 'old-secret';
      process.env[`AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_${suffix}`] =
        suffix === 'URL' ? 'http://127.0.0.1:3005' : 'new-secret';
      await expect(loadConfig()).rejects.toThrow(
        `Conflicting environment variables: AGENT_SANDBOX_VOLUME_MANAGER_${suffix}`
      );
      await expect(loadConfig()).rejects.not.toThrow('old-secret');
      await expect(loadConfig()).rejects.not.toThrow('new-secret');
    }
  );
});
