import { beforeEach, describe, expect, it, vi } from 'vitest';
import { retryAppDeleteJob } from '@fastgpt/service/core/app/delete';

const fake = vi.hoisted(() => ({ getJob: vi.fn(), add: vi.fn(), retry: vi.fn() }));
vi.mock('@fastgpt/service/common/bullmq', () => ({
  QueueNames: { appDelete: 'appDelete' },
  getQueue: () => fake,
  getWorker: vi.fn()
}));
vi.mock('@fastgpt/service/core/app/delete/processor', () => ({ appDeleteProcessor: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

describe('App deletion compensation', () => {
  it('retries an existing failed job instead of adding the same ignored jobId', async () => {
    fake.getJob.mockResolvedValue({ getState: async () => 'failed', retry: fake.retry });
    await retryAppDeleteJob({ appId: 'app', teamId: 'team' });
    expect(fake.retry).toHaveBeenCalledWith('failed');
    expect(fake.add).not.toHaveBeenCalled();
  });
  it.each(['active', 'waiting', 'delayed', 'completed'])(
    'keeps the %s job intact',
    async (state) => {
      fake.getJob.mockResolvedValue({ getState: async () => state, retry: fake.retry });
      await retryAppDeleteJob({ appId: 'app', teamId: 'team' });
      expect(fake.retry).not.toHaveBeenCalled();
      expect(fake.add).not.toHaveBeenCalled();
    }
  );
  it('creates a missing deletion job', async () => {
    fake.getJob.mockResolvedValue(undefined);
    await retryAppDeleteJob({ appId: 'app', teamId: 'team' });
    expect(fake.add).toHaveBeenCalledWith(
      'delete_app',
      { appId: 'app', teamId: 'team' },
      expect.objectContaining({ jobId: 'team-app' })
    );
  });
});
