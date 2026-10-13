import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import z from 'zod';
import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { ensureSandboxEditor } from '@fastgpt/service/core/ai/sandbox/editor';

const docker = promisify(execFile);
const resultSchema = z.object({ stdout: z.string(), stderr: z.string(), exitCode: z.number() });
const runCommand = `import json, subprocess, sys
result = subprocess.run(['sh', '-c', sys.argv[1]], capture_output=True, text=True)
print(json.dumps(dict(stdout=result.stdout, stderr=result.stderr, exitCode=result.returncode)))`;
const inspectEditor = `import json, os, select
from pathlib import Path
receipt = json.loads(Path('/tmp/omni-chat-editor/process.json').read_text())
editor_pid = receipt['pid']
editor_fd = os.pidfd_open(editor_pid)
`;

describe.sequential('Managed code-server idle lifecycle in a real container', () => {
  let container: string;
  let provider: Pick<ISandbox, 'execute'>;

  beforeEach(async () => {
    container = `fastgpt-editor-idle-${randomUUID()}`;
    await docker('docker', [
      'run',
      '-d',
      '--pull',
      'never',
      '--name',
      container,
      '--network',
      'none',
      '--entrypoint',
      'sleep',
      process.env.SANDBOX_EDITOR_TEST_IMAGE ??
        'registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-agent-sandbox:v0.1',
      'infinity'
    ]);
    provider = {
      execute: async (command, options) => {
        const { stdout } = await docker(
          'docker',
          ['exec', container, 'python3', '-c', runCommand, command],
          { timeout: options?.timeoutMs ?? 150_000, maxBuffer: 1024 * 1024 }
        );
        return resultSchema.parse(JSON.parse(stdout));
      }
    };
    await provider.execute('mkdir -p /workspace');
    await ensureSandboxEditor(provider, '/workspace');
  }, 45_000);

  afterEach(async () => {
    await docker('docker', ['rm', '-f', container]);
  });

  it('serves the authenticated workspace after a cold editor start', async () => {
    const result = await provider.execute(`python3 - <<'PY'
import http.client, json
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlencode
config = Path.home() / '.config/code-server/config.yaml'
password = next(line.split(':', 1)[1].strip() for line in config.read_text().splitlines()
    if line.startswith('password:'))
connection = http.client.HTTPConnection('127.0.0.1', 8080, timeout=5)
try:
    connection.request('GET', '/healthz')
    response = connection.getresponse()
    health = json.loads(response.read())
    connection.request('POST', '/login', urlencode({'password': password}),
        {'Content-Type': 'application/x-www-form-urlencoded'})
    response = connection.getresponse()
    login_status = response.status
    cookies = SimpleCookie()
    cookies.load(response.getheader('Set-Cookie', ''))
    response.read()
    connection.request('GET', '/?folder=/workspace', headers={
        'Cookie': '; '.join(cookie.key + '=' + cookie.value for cookie in cookies.values())})
    response = connection.getresponse()
    print(json.dumps(dict(health=health['status'], login_status=login_status,
        workspace_status=response.status, content_type=response.getheader('Content-Type'),
        has_content=bool(response.read()))))
finally:
    connection.close()
PY`);
    expect(result.exitCode).toBe(0);
    const response = z
      .object({
        health: z.enum(['alive', 'expired']),
        login_status: z.number(),
        workspace_status: z.number(),
        content_type: z.string(),
        has_content: z.boolean()
      })
      .parse(JSON.parse(result.stdout));
    expect(response.login_status).toBe(302);
    expect(response.workspace_status).toBe(200);
    expect(response.content_type).toContain('text/html');
    expect(response.has_content).toBe(true);
  });

  it('exits without stopping independent Agent work and restarts in the same workspace', async () => {
    const result = await provider.execute(
      `python3 - <<'PY'
${inspectEditor}
import subprocess
agent = subprocess.Popen(['sleep', '600'], start_new_session=True,
    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
Path('/workspace/agent.pid').write_text(str(agent.pid))
Path('/workspace/kept.txt').write_text('agent-output')
stopped = bool(select.select([editor_fd], [], [], 135)[0])
os.close(editor_fd)
os.kill(agent.pid, 0)
assert Path('/proc/' + str(agent.pid) + '/stat').read_text().rsplit(')', 1)[1].split()[0] != 'Z'
print(json.dumps(dict(stopped=stopped, editor_pid=editor_pid)))
PY`,
      { timeoutMs: 145_000 }
    );
    expect(result.exitCode).toBe(0);
    const before = z
      .object({ stopped: z.boolean(), editor_pid: z.number() })
      .parse(JSON.parse(result.stdout));
    expect(before.stopped).toBe(true);

    await ensureSandboxEditor(provider, '/workspace');
    const reopened = await provider.execute(`python3 - <<'PY'
import json, os
from pathlib import Path
agent_pid = int(Path('/workspace/agent.pid').read_text())
os.kill(agent_pid, 0)
assert Path('/proc/' + str(agent_pid) + '/stat').read_text().rsplit(')', 1)[1].split()[0] != 'Z'
print(json.dumps(dict(
    editor_pid=json.loads(Path('/tmp/omni-chat-editor/process.json').read_text())['pid'],
    content=Path('/workspace/kept.txt').read_text())))
PY`);
    expect(reopened.exitCode).toBe(0);
    const after = z
      .object({ editor_pid: z.number(), content: z.string() })
      .parse(JSON.parse(reopened.stdout));
    expect(after.editor_pid).not.toBe(before.editor_pid);
    expect(after.content).toBe('agent-output');
  }, 180_000);

  it('keeps the editor while another connection remains and exits after the last closes', async () => {
    const result = await provider.execute(
      String.raw`python3 - <<'PY'
${inspectEditor}
import socket
def connect():
    connection = socket.create_connection(('127.0.0.1', 8080), timeout=5)
    connection.sendall(b'GET /healthz HTTP/1.1\r\nHost: localhost:8080\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n')
    assert b'101 Switching Protocols' in connection.recv(4096)
    return connection
first, second = connect(), connect()
first.close()
survived = not select.select([editor_fd], [], [], 135)[0]
second.close()
stopped = bool(select.select([editor_fd], [], [], 135)[0])
os.close(editor_fd)
print(json.dumps(dict(survived=survived, stopped=stopped)))
PY`,
      { timeoutMs: 285_000 }
    );
    expect(result.exitCode).toBe(0);
    expect(
      z.object({ survived: z.boolean(), stopped: z.boolean() }).parse(JSON.parse(result.stdout))
    ).toEqual({ survived: true, stopped: true });
  }, 300_000);
});
