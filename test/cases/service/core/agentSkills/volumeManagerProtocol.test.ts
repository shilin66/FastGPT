import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const envBackup = { ...process.env };
const fetchMock = vi.fn();
const loadConfig = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/ai/sandbox/config');
};
const previousVolume = () => ({
  storage: {
    volumes: [
      { name: 'workspace', claimName: 'saved-claim', mountPath: '/saved', subPath: 'draft' }
    ],
    mountPath: '/saved',
    volumeManager: {
      protocol: 'claimName' as const,
      baseUrl: 'http://volume.test',
      target: 'saved-claim',
      ensured: true
    }
  }
});

describe('volume manager protocol and persisted binding', () => {
  beforeEach(() => {
    process.env = { ...envBackup };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('AGENT_SANDBOX_')) delete process.env[key];
    }
    process.env.AGENT_SANDBOX_ENABLE_VOLUME = 'true';
    process.env.AGENT_SANDBOX_VOLUME_MANAGER_URL = 'http://volume.test';
    fetchMock.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({ claimName: 'saved-claim', created: false })
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    process.env = { ...envBackup };
    vi.unstubAllGlobals();
  });

  it('defaults to the legacy sessionId request and records its deletion target', async () => {
    const { prepareVolumeManagerConfig, getVolumeManagerConfig } = await loadConfig();
    const prepared = prepareVolumeManagerConfig({ sandboxId: 'session-1' });
    expect(prepared?.storage.volumeManager).toMatchObject({
      protocol: 'sessionId',
      baseUrl: 'http://volume.test',
      target: 'session-1'
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const result = await getVolumeManagerConfig('session-1', prepared);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ sessionId: 'session-1' });
    expect(result?.storage.volumeManager).toMatchObject({ target: 'session-1', ensured: true });
    expect(result?.storage.volumes?.[0].claimName).toBe('saved-claim');
  });

  it('prepares distinct legal claims and sends only the persisted claimName', async () => {
    process.env.AGENT_SANDBOX_VOLUME_MANAGER_PROTOCOL = 'claimName';
    const { prepareVolumeManagerConfig, getVolumeManagerConfig } = await loadConfig();
    const prepared = prepareVolumeManagerConfig({ sandboxId: 'session / unsafe in claim' });
    const other = prepareVolumeManagerConfig({ sandboxId: 'session / unsafe in claim' });
    const target = prepared!.storage.volumeManager!.target;
    expect(target).toMatch(/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/);
    expect(target).not.toBe(other?.storage.volumeManager?.target);
    expect(prepared?.storage.volumes?.[0].claimName).toBe(target);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ claimName: target, created: true })
    });
    await expect(
      getVolumeManagerConfig('session / unsafe in claim', prepared)
    ).resolves.toMatchObject({
      storage: { volumeManager: { target, ensured: true } }
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ claimName: target });
  });

  it('reuses the saved claim, mount and subPath without mutating previous storage', async () => {
    process.env.AGENT_SANDBOX_VOLUME_MANAGER_PROTOCOL = 'claimName';
    const { prepareVolumeManagerConfig, getVolumeManagerConfig, deleteSessionVolume } =
      await loadConfig();
    const previous = previousVolume();
    const before = structuredClone(previous);
    const prepared = prepareVolumeManagerConfig({ sandboxId: 'session-1', previous });
    const result = await getVolumeManagerConfig('session-1', prepared);
    expect(result?.volumes).toEqual([
      {
        name: 'workspace',
        pvc: { claimName: 'saved-claim' },
        mountPath: '/saved',
        subPath: 'draft'
      }
    ]);
    expect(previous).toEqual(before);
    await deleteSessionVolume('session-1', prepared);
    expect(fetchMock.mock.calls[1][0]).toBe('http://volume.test/v1/volumes/saved-claim');
  });

  it.each(['ensure', 'delete'] as const)(
    'rejects legacy adoption by claimName before %s HTTP',
    async (action) => {
      process.env.AGENT_SANDBOX_VOLUME_MANAGER_PROTOCOL = 'claimName';
      const { prepareVolumeManagerConfig } = await loadConfig();
      expect(() =>
        prepareVolumeManagerConfig({ sandboxId: 'legacy', previous: {}, action })
      ).toThrow('binding');
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('does not generate a target for an unbound claimName deletion', async () => {
    process.env.AGENT_SANDBOX_VOLUME_MANAGER_PROTOCOL = 'claimName';
    const { prepareVolumeManagerConfig } = await loadConfig();
    expect(() => prepareVolumeManagerConfig({ sandboxId: 'new', action: 'delete' })).toThrow(
      'binding'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires prepared storage for a claimName HTTP call', async () => {
    process.env.AGENT_SANDBOX_VOLUME_MANAGER_PROTOCOL = 'claimName';
    const { getVolumeManagerConfig, ensureSessionVolume } = await loadConfig();
    await expect(getVolumeManagerConfig('new')).rejects.toThrow('binding');
    await expect(ensureSessionVolume('new')).rejects.toThrow('binding');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'extra-volume',
    'missing-claim',
    'invalid-subpath',
    'confirmed-missing-volume'
  ] as const)('rejects invalid persisted storage %s before any HTTP', async (invalid) => {
    process.env.AGENT_SANDBOX_VOLUME_MANAGER_PROTOCOL = 'claimName';
    const { prepareVolumeManagerConfig } = await loadConfig();
    const previous = previousVolume();
    if (invalid === 'extra-volume')
      previous.storage.volumes.push({ ...previous.storage.volumes[0], name: 'other' });
    if (invalid === 'missing-claim') previous.storage.volumes[0].claimName = '';
    if (invalid === 'invalid-subpath') previous.storage.volumes[0].subPath = '../draft';
    if (invalid === 'confirmed-missing-volume') previous.storage.volumes = [];
    const before = structuredClone(previous);
    expect(() => prepareVolumeManagerConfig({ sandboxId: 'session-1', previous })).toThrow();
    expect(previous).toEqual(before);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['address', 'protocol', 'claim'] as const)(
    'rejects changed %s before HTTP and leaves storage untouched',
    async (change) => {
      process.env.AGENT_SANDBOX_VOLUME_MANAGER_PROTOCOL = 'claimName';
      if (change === 'address') process.env.AGENT_SANDBOX_VOLUME_MANAGER_URL = 'http://other.test';
      if (change === 'protocol') process.env.AGENT_SANDBOX_VOLUME_MANAGER_PROTOCOL = 'sessionId';
      const { prepareVolumeManagerConfig } = await loadConfig();
      const previous = previousVolume();
      if (change === 'claim') previous.storage.volumeManager.target = 'another-claim';
      const before = structuredClone(previous);
      expect(() => prepareVolumeManagerConfig({ sandboxId: 'session-1', previous })).toThrow();
      expect(previous).toEqual(before);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each(['other-claim', '', '../invalid', undefined])(
    'rejects malformed or mismatched response claim %s',
    async (claimName) => {
      process.env.AGENT_SANDBOX_VOLUME_MANAGER_PROTOCOL = 'claimName';
      const { prepareVolumeManagerConfig, getVolumeManagerConfig } = await loadConfig();
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ claimName, created: false }) });
      const prepared = prepareVolumeManagerConfig({
        sandboxId: 'session-1',
        previous: previousVolume()
      });
      await expect(getVolumeManagerConfig('session-1', prepared)).rejects.toThrow();
    }
  );

  it('rejects a newly recreated claim for a previously confirmed workspace', async () => {
    process.env.AGENT_SANDBOX_VOLUME_MANAGER_PROTOCOL = 'claimName';
    const { prepareVolumeManagerConfig, getVolumeManagerConfig } = await loadConfig();
    const prepared = prepareVolumeManagerConfig({
      sandboxId: 'session-1',
      previous: previousVolume()
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ claimName: 'saved-claim', created: true })
    });
    await expect(getVolumeManagerConfig('session-1', prepared)).rejects.toThrow('recreated');
  });

  it('treats an existing claim with no confirmation marker conservatively', async () => {
    process.env.AGENT_SANDBOX_VOLUME_MANAGER_PROTOCOL = 'claimName';
    const { prepareVolumeManagerConfig, getVolumeManagerConfig } = await loadConfig();
    const previous = previousVolume();
    const { ensured: _ensured, ...binding } = previous.storage.volumeManager;
    const prepared = prepareVolumeManagerConfig({
      sandboxId: 'session-1',
      previous: { storage: { ...previous.storage, volumeManager: binding } }
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ claimName: 'saved-claim', created: true })
    });
    await expect(getVolumeManagerConfig('session-1', prepared)).rejects.toThrow('recreated');
  });

  it('preserves legacy session deletion and rejects a changed legacy claim response', async () => {
    const { prepareVolumeManagerConfig, getVolumeManagerConfig, deleteSessionVolume } =
      await loadConfig();
    const { volumeManager: _binding, ...storage } = previousVolume().storage;
    const prepared = prepareVolumeManagerConfig({
      sandboxId: 'legacy/session',
      previous: { storage }
    });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ claimName: 'replacement' }) });
    await expect(getVolumeManagerConfig('legacy/session', prepared)).rejects.toThrow();
    await deleteSessionVolume('legacy/session', prepared);
    expect(fetchMock.mock.calls[1][0]).toBe('http://volume.test/v1/volumes/legacy%2Fsession');
  });

  it('rejects unknown protocol values at the single environment boundary', async () => {
    process.env.AGENT_SANDBOX_VOLUME_MANAGER_PROTOCOL = 'auto';
    await expect(loadConfig()).rejects.toThrow('AGENT_SANDBOX_VOLUME_MANAGER_PROTOCOL');
  });

  it('classifies only exact ensure HTTP 401 as authentication rejection before effect', async () => {
    const { prepareVolumeManagerConfig, getVolumeManagerConfig } = await loadConfig();
    const { VolumeManagerAuthRejectedBeforeEffectError } = await import(
      '@fastgpt/service/core/ai/sandbox/errors'
    );
    const prepared = prepareVolumeManagerConfig({ sandboxId: 'session-1' });
    for (const status of [401, 400, 403]) {
      fetchMock.mockResolvedValueOnce({ ok: false, status, text: async () => 'Unauthorized' });
      const result = getVolumeManagerConfig('session-1', prepared);
      if (status === 401)
        await expect(result).rejects.toBeInstanceOf(VolumeManagerAuthRejectedBeforeEffectError);
      else
        await expect(result).rejects.not.toBeInstanceOf(VolumeManagerAuthRejectedBeforeEffectError);
    }
  });
});
