import { createHash, randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import z from 'zod';
import JSZip from 'jszip';
import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { RuntimeSkillMetadataSchema } from '@fastgpt/global/core/agentSkills/type';
import { validateAndNormalizeSkillPackage } from './packageValidator';
import { assertSandboxWorkspacePath } from '../ai/sandbox/workspace';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const FileSchema = z.object({
  path: z.string(),
  hash: z.string(),
  size: z.number().int().nonnegative()
});
const EntrySchema = z.object({
  skillId: objectId,
  versionId: objectId,
  contentHash: z.string(),
  generation: z.string(),
  runtimeSkills: z.array(RuntimeSkillMetadataSchema),
  files: z.array(FileSchema),
  avatar: z.string().optional()
});
const ManifestSchema = z.object({ schemaVersion: z.literal(1), entries: z.array(EntrySchema) });
export type SandboxSkillManifest = z.infer<typeof ManifestSchema>;
export type SandboxSkillPackage = {
  skillId: string;
  versionId: string;
  packageBuffer: Buffer;
  contentHash?: string;
  avatar?: string;
};
type DeploymentProvider = Pick<ISandbox, 'execute' | 'writeFiles'>;
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const quote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

// Arguments contain only trusted operation paths/hashes; package data is uploaded separately.
const deploymentScript = `import hashlib, json, os, re, stat, sys, zipfile
from pathlib import Path
root = Path(sys.argv[1]).resolve(strict=True)
arg = json.loads(sys.argv[2])
def safe(relative):
    path = Path(relative)
    if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0] != '.runtime':
        raise ValueError('Invalid deployment path')
    current = root
    for part in path.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError('Deployment links are not allowed')
        if current.exists() and not (current.is_dir() or current.is_file()):
            raise ValueError('Unsupported deployment file')
    return current
def digest(path):
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise ValueError('Deployment file must be regular and unlinked')
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(65536), b''):
            result.update(block)
    return result.hexdigest()
def read_json(path):
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise ValueError('Deployment manifest must be regular and unlinked')
    with path.open('rb') as stream:
        data = stream.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024:
        raise ValueError('Deployment manifest too large')
    return json.loads(data)
def active_root():
    pointer = safe('.runtime') / 'current'
    if not os.path.lexists(pointer):
        return None
    if not pointer.is_symlink():
        raise ValueError('Active deployment pointer must be a managed link')
    target = os.readlink(pointer)
    if not re.fullmatch('sets/[a-f0-9-]{36}', target):
        raise ValueError('Invalid active deployment target')
    directory = safe('.runtime/' + target)
    if not directory.is_dir():
        raise ValueError('Missing active deployment set')
    return directory
def active():
    directory = active_root()
    if directory is None:
        return {'schemaVersion': 1, 'entries': []}
    path = safe(str((directory / 'manifest.json').relative_to(root)))
    data = read_json(path)
    if data.get('schemaVersion') != 1 or not isinstance(data.get('entries'), list):
        raise ValueError('Invalid active manifest')
    for entry in data['entries']:
        if not re.fullmatch('[a-f0-9]{24}', entry['skillId']):
            raise ValueError('Invalid active Skill identity')
        link = directory / entry['skillId']
        expected = os.path.relpath(safe(entry['generation']), directory)
        if not link.is_symlink() or os.readlink(link) != expected:
            raise ValueError('Active Skill link does not match the manifest')
    return data
def verify(entry):
    prefix = '.runtime/skills/' + entry['skillId'] + '/' + entry['versionId'] + '/'
    generation = entry['generation']
    if not generation.startswith(prefix) or not re.fullmatch('[a-f0-9-]{36}', generation[len(prefix):]):
        return False
    base = safe(generation)
    if not base.is_dir():
        return False
    expected = set()
    for item in entry['files']:
        relative = item['path']
        if Path(relative).is_absolute() or '..' in Path(relative).parts:
            return False
        target = safe(generation + '/' + relative)
        if not target.is_file() or target.stat().st_size != item['size'] or digest(target) != item['hash']:
            return False
        expected.add(relative)
    actual = set()
    for directory, dirs, files in os.walk(base, followlinks=False):
        for name in dirs + files:
            candidate = Path(directory) / name
            safe(str(candidate.relative_to(root)))
        for name in files:
            actual.add(str((Path(directory) / name).relative_to(base)))
    return actual == expected
action = arg['action']
if action == 'read':
    print(json.dumps(active()))
elif action == 'inspect':
    match = next((entry for entry in active()['entries'] if entry['skillId'] == arg['skillId'] and entry['versionId'] == arg['versionId'] and entry['contentHash'] == arg['contentHash']), None)
    print(json.dumps(match if match and verify(match) else None))
elif action == 'prepare':
    safe('.runtime/uploads').mkdir(parents=True, exist_ok=True)
    safe(arg['stage']).mkdir(parents=True, exist_ok=False)
    print('{}')
elif action == 'extract':
    descriptor = safe(arg['descriptor'])
    if digest(descriptor) != arg['descriptorHash']:
        raise ValueError('Descriptor hash mismatch')
    entry = read_json(descriptor)
    archive = safe(arg['archive'])
    if digest(archive) != entry['contentHash']:
        raise ValueError('Package hash mismatch')
    target = safe(arg['stage'])
    with zipfile.ZipFile(archive) as package:
        infos = package.infolist()
        directories = [info for info in infos if info.is_dir()]
        if directories:
            if entry['runtimeSkills'] or [info.filename for info in directories] != ['skills/']:
                raise ValueError('Invalid empty workspace directory')
            safe(arg['stage'] + '/skills').mkdir()
            infos = [info for info in infos if not info.is_dir()]
        if len(infos) != len(entry['files']) or {item.filename for item in infos} != {item['path'] for item in entry['files']}:
            raise ValueError('Package file manifest mismatch')
        expected = {item['path']: item for item in entry['files']}
        for info in infos:
            item = expected[info.filename]
            if info.file_size != item['size'] or info.is_dir() or stat.S_IFMT(info.external_attr >> 16) not in (0, stat.S_IFREG):
                raise ValueError('Invalid package entry')
            output = safe(arg['stage'] + '/' + info.filename)
            output.parent.mkdir(parents=True, exist_ok=True)
            with package.open(info) as source, output.open('xb') as dest:
                remaining = item['size']
                while remaining:
                    block = source.read(min(65536, remaining))
                    if not block:
                        raise ValueError('Truncated package entry')
                    dest.write(block)
                    remaining -= len(block)
                if source.read(1):
                    raise ValueError('Oversized package entry')
            if digest(output) != item['hash']:
                raise ValueError('Extracted file hash mismatch')
            output.chmod(0o755 if info.filename.endswith('.sh') else 0o644)
    os.rename(target, safe(entry['generation']))
    archive.unlink()
    descriptor.unlink()
    print('{}')
elif action == 'activate':
    descriptor = safe(arg['descriptor'])
    if digest(descriptor) != arg['descriptorHash']:
        raise ValueError('Active manifest hash mismatch')
    manifest = read_json(descriptor)
    if not all(verify(entry) for entry in manifest['entries']):
        raise ValueError('Deployment changed before activation')
    active_root()
    directory = safe(arg['setDirectory'])
    for entry in manifest['entries']:
        if not re.fullmatch('[a-f0-9]{24}', entry['skillId']):
            raise ValueError('Invalid Skill identity')
        os.symlink(os.path.relpath(safe(entry['generation']), directory), directory / entry['skillId'])
    os.rename(descriptor, directory / 'manifest.json')
    pointer = safe(arg['pointer'])
    os.symlink(os.path.relpath(directory, safe('.runtime')), pointer)
    os.replace(pointer, safe('.runtime') / 'current')
    print('{}')
else:
    raise ValueError('Unknown deployment operation')`;

const executeDeployment = async (
  provider: DeploymentProvider,
  { workspaceRoot, ...args }: { workspaceRoot: string; action: string; [key: string]: string }
): Promise<unknown> => {
  const result = await provider.execute(
    ['python3', '-c', deploymentScript, workspaceRoot, JSON.stringify(args)].map(quote).join(' '),
    { timeoutMs: 120000 }
  );
  if (result.exitCode !== 0) throw new Error(`Sandbox package deployment failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
};

export const deploySandboxSkillPackages = async ({
  provider,
  workspaceRoot,
  packages,
  allowEmptyWorkspace = false,
  assertActive = async () => undefined
}: {
  provider: DeploymentProvider;
  workspaceRoot: string;
  packages: SandboxSkillPackage[];
  allowEmptyWorkspace?: boolean;
  assertActive?: () => Promise<void>;
}) => {
  const prepared = [];
  const seen = new Set<string>();
  for (const item of packages) {
    objectId.parse(item.skillId);
    objectId.parse(item.versionId);
    if (seen.has(item.skillId)) throw new Error('Duplicate Skill deployment identity');
    seen.add(item.skillId);
    const validated = await validateAndNormalizeSkillPackage(item.packageBuffer, {
      allowEmptyWorkspace
    });
    if (item.contentHash && item.contentHash !== validated.contentHash) {
      throw new Error('Skill package content hash mismatch');
    }
    const archive = await JSZip.loadAsync(validated.zipBuffer);
    const files = await Promise.all(
      Object.values(archive.files)
        .filter((file) => !file.dir)
        .map(async (file) => {
          const data = await file.async('nodebuffer');
          return { path: file.name, hash: hash(data), size: data.length };
        })
    );
    files.sort((a, b) => a.path.localeCompare(b.path));
    prepared.push({ ...item, ...validated, files });
  }
  await assertActive();
  await assertSandboxWorkspacePath({
    provider,
    workspaceRoot,
    path: '.runtime',
    allowMissing: true
  });
  const previous = ManifestSchema.parse(
    await executeDeployment(provider, { workspaceRoot, action: 'read' })
  );
  const entries: SandboxSkillManifest['entries'] = [];
  for (const item of prepared) {
    await assertActive();
    const cached = EntrySchema.nullable().parse(
      await executeDeployment(provider, {
        workspaceRoot,
        action: 'inspect',
        skillId: item.skillId,
        versionId: item.versionId,
        contentHash: item.contentHash
      })
    );
    const generation =
      cached && JSON.stringify(cached.files) === JSON.stringify(item.files)
        ? cached.generation
        : `.runtime/skills/${item.skillId}/${item.versionId}/${randomUUID()}`;
    const entry = {
      skillId: item.skillId,
      versionId: item.versionId,
      contentHash: item.contentHash,
      generation,
      files: item.files,
      runtimeSkills: item.runtimeSkills,
      ...(item.avatar ? { avatar: item.avatar } : {})
    };
    if (generation !== cached?.generation) {
      const stage = `${generation}.tmp`;
      const uploadId = randomUUID();
      const archive = `.runtime/uploads/${uploadId}.zip`;
      const descriptor = `.runtime/uploads/${uploadId}.json`;
      await executeDeployment(provider, { workspaceRoot, action: 'prepare', stage });
      const content = Buffer.from(JSON.stringify(entry));
      await assertActive();
      await provider.writeFiles([
        { path: posix.join(workspaceRoot, archive), data: new Uint8Array(item.zipBuffer) },
        { path: posix.join(workspaceRoot, descriptor), data: new Uint8Array(content) }
      ]);
      await assertActive();
      await executeDeployment(provider, {
        workspaceRoot,
        action: 'extract',
        stage,
        archive,
        descriptor,
        descriptorHash: hash(content)
      });
    }
    entries.push(entry);
  }
  const manifest = ManifestSchema.parse({ schemaVersion: 1, entries });
  if (JSON.stringify(previous) !== JSON.stringify(manifest)) {
    const descriptor = `.runtime/uploads/${randomUUID()}.json`;
    const setDirectory = `.runtime/sets/${randomUUID()}`;
    await assertActive();
    await executeDeployment(provider, {
      workspaceRoot,
      action: 'prepare',
      stage: setDirectory
    });
    const content = Buffer.from(JSON.stringify(manifest));
    await assertActive();
    await provider.writeFiles([
      { path: posix.join(workspaceRoot, descriptor), data: new Uint8Array(content) }
    ]);
    await assertActive();
    await executeDeployment(provider, {
      workspaceRoot,
      action: 'activate',
      descriptor,
      descriptorHash: hash(content),
      setDirectory,
      pointer: `.runtime/current.${randomUUID()}`
    });
  }
  return {
    manifest,
    deployedSkills: entries.flatMap((entry) =>
      entry.runtimeSkills.map((skill) => ({
        id: entry.skillId,
        versionId: entry.versionId,
        name: skill.name,
        description: skill.description,
        avatar: entry.avatar,
        directory: posix.join(workspaceRoot, '.runtime/current', entry.skillId, skill.path),
        skillMdPath: posix.join(
          workspaceRoot,
          '.runtime/current',
          entry.skillId,
          skill.path,
          'SKILL.md'
        )
      }))
    )
  };
};
