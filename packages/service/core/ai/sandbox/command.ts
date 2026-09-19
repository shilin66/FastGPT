import { randomUUID } from 'node:crypto';
import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { z } from 'zod';
import { assertSandboxWorkspacePath } from './workspace';

const quote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;
export class WorkspaceCommandOutcomeUnknown extends Error {
  constructor(cause: unknown) {
    super('Command outcome is unknown; inspect the workspace and command logs before retrying', {
      cause
    });
    this.name = 'WorkspaceCommandOutcomeUnknown';
  }
}
const resultSchema = z.object({
  exitCode: z.number().int(),
  reason: z.enum(['completed', 'failed', 'cancelled', 'timed_out', 'interrupted']),
  stdout: z.string(),
  stderr: z.string(),
  truncated: z.boolean(),
  logDirectory: z.string()
});

const prepare = `import os, sys, json, time
root, run_id = sys.argv[1:]
current = root
for name in ('.runtime', 'commands', run_id):
    current = os.path.join(current, name)
    if os.path.lexists(current):
        if os.path.islink(current) or not os.path.isdir(current): raise ValueError('Invalid command directory')
    else: os.mkdir(current, 0o700)
with open(os.path.join(current, 'control.json'), 'x') as target:
    json.dump({'cancelled': False, 'time': time.time()}, target)
`;

const supervise = `import os, sys, json, time, signal, selectors, subprocess
arg = json.loads(sys.argv[1])
folder = arg['folder']
streams = {name: open(os.path.join(folder, name + '.log'), 'xb') for name in ('stdout', 'stderr')}
sizes = dict.fromkeys(streams, 0)
tails = dict.fromkeys(streams, b'')
truncated = False
process = subprocess.Popen(arg['command'], shell=True, cwd=arg['cwd'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
selector = selectors.DefaultSelector()
selector.register(process.stdout, selectors.EVENT_READ, 'stdout')
selector.register(process.stderr, selectors.EVENT_READ, 'stderr')
started = time.monotonic()
last_heartbeat = time.time()
reason = None
kill_at = None
def kill_group(sig):
    try: os.killpg(process.pid, sig)
    except ProcessLookupError: pass
try:
    while selector.get_map() or process.poll() is None:
        now = time.monotonic()
        try:
            with open(os.path.join(folder, 'control.json')) as source: control = json.load(source)
            last_heartbeat = control['time']
            if control['cancelled'] and reason is None: reason = 'cancelled'
        except (OSError, ValueError, KeyError): pass
        if now - started >= arg['timeoutMs'] / 1000 and reason is None: reason = 'timed_out'
        if time.time() - last_heartbeat > 15 and reason is None: reason = 'interrupted'
        if reason and kill_at is None:
            kill_group(signal.SIGTERM)
            kill_at = now + 1
        if kill_at is not None and now >= kill_at: kill_group(signal.SIGKILL)
        if process.poll() is not None: kill_group(signal.SIGKILL)
        for key, _ in selector.select(0.1):
            block = os.read(key.fileobj.fileno(), 65536)
            if not block:
                selector.unregister(key.fileobj)
                key.fileobj.close()
                continue
            name = key.data
            room = max(0, 2097152 - sizes[name])
            streams[name].write(block[:room])
            sizes[name] += len(block[:room])
            tails[name] = (tails[name] + block)[-8192:]
            truncated = truncated or len(block) > room or sizes[name] > 8192
    code = process.wait()
    print(json.dumps({'exitCode': code, 'reason': reason or ('completed' if code == 0 else 'failed'),
        'stdout': tails['stdout'].decode('utf-8', 'replace'), 'stderr': tails['stderr'].decode('utf-8', 'replace'),
        'truncated': truncated, 'logDirectory': folder}))
finally:
    kill_group(signal.SIGKILL)
    process.wait()
    selector.close()
    for stream in streams.values(): stream.close()
`;

export const executeWorkspaceCommand = async ({
  provider,
  workspaceRoot,
  command,
  workingDirectory = '.',
  timeoutMs = 30000,
  shouldStop
}: {
  provider: Pick<ISandbox, 'execute' | 'writeFiles'>;
  workspaceRoot: string;
  command: string;
  workingDirectory?: string;
  timeoutMs?: number;
  shouldStop?: () => boolean;
}) => {
  if (shouldStop?.()) throw new Error('Command cancelled before execution');
  const cwd = await assertSandboxWorkspacePath({ provider, workspaceRoot, path: workingDirectory });
  const id = randomUUID();
  const folder = `${workspaceRoot}/.runtime/commands/${id}`;
  const prepared = await provider.execute(
    ['python3', '-c', prepare, workspaceRoot, id].map(quote).join(' ')
  );
  if (prepared.exitCode !== 0) throw new Error('Unable to prepare command supervision');
  if (shouldStop?.()) throw new Error('Command cancelled before execution');
  let pendingHeartbeat: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (pendingHeartbeat) return;
    pendingHeartbeat = provider
      .writeFiles([
        {
          path: `${folder}/control.json`,
          data: new TextEncoder().encode(
            JSON.stringify({ cancelled: !!shouldStop?.(), time: Date.now() / 1000 })
          )
        }
      ])
      .then((results) => {
        if (results[0]?.error) throw results[0].error;
      })
      .catch(() => {
        // The supervisor terminates its process group if heartbeats stop arriving.
      })
      .finally(() => {
        pendingHeartbeat = undefined;
      });
  }, 500);
  timer.unref();
  try {
    const result = await provider.execute(
      [
        'python3',
        '-c',
        supervise,
        JSON.stringify({
          folder,
          cwd,
          command,
          timeoutMs: Math.min(120000, Math.max(100, timeoutMs))
        })
      ]
        .map(quote)
        .join(' '),
      { maxOutputBytes: 65536, timeoutMs: timeoutMs + 20000 }
    );
    if (result.exitCode !== 0)
      throw new Error('Command supervision failed; execution outcome is unknown');
    return resultSchema.parse(JSON.parse(result.stdout));
  } catch (error) {
    throw new WorkspaceCommandOutcomeUnknown(error);
  } finally {
    clearInterval(timer);
    await pendingHeartbeat;
  }
};
