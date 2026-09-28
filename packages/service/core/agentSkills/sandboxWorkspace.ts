import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { createHash, randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import z from 'zod';
import { deploySandboxSkillPackages, type SandboxSkillPackage } from './sandboxDeployment';
import { getSkillPackageLimits, validateAndNormalizeSkillPackage } from './packageValidator';
import { getSkillSizeLimits } from './sandboxConfig';
import { resolveSandboxWorkspacePath } from '../ai/sandbox/workspace';

const quote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;
const workspacePaths = (workDirectory: string) => {
  const root = resolveSandboxWorkspacePath({ workspaceRoot: workDirectory, path: '.' });
  const parent = posix.dirname(root);
  if (parent === '/') throw new Error('Edit workspace must be below a non-root directory');
  return { root, parent };
};

// Directory descriptors and O_NOFOLLOW keep concurrent editor changes from redirecting reads.
const pythonDirectories = `import os, stat, sys, json
def directory(path):
    if not os.path.isabs(path) or os.path.normpath(path) != path or os.path.realpath(path) != path:
        raise ValueError('Invalid Edit workspace realpath')
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for name in path.split('/')[1:]:
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise
def empty_destination(parent, name):
    try:
        info = os.stat(name, dir_fd=parent, follow_symlinks=False)
    except FileNotFoundError:
        return
    if not stat.S_ISDIR(info.st_mode):
        raise ValueError('Edit workspace must be a real directory')
    fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
    try:
        if os.listdir(fd):
            raise ValueError('Edit workspace is not empty; preserving user files')
    finally:
        os.close(fd)
`;

const initializationScript = `${pythonDirectories}
arg = json.loads(sys.argv[1])
parent = directory(arg['parent'])
try:
    empty_destination(parent, arg['name'])
    if arg['action'] == 'stage':
        os.mkdir(arg['stage'], mode=0o700, dir_fd=parent)
    elif arg['action'] == 'activate':
        source_parent = directory(arg['sourceParent'])
        try:
            info = os.stat(arg['sourceName'], dir_fd=source_parent, follow_symlinks=False)
            if not stat.S_ISDIR(info.st_mode):
                raise ValueError('Invalid Edit package generation')
            os.rename(arg['sourceName'], arg['name'], src_dir_fd=source_parent, dst_dir_fd=parent)
        finally:
            os.close(source_parent)
    else:
        raise ValueError('Invalid Edit initialization action')
finally:
    os.close(parent)
`;

const persistentMountScript = `${pythonDirectories}
arg = json.loads(sys.argv[1])
mount = directory(arg['mountPath'])
root = directory(arg['root'])
try:
    if os.path.dirname(arg['root']) != arg['mountPath'] or os.fstat(root).st_dev != os.fstat(mount).st_dev:
        raise ValueError('Edit root is outside the persistent mount')
    with open('/proc/self/mountinfo', encoding='utf-8') as source:
        rows = [line.split(' ') for line in source]
    def decode(value):
        import re
        return re.sub(r'\\\\([0-7]{3})', lambda m: chr(int(m.group(1), 8)), value)
    matches = [row for row in rows if len(row) > 5 and decode(row[4]) == arg['mountPath']]
    suffix = '/volumes/' + arg['claimName'] + '/_data'
    if len(matches) != 1 or not decode(matches[0][3]).endswith(suffix):
        raise ValueError('Cannot prove the exact persistent volume binding')
    print('FASTGPT_EDIT_VOLUME_VERIFIED')
finally:
    os.close(root)
    os.close(mount)
`;

const resetExchangeScript = `${pythonDirectories}
import ctypes
arg = json.loads(sys.argv[1])
parent = directory(arg['parent'])
try:
    for name in [arg['name'], arg['stage']]:
        fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
        os.close(fd)
    libc = ctypes.CDLL(None, use_errno=True)
    exchange = libc.renameat2
    exchange.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    exchange.restype = ctypes.c_int
    if exchange(parent, os.fsencode(arg['name']), parent, os.fsencode(arg['stage']), 2) != 0:
        raise OSError(ctypes.get_errno(), 'Atomic Edit workspace exchange failed')
    os.fsync(parent)
    print('FASTGPT_EDIT_WORKSPACE_EXCHANGED')
finally:
    os.close(parent)
`;

export const assertEditWorkspacePersistentMount = async ({
  provider,
  workDirectory,
  mountPath,
  claimName,
  assertActive
}: {
  provider: Pick<ISandbox, 'execute'>;
  workDirectory: string;
  mountPath: string;
  claimName: string;
  assertActive: () => Promise<void>;
}) => {
  const { root, parent } = workspacePaths(workDirectory);
  if (parent !== mountPath || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(claimName))
    throw new Error('workspace_not_persistent');
  const proof = await runPython(
    provider,
    persistentMountScript,
    { root, mountPath, claimName },
    assertActive
  );
  if (proof.trim() !== 'FASTGPT_EDIT_VOLUME_VERIFIED') throw new Error('workspace_not_persistent');
};

export const resetEditSandboxWorkspace = async ({
  provider,
  workDirectory,
  skillPackage,
  resetId,
  assertActive
}: {
  provider: Pick<ISandbox, 'execute' | 'writeFiles'>;
  workDirectory: string;
  skillPackage: SandboxSkillPackage;
  resetId: string;
  assertActive: () => Promise<void>;
}) => {
  const { root, parent } = workspacePaths(workDirectory);
  if (!/^[a-f0-9-]{36}$/.test(resetId)) throw new Error('Invalid Edit reset generation');
  const stage = `.skill-edit-reset-${resetId}`;
  const backupRoot = posix.join(parent, stage);
  await initializeEditSandboxWorkspace({
    provider,
    workDirectory: backupRoot,
    skillPackage,
    assertActive
  });
  const result = await runPython(
    provider,
    resetExchangeScript,
    { parent, name: posix.basename(root), stage },
    assertActive
  );
  if (result.trim() !== 'FASTGPT_EDIT_WORKSPACE_EXCHANGED')
    throw new Error('workspace_reset_result_unknown');
  // The old directory is retained outside the editable root until explicit recovery/cleanup.
  return { backupRoot };
};

const exportScript = `${pythonDirectories}
import hashlib, io, shutil, subprocess, tempfile, zipfile
arg = json.loads(sys.argv[1])
limits = arg['limits']
git = shutil.which('git', path=os.defpath)
if not git:
    raise ValueError('Edit export requires Git for gitignore rules')
root = directory(arg['root'])
parent = directory(arg['parent'])
created = False
try:
    fd = os.open(arg['name'], os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
    created = True
    archive_info = os.fstat(fd)
    class LimitedFile(io.FileIO):
        def write(self, data):
            if self.tell() + len(data) > limits['maxArchiveBytes']:
                raise ValueError('Edit archive exceeds size limit')
            return super().write(data)
    count = 0
    total = 0
    rule_bytes = 0
    observed = []
    snapshot_entries = []
    excluded_names = {
        '.git', '.hg', '.svn', '.env', '.envrc', 'keys', 'credentials', '.credentials',
        '.ssh', '.aws', '.azure', '.config', '.kube', '.npmrc', '.pypirc', '.netrc',
        'node_modules', 'bower_components', '.venv', 'venv', 'virtualenv', 'env',
        '.cache', '.npm', '.pnpm-store', '.yarn', '__pycache__', '.pytest_cache',
        '.mypy_cache', '.ruff_cache', '.tox', '.nox', 'logs', '.logs',
        'provider', '.provider', '.runtime', '.codex', '.fastgpt', '.omni', '.code-server',
        '.local', '.vscode-server'
    }
    def excluded(name):
        name = name.lower()
        return (name in excluded_names or name.startswith(('.env.', 'credentials.', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', '.skill-edit-'))
                or name.endswith(('.key', '.pem', '.p12', '.pfx', '.log', '.pyc', '.pyo')) or '.log.' in name)
    def signature(info):
        return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
    def open_file(folder, name, before):
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=folder)
        opened = os.fstat(fd)
        if not stat.S_ISREG(opened.st_mode) or opened.st_nlink != 1 or signature(before) != signature(opened):
            os.close(fd)
            raise ValueError('Unsafe Edit file changed during export')
        return os.fdopen(fd, 'rb')
    def walk(folder, parts):
        global count, total, rule_bytes
        folder_before = os.fstat(folder)
        observed.append((parts, signature(folder_before)))
        candidates = []
        with os.scandir(folder) as entries:
            for entry in entries:
                if excluded(entry.name):
                    continue
                path = parts + [entry.name]
                if not parts and entry.name not in ('skills', 'entrypoint.sh', '.gitignore'):
                    raise ValueError('File is outside the allowed Edit package layout')
                count += 1
                if count > limits['maxEntries'] or len(path) > limits['maxDepth']:
                    raise ValueError('Edit workspace exceeds entry/depth limit')
                if '\\\\' in entry.name:
                    raise ValueError('Invalid Edit export path')
                before = entry.stat(follow_symlinks=False)
                is_directory = stat.S_ISDIR(before.st_mode)
                if not is_directory and not (stat.S_ISREG(before.st_mode) and before.st_nlink == 1):
                    raise ValueError('Edit export rejects links and special files')
                if (not parts and (entry.name == 'skills') != is_directory) or (entry.name == '.gitignore' and is_directory):
                    raise ValueError('Invalid Edit package layout')
                candidates.append((entry.name, path, before))
        rules = None
        for name, path, before in candidates:
            if name != '.gitignore':
                continue
            rule_limit = min(65536, limits['maxFileBytes'])
            if before.st_size > rule_limit:
                raise ValueError('Edit gitignore exceeds size limit')
            with open_file(folder, name, before) as source:
                rules = source.read(rule_limit + 1)
                if len(rules) != before.st_size or signature(before) != signature(os.fstat(source.fileno())):
                    raise ValueError('Edit gitignore changed during export')
            observed.append((path, signature(before)))
            rule_bytes += len(rules)
            if rule_bytes > min(1048576, limits['maxUncompressedBytes']):
                raise ValueError('Edit gitignore rules exceed total size limit')
            if b'\\0' in rules:
                raise ValueError('Invalid Edit gitignore')
            rules.decode('utf-8', errors='strict')
            with open(os.path.join(mirror, *path), 'xb') as target:
                target.write(rules)
        paths = ['/'.join(path) for _, path, _ in candidates]
        for _, path, before in candidates:
            if stat.S_ISDIR(before.st_mode):
                os.mkdir(os.path.join(mirror, *path), mode=0o700)
        ignored = set()
        if paths:
            result = subprocess.run([git, '-c', 'core.excludesFile=/dev/null', '-c', 'core.ignoreCase=false',
                                     'check-ignore', '--no-index', '--stdin', '-z'],
                                    input=('\\0'.join(paths) + '\\0').encode('utf-8'), stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, cwd=mirror, env=git_env, timeout=10)
            if result.returncode not in (0, 1):
                raise ValueError('Edit gitignore evaluation failed')
            ignored = set(result.stdout.decode('utf-8').split('\\0'))
        for (name, path, before), candidate_path in zip(candidates, paths):
            if candidate_path in ignored:
                continue
            if stat.S_ISDIR(before.st_mode):
                child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=folder)
                try:
                    if signature(before) != signature(os.fstat(child)):
                        raise ValueError('Edit directory changed during export')
                    os.mkdir(os.path.join(snapshot, *path), mode=0o700)
                    walk(child, path)
                    if signature(before) != signature(os.stat(name, dir_fd=folder, follow_symlinks=False)):
                        raise ValueError('Edit directory changed during export')
                finally:
                    os.close(child)
            else:
                if before.st_size > limits['maxFileBytes']:
                    raise ValueError('Edit file exceeds size limit')
                with open_file(folder, name, before) as source:
                    size = 0
                    entry_info = zipfile.ZipInfo('/'.join(path))
                    entry_info.create_system = 3
                    entry_info.external_attr = (stat.S_IFREG | (before.st_mode & 0o777)) << 16
                    entry_info.compress_type = zipfile.ZIP_DEFLATED
                    with open(os.path.join(snapshot, *path), 'xb') as target:
                        while True:
                            block = source.read(65536)
                            if not block:
                                break
                            size += len(block)
                            total += len(block)
                            if size > limits['maxFileBytes'] or total > limits['maxUncompressedBytes']:
                                raise ValueError('Edit workspace exceeds size limit')
                            target.write(block)
                    if size != before.st_size or signature(before) != signature(os.fstat(source.fileno())) or signature(before) != signature(os.stat(name, dir_fd=folder, follow_symlinks=False)):
                        raise ValueError('Edit file changed during export')
                    observed.append((path, signature(before)))
                    snapshot_entries.append((path, entry_info))
        if rules is not None:
            before = next(info for name, _, info in candidates if name == '.gitignore')
            if signature(before) != signature(os.stat('.gitignore', dir_fd=folder, follow_symlinks=False)):
                raise ValueError('Edit gitignore changed during export')
        if signature(folder_before) != signature(os.fstat(folder)):
            raise ValueError('Edit directory changed during export')
    with LimitedFile(fd, 'w+b', closefd=True) as output:
        # Git sees only descriptor-validated ignore rules in a private, empty repository.
        with tempfile.TemporaryDirectory(prefix='fastgpt-edit-ignore-', dir='/tmp') as mirror, tempfile.TemporaryDirectory(prefix='fastgpt-edit-snapshot-', dir='/tmp') as snapshot:
            git_dir = os.path.join(mirror, '.git')
            os.mkdir(git_dir, mode=0o700)
            os.mkdir(os.path.join(git_dir, 'objects'), mode=0o700)
            os.mkdir(os.path.join(git_dir, 'refs'), mode=0o700)
            with open(os.path.join(git_dir, 'HEAD'), 'x') as head:
                head.write('ref: refs/heads/main\\n')
            git_env = {'PATH': os.defpath, 'LC_ALL': 'C', 'GIT_DIR': git_dir, 'GIT_WORK_TREE': mirror,
                       'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_SYSTEM': os.devnull, 'GIT_CONFIG_GLOBAL': os.devnull}
            walk(root, [])
            # All copied files must overlap at one unchanged workspace instant before packaging.
            for parts, expected in observed:
                if not parts:
                    current = directory(arg['root'])
                    try:
                        actual = os.fstat(current)
                    finally:
                        os.close(current)
                else:
                    current = directory(os.path.join(arg['root'], *parts[:-1]))
                    try:
                        actual = os.stat(parts[-1], dir_fd=current, follow_symlinks=False)
                    finally:
                        os.close(current)
                if signature(actual) != expected:
                    raise ValueError('Edit workspace changed during snapshot; retry after writers stop')
            with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                for parts, entry_info in snapshot_entries:
                    with open(os.path.join(snapshot, *parts), 'rb') as source, archive.open(entry_info, 'w') as target:
                        shutil.copyfileobj(source, target, 65536)
        output.flush()
        size = output.seek(0, os.SEEK_END)
        output.seek(0)
        digest = hashlib.sha256()
        for block in iter(lambda: output.read(65536), b''):
            digest.update(block)
    print(json.dumps({'path': arg['path'], 'size': size, 'hash': digest.hexdigest(), 'device': str(archive_info.st_dev), 'inode': str(archive_info.st_ino)}))
except BaseException:
    if created:
        current = os.stat(arg['name'], dir_fd=parent, follow_symlinks=False)
        if (current.st_dev, current.st_ino) == (archive_info.st_dev, archive_info.st_ino):
            os.unlink(arg['name'], dir_fd=parent)
    raise
finally:
    os.close(root)
    os.close(parent)
`;

const cleanupScript = `${pythonDirectories}
arg = json.loads(sys.argv[1])
parent = directory(arg['parent'])
try:
    info = os.stat(arg['name'], dir_fd=parent, follow_symlinks=False)
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or str(info.st_dev) != arg['device'] or str(info.st_ino) != arg['inode']:
        raise ValueError('Temporary Edit archive was replaced')
    os.unlink(arg['name'], dir_fd=parent)
finally:
    os.close(parent)
`;

async function runPython(
  provider: Pick<ISandbox, 'execute'>,
  script: string,
  args: object,
  assertActive: () => Promise<void>
) {
  await assertActive();
  const result = await provider.execute(
    `python3 -c ${quote(script)} ${quote(JSON.stringify(args))}`,
    {
      timeoutMs: 120000
    }
  );
  if (result.exitCode !== 0) throw new Error(`Edit workspace operation failed: ${result.stderr}`);
  return result.stdout;
}

export async function initializeEditSandboxWorkspace({
  provider,
  workDirectory,
  skillPackage,
  assertActive
}: {
  provider: Pick<ISandbox, 'execute' | 'writeFiles'>;
  workDirectory: string;
  skillPackage: SandboxSkillPackage;
  assertActive: () => Promise<void>;
}): Promise<void> {
  const { root, parent } = workspacePaths(workDirectory);
  const stage = `.skill-edit-init-${randomUUID()}`;
  const stagingRoot = posix.join(parent, stage);
  await runPython(
    provider,
    initializationScript,
    { action: 'stage', parent, name: posix.basename(root), stage },
    assertActive
  );
  const { manifest } = await deploySandboxSkillPackages({
    provider: {
      execute: (...args) => provider.execute(...args),
      writeFiles: async (files) => {
        await assertActive();
        const results = await provider.writeFiles(files);
        for (const file of files) {
          const result = results.find((result) => result.path === file.path);
          if (!result) throw new Error('Missing Edit package write result');
          if (result.error) throw result.error;
        }
        return results;
      }
    },
    workspaceRoot: stagingRoot,
    packages: [skillPackage],
    allowEmptyWorkspace: true,
    assertActive
  });
  const entry = manifest.entries[0];
  const expectedPrefix = `.runtime/skills/${skillPackage.skillId}/${skillPackage.versionId}/`;
  if (
    !entry ||
    !entry.generation.startsWith(expectedPrefix) ||
    !/^[a-f0-9-]{36}$/.test(entry.generation.slice(expectedPrefix.length))
  ) {
    throw new Error('Invalid Edit package generation');
  }
  const source = posix.join(stagingRoot, entry.generation);
  await runPython(
    provider,
    initializationScript,
    {
      action: 'activate',
      parent,
      name: posix.basename(root),
      sourceParent: posix.dirname(source),
      sourceName: posix.basename(source)
    },
    assertActive
  );
}

export async function exportEditSandboxWorkspace({
  provider,
  workDirectory,
  assertActive
}: {
  provider: Pick<ISandbox, 'execute' | 'readFiles'>;
  workDirectory: string;
  assertActive: () => Promise<void>;
}): Promise<Buffer> {
  const { root, parent } = workspacePaths(workDirectory);
  const name = `.skill-edit-export-${randomUUID()}.zip`;
  const path = posix.join(parent, name);
  const packageLimits = getSkillPackageLimits();
  const limits = {
    ...packageLimits,
    maxUncompressedBytes: Math.min(
      packageLimits.maxUncompressedBytes,
      getSkillSizeLimits().maxSandboxPackageBytes
    )
  };
  const output = await runPython(
    provider,
    exportScript,
    { root, parent, name, path, limits },
    assertActive
  );
  const archive = z
    .object({
      path: z.literal(path),
      size: z.number().int().positive().max(limits.maxArchiveBytes),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
      device: z.string().regex(/^\d+$/),
      inode: z.string().regex(/^\d+$/)
    })
    .parse(JSON.parse(output));
  try {
    // Base64 must fit the SDK's 1 MiB output cap; its range end is exclusive.
    const chunkBytes = 512 * 1024;
    const buffer = Buffer.alloc(archive.size);
    for (let offset = 0; offset < archive.size; offset += chunkBytes) {
      await assertActive();
      const end = Math.min(offset + chunkBytes, archive.size);
      const files = await provider.readFiles([path], { range: `${offset}-${end}` });
      const file = files[0];
      if (files.length !== 1 || file.path !== path)
        throw new Error('Missing Edit archive read result');
      if (file.error) throw file.error;
      if (!(file.content instanceof Uint8Array) || file.content.length !== end - offset)
        throw new Error('Invalid Edit archive size');
      buffer.set(file.content, offset);
    }
    if (createHash('sha256').update(buffer).digest('hex') !== archive.hash)
      throw new Error('Edit archive changed during read');
    return (await validateAndNormalizeSkillPackage(buffer, { allowLegacyLayout: false })).zipBuffer;
  } finally {
    await runPython(
      provider,
      cleanupScript,
      { parent, name, device: archive.device, inode: archive.inode },
      assertActive
    );
  }
}
