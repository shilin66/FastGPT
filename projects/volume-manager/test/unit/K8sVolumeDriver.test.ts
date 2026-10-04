import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const VALID_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const VOLUME_NAME = `omni-${VALID_ID}`;

vi.mock('../../src/env', () => ({
  env: {
    VM_K8S_NAMESPACE: 'opensandbox',
    VM_VOLUME_NAME_PREFIX: 'omni',
    VM_K8S_PVC_STORAGE_CLASS: 'standard',
    VM_K8S_PVC_STORAGE_SIZE: '1Gi'
  }
}));

// Mock token and CA file reads
vi.mock('fs', () => ({
  readFileSync: vi.fn((path: string) => {
    if (path.endsWith('ca.crt')) return 'mock-ca-cert';
    return 'mock-token';
  })
}));

describe('K8sVolumeDriver', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ensure returns created=false when PVC already exists', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ metadata: { uid: 'uid-original' } })
    });
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();
    const result = await driver.ensure(VALID_ID);
    expect(result).toEqual({ claimName: VOLUME_NAME, created: false });
  });

  it('ensure creates PVC on 404', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, status: 201 });
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();
    const result = await driver.ensure(VALID_ID);
    expect(result).toEqual({ claimName: VOLUME_NAME, created: true });
  });

  it('ensure throws on unexpected GET error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'forbidden' });
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();
    await expect(driver.ensure(VALID_ID)).rejects.toThrow('403');
  });

  it('fetch calls include tls.ca from ca.crt', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ metadata: { uid: 'uid-original' } })
    });
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();
    await driver.ensure(VALID_ID);
    const [, opts] = fetchMock.mock.calls[0];
    expect((opts as any).tls?.ca).toBe('mock-ca-cert');
  });

  it('waits for the original PVC generation to disappear after delete acceptance', async () => {
    const pvc = (uid: string, deleting = false) => ({
      ok: true,
      status: 200,
      json: async () => ({ metadata: { uid, ...(deleting ? { deletionTimestamp: 'now' } : {}) } })
    });
    fetchMock
      .mockResolvedValueOnce(pvc('old'))
      .mockResolvedValueOnce({ ok: true, status: 202 })
      .mockResolvedValueOnce(pvc('old', true))
      .mockResolvedValueOnce(pvc('replacement'));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    await new K8sVolumeDriver(undefined, undefined, 1000, 1).remove(VALID_ID);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      preconditions: { uid: 'old' }
    });
    expect(fetchMock.mock.calls.filter(([, opts]) => opts.method === 'DELETE')).toHaveLength(1);
  });

  it('waits for a terminating volume before creating a new generation', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ metadata: { uid: 'old', deletionTimestamp: 'now' } })
      })
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, status: 201 });
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    expect(await new K8sVolumeDriver(undefined, undefined, 1000, 1).ensure(VALID_ID)).toMatchObject(
      { created: true }
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('remove treats 404 as success', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' });
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();
    await expect(driver.remove(VALID_ID)).resolves.toBeUndefined();
  });

  it('remove throws on unexpected DELETE error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ metadata: { uid: 'uid-original' } })
    });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'error' });
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();
    await expect(driver.remove(VALID_ID)).rejects.toThrow('500');
  });
});
