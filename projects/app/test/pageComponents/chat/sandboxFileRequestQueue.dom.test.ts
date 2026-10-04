import { describe, expect, it, vi } from 'vitest';
import { createSandboxFileRequestQueue } from '@/pageComponents/chat/SandboxEditor/requestQueue';

describe('sandbox file request queue', () => {
  it('opens a file without waiting for background directory requests', async () => {
    vi.useFakeTimers();
    try {
      const run = createSandboxFileRequestQueue();
      const start = Date.now();
      const directory = () => new Promise<void>((resolve) => setTimeout(resolve, 1000));
      const directories = Array.from({ length: 3 }, () =>
        run(directory, { mode: 'read', priority: 'background' })
      );
      let openedAfterMs = 0;
      const file = run(() => new Promise<void>((resolve) => setTimeout(resolve, 100)), {
        mode: 'read'
      }).then(() => {
        openedAfterMs = Date.now() - start;
      });
      await vi.runAllTimersAsync();
      await Promise.all([...directories, file]);
      expect(openedAfterMs).toBe(100);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps saves exclusive and does not let later reads overtake them', async () => {
    const run = createSandboxFileRequestQueue();
    let finishRead!: () => void;
    let finishSave!: () => void;
    const read = run(() => new Promise<void>((resolve) => (finishRead = resolve)), {
      mode: 'read'
    });
    const saveRequest = vi.fn(() => new Promise<void>((resolve) => (finishSave = resolve)));
    const save = run(saveRequest);
    const nextRequest = vi.fn().mockResolvedValue('saved content');
    const next = run(nextRequest, { mode: 'read' });
    await Promise.resolve();
    expect(saveRequest).not.toHaveBeenCalled();
    expect(nextRequest).not.toHaveBeenCalled();
    finishRead();
    await read;
    await Promise.resolve();
    expect(saveRequest).toHaveBeenCalledOnce();
    expect(nextRequest).not.toHaveBeenCalled();
    finishSave();
    await save;
    await expect(next).resolves.toBe('saved content');
  });

  it('bounds reads and reserves room for interactive requests during a large refresh', async () => {
    const run = createSandboxFileRequestQueue();
    const finish: (() => void)[] = [];
    const request = vi.fn(() => new Promise<void>((resolve) => finish.push(resolve)));
    const backgrounds = Array.from({ length: 4 }, () =>
      run(request, { mode: 'read', priority: 'background' })
    );
    const clicks = Array.from({ length: 3 }, () => run(request, { mode: 'read' }));
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(4);
    expect(finish).toHaveLength(4);
    finish.shift()!();
    await backgrounds[0];
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(5);
    finish.splice(0).forEach((resolve) => resolve());
    await Promise.all(clicks);
    await Promise.resolve();
    finish.splice(0).forEach((resolve) => resolve());
    await Promise.all(backgrounds);
    expect(request).toHaveBeenCalledTimes(7);
  });

  it('keeps the busy indicator until every retrying read finishes', async () => {
    vi.useFakeTimers();
    try {
      const waiting = vi.fn();
      const run = createSandboxFileRequestQueue(waiting);
      const busy = { message: 'operation_conflict: Sandbox is busy before execution' };
      const first = run(vi.fn().mockRejectedValueOnce(busy).mockResolvedValue('first'), {
        mode: 'read'
      });
      const second = run(
        vi.fn().mockRejectedValueOnce(busy).mockRejectedValueOnce(busy).mockResolvedValue('second'),
        { mode: 'read' }
      );
      await vi.advanceTimersByTimeAsync(500);
      await expect(first).resolves.toBe('first');
      expect(waiting.mock.calls).toEqual([[true]]);
      await vi.runAllTimersAsync();
      await expect(second).resolves.toBe('second');
      expect(waiting.mock.calls).toEqual([[true], [false]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips requests still queued for an obsolete refresh', async () => {
    const run = createSandboxFileRequestQueue();
    const controller = new AbortController();
    let finish!: () => void;
    const start = run(() => new Promise<void>((resolve) => (finish = resolve)));
    const list = vi.fn().mockResolvedValue('old listing');
    const obsolete = run(list, { mode: 'read', priority: 'background', signal: controller.signal });
    const rejected = expect(obsolete).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    const latest = run(() => Promise.resolve('new listing'), { mode: 'read' });
    finish();
    await start;
    await rejected;
    await expect(latest).resolves.toBe('new listing');
    expect(list).not.toHaveBeenCalled();
  });

  it('serializes exclusive requests such as workspace starts and saves', async () => {
    const run = createSandboxFileRequestQueue();
    let releaseFirst: (() => void) | undefined;
    const first = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          releaseFirst = () => resolve('root');
        })
    );
    const second = vi.fn().mockResolvedValue('folder');

    const root = run(first);
    const folder = run(second);
    await Promise.resolve();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    releaseFirst?.();
    await expect(root).resolves.toBe('root');
    await expect(folder).resolves.toBe('folder');
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('retries a transient lifecycle conflict and returns the successful file list', async () => {
    vi.useFakeTimers();
    try {
      const run = createSandboxFileRequestQueue();
      const request = vi
        .fn()
        .mockRejectedValueOnce({
          message: 'operation_conflict: Sandbox is busy before execution'
        })
        .mockResolvedValue({ files: ['bubble_sort.py'] });
      const result = run(request);

      await vi.runAllTimersAsync();
      await expect(result).resolves.toEqual({ files: ['bubble_sort.py'] });
      expect(request).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry an unrelated error and keeps the queue usable', async () => {
    const run = createSandboxFileRequestQueue();
    const failure = new Error('permission denied');
    await expect(run(() => Promise.reject(failure))).rejects.toBe(failure);
    await expect(run(() => Promise.resolve('next request'))).resolves.toBe('next request');
  });

  it('does not retry a permanent sandbox identity conflict', async () => {
    const run = createSandboxFileRequestQueue();
    const request = vi.fn().mockRejectedValue({
      message: 'operation_conflict: Sandbox ownership changed'
    });

    await expect(run(request)).rejects.toEqual({
      message: 'operation_conflict: Sandbox ownership changed'
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not replay a request after an activity loses its lease', async () => {
    const run = createSandboxFileRequestQueue();
    const request = vi.fn().mockRejectedValue({
      message: 'operation_conflict: Sandbox lifecycle operation no longer owns the resource'
    });

    await expect(run(request)).rejects.toMatchObject({
      message: 'operation_conflict: Sandbox lifecycle operation no longer owns the resource'
    });
    expect(request).toHaveBeenCalledOnce();
  });
});
