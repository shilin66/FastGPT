import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProcessPool } from '../../src/pool/process-pool';
import { getLogger, LogCategories } from '../../src/utils/logger';

describe('ProcessPool 可观测性', () => {
  let pool: ProcessPool | undefined;

  afterEach(async () => {
    vi.clearAllMocks();
    await pool?.shutdown();
  });

  it('排队请求获得 worker 后记录关联 ID 和排队耗时', async () => {
    const infoSpy = vi
      .spyOn(getLogger(LogCategories.MODULE.SANDBOX.SERVER), 'info')
      .mockImplementation(() => {});
    pool = new ProcessPool(1);
    await pool.init();

    const firstRequest = {
      code: 'async function main() { await new Promise((resolve) => setTimeout(resolve, 100)); return { ok: true }; }',
      variables: {},
      requestId: 'running-request'
    };
    const queuedRequest = {
      code: 'async function main() { return { ok: true }; }',
      variables: {},
      requestId: 'queued-request'
    };

    await Promise.all([pool.execute(firstRequest), pool.execute(queuedRequest)]);

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('sandbox.pool.worker_acquired'),
      expect.objectContaining({
        requestId: 'queued-request',
        language: 'JS',
        workerId: expect.any(Number),
        queueWaitMs: expect.any(Number)
      })
    );
  });
});
