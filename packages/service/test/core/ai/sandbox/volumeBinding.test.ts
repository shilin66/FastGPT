import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import {
  getSandboxClient,
  getExistingSandboxClient
} from '@fastgpt/service/core/ai/sandbox/controller';

const { settings, providerEnsure, providerDelete, providerConnect, fetchMock } = vi.hoisted(() => ({
  settings: { url: 'http://volume.test', protocol: 'claimName', enabled: true },
  providerEnsure: vi.fn(),
  providerDelete: vi.fn(),
  providerConnect: vi.fn(),
  fetchMock: vi.fn()
}));
vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/env')>();
  return {
    env: {
      ...original.env,
      AGENT_SANDBOX_PROVIDER: 'opensandbox',
      AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://sandbox.test',
      AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: 'test-image',
      get AGENT_SANDBOX_ENABLE_VOLUME() {
        return settings.enabled;
      },
      get AGENT_SANDBOX_VOLUME_MANAGER_URL() {
        return settings.url;
      },
      get AGENT_SANDBOX_VOLUME_MANAGER_PROTOCOL() {
        return settings.protocol;
      }
    }
  };
});
vi.mock('@fastgpt/service/core/ai/sandbox/lease', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/lease')>();
  return {
    ...original,
    withSandboxLease: async (
      _key: string,
      run: (
        lease: import('@fastgpt/service/core/ai/sandbox/lease').SandboxLease
      ) => Promise<unknown>
    ) => run({ token: randomUUID(), assertOwned: async () => {}, setHeartbeat: () => {} })
  };
});
vi.mock('@fastgpt-sdk/sandbox-adapter', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt-sdk/sandbox-adapter')>();
  class OpenSandboxAdapter {
    readonly provider = 'opensandbox';
    readonly id = 'provider-id';
    ensureRunning = providerEnsure;
    delete = providerDelete;
    connectExisting = providerConnect;
  }
  return { ...original, OpenSandboxAdapter, createSandbox: () => new OpenSandboxAdapter() };
});

const sandboxId = 'volume-binding-session';
const storedVolume = () => ({
  volumes: [{ name: 'workspace', claimName: 'saved-claim', mountPath: '/workspace' }],
  mountPath: '/workspace',
  volumeManager: {
    protocol: 'claimName',
    baseUrl: 'http://volume.test',
    target: 'saved-claim',
    ensured: true
  }
});

describe('persistent volume binding lifecycle', () => {
  beforeEach(() => {
    settings.url = 'http://volume.test';
    settings.protocol = 'claimName';
    settings.enabled = true;
    providerEnsure.mockReset().mockResolvedValue(undefined);
    providerDelete.mockReset().mockResolvedValue(undefined);
    providerConnect.mockReset().mockResolvedValue(true);
    fetchMock.mockReset().mockImplementation(async (_url: string, init: RequestInit) => ({
      ok: true,
      json: async () => ({ claimName: JSON.parse(String(init.body)).claimName, created: false })
    }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('persists the claim and protocol before ensure HTTP and retains them after provider failure', async () => {
    fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => {
      const claimName = JSON.parse(String(init.body)).claimName;
      expect(claimName).toMatch(/^fastgpt-/);
      const saved = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      expect(saved?.storage?.volumeManager).toMatchObject({
        protocol: 'claimName',
        target: claimName,
        ensured: false
      });
      expect(saved?.storage?.volumes?.[0].claimName).toBe(claimName);
      expect(saved?.operation?.checkpoint).toBe('volume_ensure');
      return { ok: true, json: async () => ({ claimName, created: true }) };
    });
    providerEnsure.mockRejectedValueOnce(new Error('provider failed'));
    await expect(getSandboxClient({ sandboxId }, {})).rejects.toThrow('provider failed');
    const saved = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    expect(saved?.storage?.volumeManager?.ensured).toBe(true);
    expect(saved?.operation?.failureDisposition).toBe('unknown');
  });

  it('keeps the same pending claim after proven 401 rejection and retries successfully', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(getSandboxClient({ sandboxId }, {})).rejects.toThrow('authentication');
    const failed = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    expect(failed?.operation?.failureDisposition).toBe('retryable');
    const claimName = failed?.storage?.volumeManager?.target;
    expect(claimName).toMatch(/^fastgpt-/);
    await getSandboxClient({ sandboxId }, {});
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({ claimName });
  });

  it('validates missing configuration before inserting a resource and allows corrected configuration', async () => {
    settings.url = '';
    await expect(getSandboxClient({ sandboxId }, {})).rejects.toThrow('VOLUME_MANAGER_URL');
    const saved = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    expect(saved).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(providerEnsure).not.toHaveBeenCalled();
    settings.url = 'http://volume.test';
    await getSandboxClient({ sandboxId }, {});
    expect(providerEnsure).toHaveBeenCalledTimes(1);
    expect(
      (await MongoSandboxInstance.findOne({ sandboxId }).lean())?.storage?.volumeManager?.ensured
    ).toBe(true);
  });

  it.each([
    ['disabled', 'volume_manager_disabled'],
    ['changed-url', 'volume_manager_binding_mismatch'],
    ['changed-protocol', 'volume_manager_binding_mismatch']
  ] as const)(
    'diagnoses %s on resume and recovers with the original volume',
    async (change, reason) => {
      const storage = storedVolume();
      await MongoSandboxInstance.create({
        sandboxId,
        provider: 'opensandbox',
        status: 'stopped',
        metadata: { volumeEnabled: true, workspaceRoot: '/workspace' },
        storage
      });
      if (change === 'disabled') settings.enabled = false;
      if (change === 'changed-url') settings.url = 'http://replacement.test';
      if (change === 'changed-protocol') settings.protocol = 'sessionId';

      await expect(getSandboxClient({ sandboxId })).rejects.toMatchObject({
        code: 'sandbox_volume_configuration_error',
        reason
      });
      expect(providerEnsure).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
        storage,
        operation: {
          checkpoint: 'pending',
          failureDisposition: 'retryable',
          error: {
            code: 'sandbox_volume_configuration_error',
            message: expect.stringContaining('volume')
          }
        }
      });

      settings.enabled = true;
      settings.url = 'http://volume.test';
      settings.protocol = 'claimName';
      await getSandboxClient({ sandboxId });
      expect(await MongoSandboxInstance.countDocuments({ sandboxId })).toBe(1);
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
        status: 'running',
        storage
      });
      expect(providerEnsure).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
        claimName: 'saved-claim'
      });
    }
  );

  it.each([false, true])(
    'preserves a non-volume workspace when volume configuration becomes %s',
    async (enabled) => {
      settings.enabled = enabled;
      await MongoSandboxInstance.create({
        sandboxId,
        provider: 'opensandbox',
        status: 'stopped',
        metadata: { volumeEnabled: false, workspaceRoot: '/home/sandbox/workspace' }
      });
      await getSandboxClient({ sandboxId });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(providerEnsure).toHaveBeenCalledTimes(1);
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
        status: 'running',
        metadata: { volumeEnabled: false, workspaceRoot: '/home/sandbox/workspace' }
      });
    }
  );

  it.each(['changed-service', 'legacy'] as const)(
    'rejects %s before deleting the provider',
    async (mode) => {
      const storage = mode === 'legacy' ? undefined : storedVolume();
      const instance = await MongoSandboxInstance.create({
        sandboxId,
        provider: 'opensandbox',
        status: 'running',
        storage
      });
      if (mode === 'changed-service') settings.url = 'http://replacement.test';
      await expect(getExistingSandboxClient(instance).delete()).rejects.toThrow('binding');
      expect(providerDelete).not.toHaveBeenCalled();
      expect(providerConnect).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      const saved = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      expect(saved?.storage).toEqual(storage);
      expect(saved?.operation?.failureDisposition).toBe('retryable');
    }
  );

  it.each(['mismatch', 'invalid-json', 'recreated'] as const)(
    'retains original binding and unknown outcome on %s',
    async (mode) => {
      const storage = storedVolume();
      await MongoSandboxInstance.create({
        sandboxId,
        provider: 'opensandbox',
        status: 'running',
        storage
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          if (mode === 'invalid-json') throw new SyntaxError('invalid JSON');
          return {
            claimName: mode === 'mismatch' ? 'other-claim' : 'saved-claim',
            created: mode === 'recreated'
          };
        }
      });
      await expect(getSandboxClient({ sandboxId }, {})).rejects.toThrow();
      const saved = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      expect(saved?.storage).toEqual(storage);
      expect(saved?.operation?.checkpoint).toBe('volume_ensure');
      expect(saved?.operation?.failureDisposition).toBe('unknown');
      expect(providerEnsure).not.toHaveBeenCalled();
    }
  );

  it('retries the persisted DELETE after provider_deleted without recreating or changing storage', async () => {
    const storage = storedVolume();
    const instance = await MongoSandboxInstance.create({
      sandboxId,
      provider: 'opensandbox',
      status: 'running',
      storage
    });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'unavailable' });
    await expect(getExistingSandboxClient(instance).delete()).rejects.toThrow('503');
    const saved = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    expect(saved?.storage).toEqual(storage);
    expect(saved?.operation).toMatchObject({
      checkpoint: 'provider_deleted',
      failureDisposition: 'retryable'
    });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    await getExistingSandboxClient(saved!).delete();
    expect(providerDelete).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://volume.test/v1/volumes/saved-claim',
      'http://volume.test/v1/volumes/saved-claim'
    ]);
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toBeNull();
  });
});
