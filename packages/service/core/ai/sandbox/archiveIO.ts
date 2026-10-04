import { createHash, randomUUID } from 'node:crypto';
import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { resolveSandboxWorkspacePath } from './workspace';

const quote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

export const archiveWorkspaceScript = `import os, sys, stat, tarfile, tempfile, hashlib, json
root, maximum = sys.argv[1], int(sys.argv[2])
root = os.path.realpath(root)
fd, target = tempfile.mkstemp(prefix='fastgpt-archive-', suffix='.tar.gz', dir='/tmp')
os.close(fd)
total, count = 0, 0
def signature(info): return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
try:
    with tarfile.open(target, 'w:gz', dereference=False) as archive:
        def walk(folder, relative=''):
            global total, count
            before = os.stat(folder)
            for entry in sorted(os.scandir(folder), key=lambda item: item.name):
                if not relative and entry.name == '.fastgpt-archive-receipt': continue
                name = relative + entry.name
                info = entry.stat(follow_symlinks=False)
                count += 1
                if count > 100000: raise ValueError('Archive has too many entries')
                member = archive.gettarinfo(entry.path, arcname=name)
                if stat.S_ISDIR(info.st_mode):
                    archive.addfile(member)
                    walk(entry.path, name + '/')
                elif stat.S_ISLNK(info.st_mode):
                    destination = os.path.realpath(entry.path)
                    if os.path.commonpath([root, destination]) != root: raise ValueError('Archive link leaves workspace')
                    member.linkname = os.path.relpath(destination, os.path.dirname(entry.path))
                    archive.addfile(member)
                elif stat.S_ISREG(info.st_mode):
                    total += info.st_size
                    if total > maximum: raise ValueError('Workspace exceeds archive limit')
                    source_fd = os.open(entry.path, os.O_RDONLY | os.O_NOFOLLOW)
                    with os.fdopen(source_fd, 'rb') as source:
                        if signature(info) != signature(os.fstat(source.fileno())): raise ValueError('Workspace changed')
                        member.type, member.linkname, member.size = tarfile.REGTYPE, '', info.st_size
                        archive.addfile(member, source)
                        if signature(info) != signature(os.fstat(source.fileno())): raise ValueError('Workspace changed')
                else: raise ValueError('Archive rejects special files')
                if signature(info) != signature(os.lstat(entry.path)): raise ValueError('Workspace changed')
                if os.path.getsize(target) > maximum: raise ValueError('Archive exceeds limit')
            if signature(before) != signature(os.stat(folder)): raise ValueError('Workspace changed')
        walk(root)
    size = os.path.getsize(target)
    if size > maximum: raise ValueError('Archive exceeds limit')
    digest = hashlib.sha256()
    with open(target, 'rb') as source:
        for block in iter(lambda: source.read(65536), b''): digest.update(block)
    print(json.dumps({'path': target, 'size': size, 'hash': digest.hexdigest()}))
except BaseException:
    os.unlink(target)
    raise
`;

export const restoreWorkspaceScript = `import os, sys, tarfile, tempfile, hashlib, json, shutil, stat, pathlib
arg = json.loads(sys.argv[1])
root, maximum = arg['root'], arg['maximum']
if os.path.islink(root) or not os.path.isdir(root): raise ValueError('Invalid workspace root')
root = os.path.realpath(root)
receipt = os.path.join(root, '.fastgpt-archive-receipt')
try:
    if not os.path.islink(receipt) and pathlib.Path(receipt).read_text() == arg['hash']:
        print('FASTGPT_ARCHIVE_INSTALLED')
        sys.exit(0)
except FileNotFoundError: pass
fd, package = tempfile.mkstemp(prefix='fastgpt-restore-', suffix='.tar.gz', dir='/tmp')
stage = tempfile.mkdtemp(prefix='.fastgpt-restore-', dir=root)
try:
    digest, size = hashlib.sha256(), 0
    with os.fdopen(fd, 'wb') as output:
        for part in arg['parts']:
            source_fd = os.open(part, os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(source_fd, 'rb') as source:
                if not stat.S_ISREG(os.fstat(source.fileno()).st_mode): raise ValueError('Invalid archive part')
                for block in iter(lambda: source.read(65536), b''):
                    size += len(block)
                    if size > maximum: raise ValueError('Archive exceeds limit')
                    output.write(block)
                    digest.update(block)
    if size != arg['size'] or digest.hexdigest() != arg['hash']: raise ValueError('Archive checksum mismatch')
    seen, links, total = set(), [], 0
    with tarfile.open(package, 'r:gz') as archive:
        for member in archive:
            name = pathlib.PurePosixPath(member.name)
            if name.is_absolute() or '..' in name.parts or not name.parts or '\\\\' in member.name or member.name in seen:
                raise ValueError('Invalid archive path')
            if name.parts[0] == '.fastgpt-archive-receipt': raise ValueError('Reserved archive path')
            seen.add(member.name)
            if len(seen) > 100000 or len(name.parts) > 128: raise ValueError('Archive entry limit exceeded')
            target = os.path.join(stage, *name.parts)
            parent = os.path.dirname(target)
            os.makedirs(parent, exist_ok=True)
            if member.isdir(): os.makedirs(target, exist_ok=True)
            elif member.isfile():
                total += member.size
                if total > maximum: raise ValueError('Expanded archive exceeds limit')
                with archive.extractfile(member) as source, open(target, 'xb') as output: shutil.copyfileobj(source, output, 65536)
                os.chmod(target, member.mode & 0o777)
            elif member.issym():
                link = pathlib.PurePosixPath(member.linkname)
                resolved = os.path.normpath(os.path.join(parent, member.linkname))
                if link.is_absolute() or os.path.commonpath([stage, resolved]) != stage: raise ValueError('Archive link leaves workspace')
                links.append((member.linkname, target))
            else: raise ValueError('Archive rejects special files and hard links')
    # Install links last so no archive member can write through a symlink.
    for link, target in links: os.symlink(link, target)
    for entry in os.scandir(root):
        if entry.path == stage: continue
        if entry.is_dir(follow_symlinks=False): shutil.rmtree(entry.path)
        else: os.unlink(entry.path)
    for entry in os.scandir(stage): os.rename(entry.path, os.path.join(root, entry.name))
    pathlib.Path(receipt).write_text(arg['hash'])
    print('FASTGPT_ARCHIVE_INSTALLED')
finally:
    shutil.rmtree(stage, ignore_errors=True)
    os.unlink(package)
`;

const runPython = async (provider: Pick<ISandbox, 'execute'>, script: string, args: string[]) => {
  const result = await provider.execute(['python3', '-c', script, ...args].map(quote).join(' '), {
    timeoutMs: 600_000,
    maxOutputBytes: 16_384
  });
  if (result.exitCode !== 0)
    throw new Error('Sandbox archive command failed', { cause: new Error(result.stderr) });
  return result.stdout.trim();
};

export const createWorkspaceArchive = async (
  provider: ISandbox,
  workspaceRoot: string,
  maximum: number,
  assertActive: () => Promise<void>
) => {
  resolveSandboxWorkspacePath({ workspaceRoot, path: '.' });
  await assertActive();
  const receipt: { path: string; size: number; hash: string } = JSON.parse(
    await runPython(provider, archiveWorkspaceScript, [workspaceRoot, String(maximum)])
  );
  if (
    !/^\/tmp\/fastgpt-archive-[a-zA-Z0-9_-]+\.tar\.gz$/.test(receipt.path) ||
    !Number.isSafeInteger(receipt.size) ||
    receipt.size <= 0 ||
    receipt.size > maximum ||
    !/^[a-f0-9]{64}$/.test(receipt.hash)
  )
    throw new Error('Invalid archive receipt');
  try {
    const buffer = Buffer.alloc(receipt.size);
    for (let offset = 0; offset < receipt.size; offset += 512 * 1024) {
      await assertActive();
      const end = Math.min(offset + 512 * 1024, receipt.size);
      const results = await provider.readFiles([receipt.path], { range: `${offset}-${end}` });
      const file = results[0];
      if (
        results.length !== 1 ||
        !file ||
        file.error ||
        file.path !== receipt.path ||
        file.content.length !== end - offset
      )
        throw new Error('Invalid archive read result');
      buffer.set(file.content, offset);
    }
    if (createHash('sha256').update(new Uint8Array(buffer)).digest('hex') !== receipt.hash)
      throw new Error('Archive changed while reading');
    return { buffer, hash: receipt.hash, size: receipt.size };
  } finally {
    await provider.deleteFiles([receipt.path]);
  }
};

export const installWorkspaceArchive = async (
  provider: ISandbox,
  workspaceRoot: string,
  buffer: Buffer,
  archive: { hash: string; size: number },
  maximum: number,
  assertActive: () => Promise<void>
) => {
  resolveSandboxWorkspacePath({ workspaceRoot, path: '.' });
  if (
    buffer.length !== archive.size ||
    buffer.length > maximum ||
    createHash('sha256').update(new Uint8Array(buffer)).digest('hex') !== archive.hash
  )
    throw new Error('Archive checksum mismatch');
  const parts: string[] = [];
  const id = randomUUID();
  try {
    for (let offset = 0; offset < buffer.length; offset += 512 * 1024) {
      await assertActive();
      const path = `/tmp/fastgpt-restore-${id}-${offset}.part`;
      parts.push(path);
      const [result] = await provider.writeFiles([
        { path, data: new Uint8Array(buffer.subarray(offset, offset + 512 * 1024)) }
      ]);
      if (!result || result.error || result.path !== path)
        throw new Error('Failed to write archive part');
    }
    await assertActive();
    const result = await runPython(provider, restoreWorkspaceScript, [
      JSON.stringify({ root: workspaceRoot, parts, ...archive, maximum })
    ]);
    if (result !== 'FASTGPT_ARCHIVE_INSTALLED')
      throw new Error('Archive installation not confirmed');
    await assertActive();
  } finally {
    if (parts.length) await provider.deleteFiles(parts);
  }
};
