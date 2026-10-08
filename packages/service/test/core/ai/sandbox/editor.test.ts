import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@fastgpt/service/core/agentSkills/sandboxConfig', () => ({
  waitForSkillEditorReady: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@fastgpt/service/core/ai/sandbox/editorDefaults', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/editorDefaults')>()),
  ensureSandboxEditorDefaults: vi.fn().mockResolvedValue(true)
}));
import { ensureSandboxEditor } from '@fastgpt/service/core/ai/sandbox/editor';
import { waitForSkillEditorReady } from '@fastgpt/service/core/agentSkills/sandboxConfig';
import { ensureSandboxEditorDefaults } from '@fastgpt/service/core/ai/sandbox/editorDefaults';

describe('Sandbox editor process', () => {
  beforeEach(() => vi.clearAllMocks());
  it('rejects a healthy editor running without password authentication', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'editor-running' })
      .mockResolvedValueOnce({ exitCode: 24, stdout: '' });
    await expect(ensureSandboxEditor({ execute }, '/workspace')).rejects.toMatchObject({
      code: 'sandbox_editor_auth_required',
      statusCode: 409
    });
    expect(ensureSandboxEditorDefaults).not.toHaveBeenCalled();
  });
  it('reuses a running editor and verifies readiness', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'editor-running' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'editor-auth-password' });
    await ensureSandboxEditor({ execute }, '/workspace');
    expect(waitForSkillEditorReady).toHaveBeenCalledWith({ execute });
    expect(ensureSandboxEditorDefaults).toHaveBeenCalledWith({ execute });
    expect(vi.mocked(waitForSkillEditorReady).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(ensureSandboxEditorDefaults).mock.invocationCallOrder[0]
    );
  });
  it('finishes a verified hot start in a single remote execution', async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: 'editor-settings-ready\neditor-ready' });
    await ensureSandboxEditor({ execute }, '/workspace');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(waitForSkillEditorReady).not.toHaveBeenCalled();
    expect(ensureSandboxEditorDefaults).not.toHaveBeenCalled();
  });

  it('rejects unsupported images before publishing an endpoint', async () => {
    const execute = vi.fn().mockResolvedValue({ exitCode: 22, stdout: '' });
    await expect(ensureSandboxEditor({ execute }, '/workspace')).rejects.toThrow(
      'sandbox_editor_unsupported'
    );
    expect(ensureSandboxEditorDefaults).not.toHaveBeenCalled();
  });
  it('does not take over a port owned by another process', async () => {
    const execute = vi.fn().mockResolvedValue({ exitCode: 23, stdout: '' });
    await expect(ensureSandboxEditor({ execute }, '/workspace')).rejects.toThrow(
      'sandbox_editor_unavailable'
    );
  });
  it('does not treat an unknown exec receipt as successful startup', async () => {
    const execute = vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'arbitrary' });
    await expect(ensureSandboxEditor({ execute }, '/workspace')).rejects.toThrow(
      'sandbox_editor_unavailable'
    );
  });
  it('reports a bounded readiness timeout', async () => {
    vi.mocked(waitForSkillEditorReady).mockRejectedValueOnce(new Error('not ready'));
    await expect(
      ensureSandboxEditor(
        { execute: vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'editor-starting' }) },
        '/workspace'
      )
    ).rejects.toMatchObject({ code: 'sandbox_editor_start_timeout', statusCode: 504 });
    expect(ensureSandboxEditorDefaults).not.toHaveBeenCalled();
  });
  it('prepares defaults for a newly started editor while allowing skipped settings migration', async () => {
    vi.mocked(ensureSandboxEditorDefaults).mockResolvedValueOnce(false);
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'editor-starting' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'editor-auth-password' });
    await expect(ensureSandboxEditor({ execute }, '/workspace')).resolves.toBeUndefined();
    expect(ensureSandboxEditorDefaults).toHaveBeenCalledWith({ execute });
  });
});
