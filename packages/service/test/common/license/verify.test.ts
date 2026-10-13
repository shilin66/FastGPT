import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { localCacheManager } from '@fastgpt/service/support/globalCache/cache';
import { getLicenseExpiryMetadata, verifyDbLicense } from '@fastgpt/service/common/license/verify';

vi.mock('axios', () => ({ default: { post: vi.fn(), isAxiosError: () => false } }));
vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn() }),
  LogCategories: { MODULE: { DATASET: { FILE: 'license' } } }
}));

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
const config = { clientId: 'client', licenseKey: publicKey, licenseServer: 'https://license.test' };
const response = (expiresAt = '2026-12-12T10:00:00.000Z') => ({
  data: {
    valid: true,
    token: jwt.sign({ clientId: config.clientId }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '3d'
    }),
    license: { id: 'license-1', expiresAt }
  }
});

describe('verified license expiry metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.localCache.clear();
    global.licenseData = config as any;
    vi.mocked(axios.post).mockResolvedValue(response());
  });
  afterEach(() => vi.useRealTimers());

  it('preserves business expiry after validation instead of the three-day JWT expiry', async () => {
    await verifyDbLicense();
    expect(await getLicenseExpiryMetadata(config)).toEqual({
      id: 'license-1',
      expiresAt: '2026-12-12T10:00:00.000Z'
    });
    expect(axios.post).toHaveBeenCalledTimes(1);
  });
  it('refreshes metadata even when a legacy token is already cached', async () => {
    localCacheManager.set(config.clientId, response().data.token, 60000);
    expect(await getLicenseExpiryMetadata(config)).not.toBeNull();
    expect(axios.post).toHaveBeenCalledTimes(1);
  });
  it('supports a legacy response without expiry metadata', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: { valid: true, token: response().data.token }
    });
    await expect(verifyDbLicense()).resolves.toBeUndefined();
    expect(await getLicenseExpiryMetadata(config)).toBeNull();
    expect(axios.post).toHaveBeenCalledTimes(1);
  });
  it('does not accept metadata when the signed client does not match', async () => {
    const result = response();
    result.data.token = jwt.sign({ clientId: 'other-client' }, privateKey, { algorithm: 'RS256' });
    vi.mocked(axios.post).mockResolvedValue(result);
    await expect(getLicenseExpiryMetadata(config)).rejects.toBeDefined();
  });
  it('does not accept metadata with an invalid signature', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { ...response().data, token: 'invalid' } });
    await expect(getLicenseExpiryMetadata(config)).rejects.toBeDefined();
  });
  it('ignores invalid expiry metadata without changing valid token verification', async () => {
    vi.mocked(axios.post).mockResolvedValue(response('2026-12-12'));
    await expect(verifyDbLicense()).resolves.toBeUndefined();
    expect(await getLicenseExpiryMetadata(config)).toBeNull();
  });
  it('coalesces concurrent requests for the same configuration', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => getLicenseExpiryMetadata(config))
    );
    expect(results.every((result) => result?.id === 'license-1')).toBe(true);
    expect(axios.post).toHaveBeenCalledTimes(1);
  });
  it('refreshes expiry after one hour so an external renewal is detected', async () => {
    vi.useFakeTimers();
    await getLicenseExpiryMetadata(config);
    vi.advanceTimersByTime(3600001);
    vi.mocked(axios.post).mockResolvedValue(response('2027-12-12T10:00:00.000Z'));
    expect((await getLicenseExpiryMetadata(config))?.expiresAt).toBe('2027-12-12T10:00:00.000Z');
  });
  it('isolates metadata when the license server changes', async () => {
    await getLicenseExpiryMetadata(config);
    vi.mocked(axios.post).mockResolvedValue(response('2027-12-12T10:00:00.000Z'));
    expect(
      (await getLicenseExpiryMetadata({ ...config, licenseServer: 'https://other.test' }))
        ?.expiresAt
    ).toBe('2027-12-12T10:00:00.000Z');
    expect(axios.post).toHaveBeenCalledTimes(2);
  });
});
