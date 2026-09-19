import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import {
  SkillWorkspaceFileResponseSchema,
  type SkillWorkspaceFileBody
} from '@fastgpt/global/openapi/core/agentSkills/files';
import { resolveSandboxWorkspacePath } from '../../ai/sandbox/workspace';
import { UserError } from '@fastgpt/global/common/error/utils';

const quote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;
const script = `import os, sys, stat, json, hashlib, tempfile
arg = json.loads(sys.argv[1])
def directory(path):
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in path.strip('/').split('/'):
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise
def version(info): return str(info.st_ino) + ':' + str(info.st_mtime_ns) + ':' + str(info.st_size)
def signature(info): return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
try:
    root = directory(arg['root'])
    if arg['action'] == 'list':
        files = []
        excluded = {'.runtime', '.git', 'node_modules', '.venv', '__pycache__', '.cache'}
        truncated = False
        def walk(fd, parts):
            global truncated
            if len(parts) > 16: truncated = True; return
            with os.scandir(fd) as entries:
                for entry in sorted(entries, key=lambda entry: entry.name):
                    if len(files) >= 2000: truncated = True; break
                    if entry.name in excluded: continue
                    info = entry.stat(follow_symlinks=False)
                    if not (stat.S_ISREG(info.st_mode) and info.st_nlink == 1 or stat.S_ISDIR(info.st_mode)): continue
                    parts_next = parts + [entry.name]
                    is_dir = stat.S_ISDIR(info.st_mode)
                    files.append({'path': '/'.join(parts_next), 'type': 'directory' if is_dir else 'file', 'version': version(info), 'size': info.st_size})
                    if is_dir:
                        child = os.open(entry.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                        try: walk(child, parts_next)
                        finally: os.close(child)
        walk(root, [])
        result = {'action': 'list', 'files': files, 'truncated': truncated}
    else:
        path = arg['path']
        parent = directory(os.path.dirname(path))
        name = os.path.basename(path)
        try:
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
            with os.fdopen(fd, 'rb') as source:
                before = os.fstat(source.fileno())
                if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1: raise ValueError('workspace_unsafe_file')
                if before.st_size > 262144: raise ValueError('workspace_file_too_large')
                content = source.read(262145)
                if len(content) > 262144: raise ValueError('workspace_file_too_large')
                if signature(before) != signature(os.fstat(source.fileno())): raise ValueError('workspace_file_conflict')
            digest = hashlib.sha256(content).hexdigest()
            if arg['action'] == 'read':
                if b'\\0' in content: raise ValueError('workspace_binary_file')
                result = {'action': 'read', 'path': arg['relativePath'], 'content': content.decode('utf-8'), 'hash': digest, 'version': version(before)}
            else:
                if arg['expectedHash'] != digest: raise ValueError('workspace_file_conflict')
                content = arg['content'].encode('utf-8')
                if len(content) > 262144: raise ValueError('workspace_file_too_large')
                temporary = '.skill-edit-save-' + arg['nonce']
                fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, before.st_mode & 0o777, dir_fd=parent)
                try:
                    with os.fdopen(fd, 'wb') as target:
                        target.write(content)
                        target.flush()
                        os.fsync(target.fileno())
                    if signature(before) != signature(os.stat(name, dir_fd=parent, follow_symlinks=False)): raise ValueError('workspace_file_conflict')
                    os.replace(temporary, name, src_dir_fd=parent, dst_dir_fd=parent)
                    result = {'action': 'write', 'path': arg['relativePath'], 'hash': hashlib.sha256(content).hexdigest(), 'version': version(os.stat(name, dir_fd=parent, follow_symlinks=False))}
                finally:
                    try: os.unlink(temporary, dir_fd=parent)
                    except FileNotFoundError: pass
        finally: os.close(parent)
    os.close(root)
    print(json.dumps(result))
except (OSError, ValueError) as error:
    code = str(error)
    print(json.dumps({'error': code if code.startswith('workspace_') else 'workspace_file_unavailable'}))
`;

export const operateSkillWorkspaceFiles = async ({
  provider,
  workspaceRoot,
  request
}: {
  provider: Pick<ISandbox, 'execute'>;
  workspaceRoot: string;
  request: SkillWorkspaceFileBody;
}) => {
  const { randomUUID } = await import('node:crypto');
  const params =
    request.action === 'list'
      ? request
      : {
          ...request,
          relativePath: request.path,
          path: resolveSandboxWorkspacePath({ workspaceRoot, path: request.path })
        };
  const result = await provider.execute(
    [
      'python3',
      '-c',
      script,
      JSON.stringify({ ...params, root: workspaceRoot, nonce: randomUUID() })
    ]
      .map(quote)
      .join(' '),
    { timeoutMs: 15000, maxOutputBytes: 2 * 1024 * 1024 }
  );
  if (result.exitCode !== 0) throw new UserError('workspace_file_unavailable');
  const response: unknown = JSON.parse(result.stdout);
  if (
    response &&
    typeof response === 'object' &&
    'error' in response &&
    typeof response.error === 'string'
  )
    throw new UserError(response.error);
  return SkillWorkspaceFileResponseSchema.parse(response);
};
