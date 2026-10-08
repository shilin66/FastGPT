import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import JSON5 from 'json5';
import {
  ensureSandboxEditorDefaults,
  sandboxEditorDefaultsScript
} from '@fastgpt/service/core/ai/sandbox/editorDefaults';

const execute = promisify(execFile);

describe('Sandbox IDE full workbench defaults', () => {
  let directory: string;
  let settings: string;
  const configure = () => execute('python3', ['-c', sandboxEditorDefaultsScript, directory]);

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sandbox-editor-defaults-'));
    settings = join(directory, 'settings.json');
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('undoes terminal editor startup without changing comments, nested preferences or strings', async () => {
    const original = `\uFEFF{
  // Existing preferences
  "workbench.startupEditor": "terminal",
  "window.menuBarVisibility": "visible",
  "editor.fontSize": 17,
  "nested": { "workbench.startupEditor": "none", },
  "url": "https://example.com/a/*b*/",
}`;
    await writeFile(settings, original);
    await chmod(settings, 0o640);
    await configure();
    expect(await readFile(settings, 'utf8')).toBe(
      original.replace('"workbench.startupEditor": "terminal"', '"workbench.startupEditor": "none"')
    );
    expect((await stat(settings)).mode & 0o777).toBe(0o640);
  });

  it('inserts a missing startup preference and preserves existing JSONC', async () => {
    await writeFile(settings, '{ /* preferences */ "editor.fontSize": 17, }');
    await configure();
    const result = await readFile(settings, 'utf8');
    expect(JSON5.parse(result)).toEqual({
      'workbench.startupEditor': 'none',
      'window.menuBarVisibility': 'visible',
      'editor.fontSize': 17
    });
    expect(result).toContain('/* preferences */');
  });

  it('initializes a missing settings file', async () => {
    await configure();
    expect(JSON5.parse(await readFile(settings, 'utf8'))).toEqual({
      'workbench.startupEditor': 'none',
      'window.menuBarVisibility': 'visible'
    });
  });

  it('marks the previous startup migration complete so an older replica cannot undo the layout', async () => {
    await configure();
    expect(await readFile(join(directory, '.omni-editor-startup-v1'), 'utf8')).toBe('1\n');
  });

  it('preserves a custom startup preference byte for byte', async () => {
    const original =
      '{ "workbench.startupEditor": "welcomePage", "window.menuBarVisibility": "compact", "editor.fontSize": 19 }';
    await writeFile(settings, original);
    await configure();
    expect(await readFile(settings, 'utf8')).toBe(original);
  });

  it('respects explicit layout preferences after the first migration', async () => {
    await writeFile(settings, '{ "workbench.startupEditor": "none" }');
    await configure();
    const explicitPreference =
      '{ "workbench.startupEditor": "terminal", "workbench.statusBar.visible": false, "editor.fontSize": 19 }';
    await writeFile(settings, explicitPreference);
    await configure();
    expect(await readFile(settings, 'utf8')).toBe(explicitPreference);
  });

  it.each([
    '{ "workbench.startupEditor": "none",',
    '{ "workbench.startupEditor": "none", "workbench.startupEditor": "welcomePage" }'
  ])('skips invalid or ambiguous settings without consuming the migration', async (original) => {
    await writeFile(settings, original);
    expect((await configure()).stdout.trim()).toBe('editor-settings-skipped');
    expect(await readFile(settings, 'utf8')).toBe(original);
    await writeFile(settings, '{ "workbench.startupEditor": "none" }');
    await configure();
    expect(JSON5.parse(await readFile(settings, 'utf8'))['workbench.startupEditor']).toBe('none');
  });

  it('does not overwrite settings reached through a symlink', async () => {
    const target = join(directory, 'external-settings.json');
    const original = '{ "workbench.startupEditor": "none" }';
    await writeFile(target, original);
    await symlink(target, settings);
    expect((await configure()).stdout.trim()).toBe('editor-settings-skipped');
    expect(await readFile(target, 'utf8')).toBe(original);
  });

  it('serializes concurrent initialization without losing preferences', async () => {
    await writeFile(settings, '{ "editor.fontSize": 20 }');
    await Promise.all([configure(), configure(), configure()]);
    expect(JSON5.parse(await readFile(settings, 'utf8'))).toEqual({
      'workbench.startupEditor': 'none',
      'window.menuBarVisibility': 'visible',
      'editor.fontSize': 20
    });
  });

  it('restores built-in workbench controls and editing features from the old image', async () => {
    await writeFile(
      settings,
      JSON.stringify({
        'workbench.startupEditor': 'terminal',
        'workbench.activityBar.location': 'hidden',
        'workbench.statusBar.visible': false,
        'workbench.editor.showTabs': 'none',
        'workbench.editor.editorActionsLocation': 'hidden',
        'workbench.layoutControl.enabled': false,
        'window.commandCenter': false,
        'window.menuBarVisibility': 'hidden',
        'editor.minimap.enabled': false,
        'editor.hover.enabled': 'off',
        'editor.inlineSuggest.enabled': false,
        'chat.disableAIFeatures': true,
        'telemetry.telemetryLevel': 'off',
        'extensions.autoUpdate': false,
        'editor.fontSize': 19
      })
    );
    await writeFile(join(directory, '.omni-editor-startup-v1'), '1\n');
    await configure();
    expect(JSON5.parse(await readFile(settings, 'utf8'))).toEqual({
      'workbench.startupEditor': 'none',
      'window.menuBarVisibility': 'visible',
      'telemetry.telemetryLevel': 'off',
      'extensions.autoUpdate': false,
      'editor.fontSize': 19
    });
  });

  it('removes only historical overrides and preserves custom values and JSONC comments', async () => {
    const original = `{
      // Keep this explanation
      "workbench.startupEditor": "welcomePage",
      "window.menuBarVisibility": "compact",
      "workbench.statusBar.visible": /* user note */ false,
      "workbench.editor.showTabs": "multiple",
      "window.commandCenter": true,
      "editor.inlineSuggest.enabled": true,
      "nested": { "workbench.statusBar.visible": false },
    }`;
    await writeFile(settings, original);
    await configure();
    const result = await readFile(settings, 'utf8');
    expect(result).toContain('// Keep this explanation');
    expect(result).toContain('/* user note */');
    expect(JSON5.parse(result)).toEqual({
      'workbench.startupEditor': 'welcomePage',
      'window.menuBarVisibility': 'compact',
      'workbench.editor.showTabs': 'multiple',
      'window.commandCenter': true,
      'editor.inlineSuggest.enabled': true,
      nested: { 'workbench.statusBar.visible': false }
    });
  });

  it('keeps JSONC valid when all old presentation overrides are removed', async () => {
    await writeFile(
      settings,
      '{ "workbench.statusBar.visible": false, "workbench.activityBar.location": "hidden" }'
    );
    await configure();
    expect(JSON5.parse(await readFile(settings, 'utf8'))).toEqual({
      'workbench.startupEditor': 'none',
      'window.menuBarVisibility': 'visible'
    });
  });

  it('accepts a successful provider migration receipt', async () => {
    expect(
      await ensureSandboxEditorDefaults({
        execute: vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'editor-settings-ready' })
      })
    ).toBe(true);
  });

  it('allows IDE access when the provider skips migration or fails', async () => {
    expect(
      await ensureSandboxEditorDefaults({
        execute: vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'editor-settings-skipped' })
      })
    ).toBe(false);
    expect(
      await ensureSandboxEditorDefaults({
        execute: vi.fn().mockRejectedValue(new Error('private provider error'))
      })
    ).toBe(false);
  });
});
