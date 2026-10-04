import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const VALID_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const VOLUME_NAME = `omni-${VALID_ID}`;

// Mock env before importing driver
vi.mock('../../src/env', () => ({
  env: {
    VM_DOCKER_SOCKET: '/var/run/docker.sock',
    VM_VOLUME_NAME_PREFIX: 'omni'
  }
}));

describe('DockerVolumeDriver', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ensure returns created=false when volume already exists', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
    const { DockerVolumeDriver } = await import('../../src/drivers/DockerVolumeDriver');
    const driver = new DockerVolumeDriver();
    const result = await driver.ensure(VALID_ID);
    expect(result).toEqual({ claimName: VOLUME_NAME, created: false });
  });

  it('ensure creates volume on 404', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, status: 201 });
    const { DockerVolumeDriver } = await import('../../src/drivers/DockerVolumeDriver');
    const driver = new DockerVolumeDriver();
    const result = await driver.ensure(VALID_ID);
    expect(result).toEqual({ claimName: VOLUME_NAME, created: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('creates a requested claim name exactly once without adding a prefix', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, status: 201 });
    const { DockerVolumeDriver } = await import('../../src/drivers/DockerVolumeDriver');
    const driver = new DockerVolumeDriver();
    const result = await driver.ensure('omni-requested-volume', 'claimName');
    expect(result).toEqual({ claimName: 'omni-requested-volume', created: true });
    expect(fetchMock.mock.calls[0][0]).toContain('/volumes/omni-requested-volume');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({
      Name: 'omni-requested-volume'
    });
  });

  it('ensure throws on unexpected inspect error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'server error' });
    const { DockerVolumeDriver } = await import('../../src/drivers/DockerVolumeDriver');
    const driver = new DockerVolumeDriver();
    await expect(driver.ensure(VALID_ID)).rejects.toThrow('500');
  });

  it('remove treats 404 as success', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' });
    const { DockerVolumeDriver } = await import('../../src/drivers/DockerVolumeDriver');
    const driver = new DockerVolumeDriver();
    await expect(driver.remove(VALID_ID)).resolves.toBeUndefined();
  });

  it('removes an exact claim without adding a prefix', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });
    const { DockerVolumeDriver } = await import('../../src/drivers/DockerVolumeDriver');
    const driver = new DockerVolumeDriver();
    await driver.remove('fastgpt-session-legacy', 'claimName');
    expect(fetchMock.mock.calls[0][0]).toContain('/volumes/fastgpt-session-legacy');
  });
});
