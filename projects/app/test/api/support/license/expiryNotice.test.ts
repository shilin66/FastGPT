import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemMsg } from '@fastgpt/service/support/user/inform/schema';
import expiryNotice from '@/pages/api/support/license/expiryNotice';
import { licenseRenewedSystemMessage } from '@fastgpt/global/common/system/licenseExpiry';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), config: vi.fn(), metadata: vi.fn() }));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/auth/common', () => ({ parseHeaderCert: mocks.auth }));
vi.mock('@fastgpt/service/common/system/config/controller', () => ({
  getFastGPTConfigFromDB: mocks.config
}));
vi.mock('@fastgpt/service/common/license/verify', () => ({
  getLicenseExpiryMetadata: mocks.metadata,
  getLicenseConfigurationId: (config: { clientId: string }) => `configuration-${config.clientId}`
}));

const day = 86400000;
const config = {
  clientId: 'client-1',
  licenseKey: 'public-key',
  licenseServer: 'https://license.test'
};
const metadata = (days: number) => ({
  id: 'license-1',
  expiresAt: new Date(Date.now() + days * day).toISOString()
});
const req = { headers: {} } as any;
const res = { setHeader: vi.fn() } as any;

describe('license expiry system notice', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'member-1' });
    mocks.config.mockResolvedValue({ licenseData: config });
    mocks.metadata.mockResolvedValue(metadata(20));
    await MongoSystemMsg.create({ id: 'announcement-1', content: '普通公告' });
  });
  it('makes the current reminder available to an ordinary logged-in member', async () => {
    expect(await expiryNotice(req, res)).toMatchObject({ stage: 30, remainingDays: 20 });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });
  it('rejects anonymous users before fetching license data', async () => {
    mocks.auth.mockRejectedValue('unauthorized');
    await expect(expiryNotice(req, res)).rejects.toBe('unauthorized');
    expect(mocks.metadata).not.toHaveBeenCalled();
  });
  it('does not expose the token, key or full license configuration', async () => {
    const notice = await expiryNotice(req, res);
    expect(Object.keys(notice!).sort()).toEqual([
      'content',
      'expiresAt',
      'id',
      'remainingDays',
      'serverNow',
      'stage'
    ]);
  });
  it('returns no notice outside thirty days or after expiry', async () => {
    mocks.metadata.mockResolvedValue(metadata(60));
    expect(await expiryNotice(req, res)).toBeNull();
    mocks.metadata.mockResolvedValue(metadata(-1));
    expect(await expiryNotice(req, res)).toBeNull();
  });
  it('uses the current stage after a user misses the exact checkpoint date', async () => {
    mocks.metadata.mockResolvedValue(metadata(10));
    expect(await expiryNotice(req, res)).toMatchObject({ stage: 15 });
    mocks.metadata.mockResolvedValue(metadata(5));
    expect(await expiryNotice(req, res)).toMatchObject({ stage: 7 });
  });
  it('does not reset the announcement when first establishing the license baseline', async () => {
    await expiryNotice(req, res);
    expect(await MongoSystemMsg.findOne().lean()).toMatchObject({
      id: 'announcement-1',
      content: '普通公告'
    });
  });
  it('restores the exact welcome announcement after renewal', async () => {
    await expiryNotice(req, res);
    mocks.metadata.mockResolvedValue(metadata(365));
    expect(await expiryNotice(req, res)).toBeNull();
    const message = await MongoSystemMsg.findOne().lean();
    expect(message?.content).toBe(licenseRenewedSystemMessage);
    expect(message?.id).not.toBe('announcement-1');
  });
  it('does not restore announcements when only a token is refreshed', async () => {
    const snapshot = metadata(20);
    mocks.metadata.mockResolvedValue(snapshot);
    await expiryNotice(req, res);
    await expiryNotice(req, res);
    expect(await MongoSystemMsg.findOne().lean()).toMatchObject({
      id: 'announcement-1',
      content: '普通公告'
    });
  });
  it('does not treat a different license configuration as renewal', async () => {
    await expiryNotice(req, res);
    mocks.config.mockResolvedValue({ licenseData: { ...config, clientId: 'client-2' } });
    mocks.metadata.mockResolvedValue(metadata(365));
    await expiryNotice(req, res);
    expect((await MongoSystemMsg.findOne().lean())?.content).toBe('普通公告');
  });
  it('only restores once when multiple users concurrently detect renewal', async () => {
    await expiryNotice(req, res);
    const renewed = metadata(365);
    mocks.metadata.mockResolvedValue(renewed);
    await Promise.all(Array.from({ length: 5 }, () => expiryNotice(req, res)));
    const message = await MongoSystemMsg.findOne().lean();
    expect(message?.content).toBe(licenseRenewedSystemMessage);
    await expiryNotice(req, res);
    expect((await MongoSystemMsg.findOne().lean())?.id).toBe(message?.id);
  });
  it('does not regress the processed expiry or reset a new announcement from a stale instance', async () => {
    const original = metadata(20);
    const renewed = metadata(365);
    mocks.metadata.mockResolvedValue(original);
    await expiryNotice(req, res);
    mocks.metadata.mockResolvedValue(renewed);
    await expiryNotice(req, res);
    await MongoSystemMsg.updateOne(
      {},
      { $set: { id: 'admin-after-renewal', content: '续期后的新公告' } }
    );
    mocks.metadata.mockResolvedValueOnce(original).mockResolvedValueOnce(renewed);
    expect(await expiryNotice(req, res)).toBeNull();
    mocks.metadata.mockResolvedValue(renewed);
    await expiryNotice(req, res);
    expect(await MongoSystemMsg.findOne().lean()).toMatchObject({
      id: 'admin-after-renewal',
      content: '续期后的新公告',
      licenseExpiryState: { expiresAt: renewed.expiresAt }
    });
  });
  it('shares a single welcome document on concurrent first reads', async () => {
    await MongoSystemMsg.deleteMany({});
    await Promise.all(Array.from({ length: 5 }, () => expiryNotice(req, res)));
    expect(await MongoSystemMsg.countDocuments()).toBe(1);
  });
  it('retains stage templates and supports disabling reminders', async () => {
    await MongoSystemMsg.updateOne(
      {},
      { $set: { licenseExpiryReminder: { enabled: false, templates: { '30': '自定义提醒' } } } }
    );
    expect(await expiryNotice(req, res)).toBeNull();
    mocks.metadata.mockResolvedValue(metadata(365));
    await expiryNotice(req, res);
    expect(await MongoSystemMsg.findOne().lean()).toMatchObject({
      content: licenseRenewedSystemMessage,
      licenseExpiryReminder: { enabled: false, templates: { '30': '自定义提醒' } }
    });
  });
  it('fails quietly if the authorization service is unavailable', async () => {
    mocks.metadata.mockRejectedValue(new Error('offline'));
    expect(await expiryNotice(req, res)).toBeNull();
    expect((await MongoSystemMsg.findOne().lean())?.content).toBe('普通公告');
  });
});
