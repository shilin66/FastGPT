import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sandboxEditorHotCheckScript } from '@fastgpt/service/core/ai/sandbox/editor';

const execute = promisify(execFile);

describe('Sandbox editor local hot checks', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'editor-hot-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  const check = (health: string, loginStatus = 200) =>
    execute('python3', [
      '-c',
      `
from unittest.mock import patch
import json
${sandboxEditorHotCheckScript}
editor_settings_directory = ${JSON.stringify(directory)}
class Response:
    status = 200
    def read(self, size): return ${JSON.stringify(health)}.encode()
class Connection:
    def __init__(self, *args, **kwargs): pass
    def request(self, method, path): self.path = path; print('request:' + path)
    def getresponse(self):
        response = Response()
        if self.path == '/login': response.status = ${loginStatus}
        return response
    def close(self): pass
with patch('http.client.HTTPConnection', Connection):
    print('verified:' + str(check_running_editor()))
`
    ]);

  it.each(['alive', 'expired'])(
    'checks health, password mode and defaults together for %s',
    async (status) => {
      const result = await check(JSON.stringify({ status }));
      expect(result.stdout).toBe(
        'request:/healthz\nrequest:/login\neditor-settings-ready\neditor-ready\nverified:True\n'
      );
      expect(
        JSON.parse(await readFile(join(directory, 'settings.json'), 'utf8'))[
          'workbench.startupEditor'
        ]
      ).toBe('none');
    }
  );

  it.each(['{}', '[]', 'invalid', '{"status":"starting"}'])(
    'falls back when health is not ready: %s',
    async (health) => {
      const result = await check(health);
      expect(result.stdout).toBe('request:/healthz\nverified:False\n');
      expect(await readdir(directory)).toEqual([]);
    }
  );

  it.each([302, 401, 404, 500])(
    'rejects unverified password mode (%i) before changing settings',
    async (status) => {
      await expect(check('{"status":"alive"}', status)).rejects.toMatchObject({ code: 24 });
      expect(await readdir(directory)).toEqual([]);
    }
  );

  it('preserves custom preferences on repeat opens', async () => {
    await check('{"status":"alive"}');
    const custom = '{ "workbench.startupEditor": "welcomePage", "editor.fontSize": 18 }';
    await writeFile(join(directory, 'settings.json'), custom);
    await check('{"status":"alive"}');
    expect(await readFile(join(directory, 'settings.json'), 'utf8')).toBe(custom);
  });

  it('allows invalid user settings without overwriting them', async () => {
    await writeFile(join(directory, 'settings.json'), 'invalid settings');
    const result = await check('{"status":"alive"}');
    expect(result.stdout).toContain('editor-settings-skipped\neditor-ready');
    expect(await readFile(join(directory, 'settings.json'), 'utf8')).toBe('invalid settings');
  });
});
