import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { waitForSkillEditorReady } from '@fastgpt/service/core/agentSkills/sandboxConfig';

const makeProbe = () => ({
  host: 'sandbox.invalid',
  port: 44772,
  protocol: 'http' as const,
  url: 'http://sandbox.invalid/execd',
  execute: vi.fn<ISandbox['execute']>()
});

describe('Skill editor readiness', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([401, 500])('does not accept a gateway HTTP %i as a ready editor', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));
    const probe = makeProbe();
    probe.execute.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'connection refused' });

    await expect(waitForSkillEditorReady(probe, { timeoutMs: 25, intervalMs: 1 })).rejects.toThrow(
      'Skill editor'
    );
    expect(probe.execute).toHaveBeenCalled();
  });

  it('waits for the editor health check, not an unrelated successful command', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const probe = makeProbe();
    probe.execute
      .mockRejectedValueOnce(new Error('provider temporarily unavailable'))
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'unrelated', stderr: '' })
      .mockResolvedValue({ exitCode: 0, stdout: 'skill-editor-ready\n', stderr: '' });

    await expect(
      waitForSkillEditorReady(probe, { timeoutMs: 100, intervalMs: 1 })
    ).resolves.toBeUndefined();
    expect(probe.execute).toHaveBeenCalledTimes(3);
    expect(probe.execute).toHaveBeenLastCalledWith(
      expect.stringContaining("HTTPConnection('127.0.0.1', 8080"),
      expect.objectContaining({ maxOutputBytes: 1024 })
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
