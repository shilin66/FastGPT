import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { waitForSkillEditorReady } from '../../agentSkills/sandboxConfig';
import { ensureSandboxEditorDefaults, sandboxEditorDefaultsScript } from './editorDefaults';

export class SandboxEditorError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode = 503,
    options?: ErrorOptions
  ) {
    super(code, options);
    this.name = 'SandboxEditorError';
  }
}

const quote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

export const sandboxEditorHotCheckScript = `import http.client, json, sys
def check_running_editor():
    try:
        connection = http.client.HTTPConnection('127.0.0.1', 8080, timeout=3)
        try:
            connection.request('GET', '/healthz')
            response = connection.getresponse()
            health = json.loads(response.read(4096)) if response.status == 200 else None
            if not isinstance(health, dict) or health.get('status') not in ('alive', 'expired'): return False
        finally: connection.close()
    except Exception: return False
    connection = http.client.HTTPConnection('127.0.0.1', 8080, timeout=3)
    try:
        connection.request('GET', '/login')
        response = connection.getresponse()
        if response.status != 200: sys.exit(24)
    finally: connection.close()
    exec(${JSON.stringify(sandboxEditorDefaultsScript.replace('directory = sys.argv[1]', 'directory = editor_settings_directory'))}, {'editor_settings_directory': editor_settings_directory})
    print('editor-ready')
    return True
`;

const startEditor = `import os, sys, json, fcntl, shutil, subprocess
from pathlib import Path
editor_settings_directory = '/home/sandbox/.local/share/code-server/User'
${sandboxEditorHotCheckScript}
root = sys.argv[1]
binary = shutil.which('code-server')
if not binary: sys.exit(22)
runtime = Path('/tmp/omni-chat-editor')
runtime.mkdir(mode=0o700, exist_ok=True)
if runtime.is_symlink() or runtime.stat().st_uid != os.getuid(): sys.exit(23)
lock = os.open(str(runtime / 'start.lock'), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
with os.fdopen(lock, 'w') as handle:
    fcntl.flock(handle, fcntl.LOCK_EX)
    listeners = set()
    for table in ('/proc/net/tcp', '/proc/net/tcp6'):
        for row in Path(table).read_text().splitlines()[1:]:
            columns = row.split()
            if columns[1].split(':')[-1] == '1F90' and columns[3] == '0A': listeners.add(columns[9])
    if listeners:
        owned = set()
        for proc in Path('/proc').iterdir():
            if not proc.name.isdigit(): continue
            try:
                command = (proc / 'cmdline').read_bytes()
                if b'code-server' not in command: continue
                for fd in (proc / 'fd').iterdir():
                    link = os.readlink(fd)
                    if link.startswith('socket:['): owned.add(link[8:-1])
            except (OSError, PermissionError): pass
        if not listeners.issubset(owned): sys.exit(23)
        if check_running_editor(): sys.exit(0)
        print('editor-running')
        sys.exit(0)
    receipt = runtime / 'process.json'
    if receipt.exists():
        try:
            saved = json.loads(receipt.read_text())
            pid = str(saved['pid'])
            stat = Path('/proc/' + pid + '/stat').read_text().rsplit(')', 1)[1].split()
            command = Path('/proc/' + pid + '/cmdline').read_bytes()
            if stat[19] == saved['start'] and stat[0] != 'Z' and b'code-server' in command:
                print('editor-starting')
                sys.exit(0)
        except (OSError, ValueError, KeyError): pass
    log_fd = os.open(str(runtime / 'output.log'), os.O_CREAT | os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW, 0o600)
    with os.fdopen(log_fd, 'ab') as log:
        process = subprocess.Popen([binary, '--bind-addr', '127.0.0.1:8080', '--auth', 'password',
            '--disable-telemetry', '--disable-update-check', '--disable-workspace-trust',
            '--disable-getting-started-override', '--app-name', 'Agent Workspace',
            '--user-data-dir', '/home/sandbox/.local/share/code-server', root],
            cwd=root, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True, close_fds=True)
    try:
        start = Path('/proc/' + str(process.pid) + '/stat').read_text().rsplit(')', 1)[1].split()[19]
        receipt_fd = os.open(str(receipt), os.O_CREAT | os.O_WRONLY | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
        with os.fdopen(receipt_fd, 'w') as target: json.dump({'pid': process.pid, 'start': start}, target)
    except OSError: sys.exit(23)
    print('editor-starting')
`;

export const ensureSandboxEditor = async (
  provider: Pick<ISandbox, 'execute'>,
  workspaceRoot: string
) => {
  const result = await provider.execute(
    `python3 - ${quote(workspaceRoot)} <<'PY'\n${startEditor}\nPY`,
    {
      timeoutMs: 10_000,
      maxOutputBytes: 1024
    }
  );
  if (result.exitCode === 22) throw new SandboxEditorError('sandbox_editor_unsupported', 422);
  if (result.exitCode === 24) throw new SandboxEditorError('sandbox_editor_auth_required', 409);
  if (
    result.exitCode === 0 &&
    /^editor-settings-(ready|skipped)\neditor-ready$/.test(result.stdout.trim())
  )
    return;
  if (result.exitCode !== 0 || !/^editor-(running|starting)$/.test(result.stdout.trim()))
    throw new SandboxEditorError('sandbox_editor_unavailable');
  try {
    await waitForSkillEditorReady(provider);
  } catch (cause) {
    throw new SandboxEditorError('sandbox_editor_start_timeout', 504, { cause });
  }
  const auth = await provider.execute(
    `python3 - <<'PY'
import http.client, sys
connection = http.client.HTTPConnection('127.0.0.1', 8080, timeout=3)
connection.request('GET', '/login')
response = connection.getresponse()
if response.status != 200: sys.exit(24)
print('editor-auth-password')
PY`,
    { timeoutMs: 5000, maxOutputBytes: 1024 }
  );
  if (auth.exitCode === 24) throw new SandboxEditorError('sandbox_editor_auth_required', 409);
  if (auth.exitCode !== 0 || auth.stdout.trim() !== 'editor-auth-password')
    throw new SandboxEditorError('sandbox_editor_unavailable');
  await ensureSandboxEditorDefaults(provider);
};
