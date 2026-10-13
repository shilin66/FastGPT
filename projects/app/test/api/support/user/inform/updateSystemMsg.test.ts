import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemMsg } from '@fastgpt/service/support/user/inform/schema';
import updateSystemMsg from '@/pages/api/support/user/inform/updateSystemMsg';

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({ authSystemAdmin: mocks.auth }));

const reminder = { enabled: true, templates: { '30': '还有 {{remainingDays}}' } };
const submit = (body: unknown) => updateSystemMsg({ body } as any, {} as any);
describe('system message and license reminder editing', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'root' });
    await MongoSystemMsg.create({ id: 'announcement-1', content: '原公告' });
  });
  it('rejects a non-root save before writing', async () => {
    mocks.auth.mockRejectedValue('unauthorized');
    await expect(submit({ content: '改公告' })).rejects.toBe('unauthorized');
    expect((await MongoSystemMsg.findOne().lean())?.content).toBe('原公告');
  });
  it('saves reminder configuration without resetting a normal announcement ID', async () => {
    await submit({ content: '原公告', licenseExpiryReminder: reminder });
    expect(await MongoSystemMsg.findOne().lean()).toMatchObject({
      id: 'announcement-1',
      content: '原公告',
      licenseExpiryReminder: reminder
    });
  });
  it('preserves reminder settings when an old client only updates content', async () => {
    await submit({ content: '原公告', licenseExpiryReminder: reminder });
    await submit({ content: '新公告' });
    const message = await MongoSystemMsg.findOne().lean();
    expect(message?.id).not.toBe('announcement-1');
    expect(message).toMatchObject({ content: '新公告', licenseExpiryReminder: reminder });
  });
  it('validates reminder settings at the boundary', async () => {
    await expect(
      submit({ content: '原公告', licenseExpiryReminder: { enabled: 'yes', templates: {} } })
    ).rejects.toBeDefined();
    expect((await MongoSystemMsg.findOne().lean())?.id).toBe('announcement-1');
  });
});
