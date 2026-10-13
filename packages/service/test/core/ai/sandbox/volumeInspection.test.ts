import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  inspectSessionVolume,
  type PreparedVolumeManagerConfig
} from '@fastgpt/service/core/ai/sandbox/config';

const prepared: PreparedVolumeManagerConfig = {
  binding: {
    baseUrl: 'http://volume.test',
    protocol: 'claimName',
    target: 'original-volume',
    ensured: true
  },
  storage: {
    volumes: [{ name: 'workspace', claimName: 'original-volume', mountPath: '/workspace' }]
  },
  mountPath: '/workspace',
  token: 'test-token'
};
afterEach(() => vi.unstubAllGlobals());

describe('read-only volume inspection', () => {
  it.each([true, false])('accepts explicit volume existence: %s', async (exists) => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ claimName: 'original-volume', exists }), { status: 200 })
      );
    vi.stubGlobal('fetch', fetch);
    expect(await inspectSessionVolume('workspace-1', prepared)).toBe(exists);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe(
      'http://volume.test/v1/volumes/original-volume?mode=claimName'
    );
    expect(fetch.mock.calls[0][1].method).toBeUndefined();
  });

  it.each([401, 404, 500])('does not interpret HTTP %i as missing files', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
    await expect(inspectSessionVolume('workspace-1', prepared)).rejects.toThrow();
  });

  it('rejects a response for a different volume', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ claimName: 'other-volume', exists: false }), {
          status: 200
        })
      )
    );
    await expect(inspectSessionVolume('workspace-1', prepared)).rejects.toThrow('binding mismatch');
  });
});
