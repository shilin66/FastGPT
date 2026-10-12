import { posix } from 'node:path';
import z from 'zod';
import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import type { DeployedSkillInfo } from '../workflow/dispatch/ai/agent/sub/sandbox/types';
import { parseSkillMarkdown } from './utils';
import { getLogger, LogCategories } from '../../common/logger';

const maxSkills = 128;
const maxFileBytes = 64 * 1024;
const quote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;
const MetadataSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
  description: z.string().max(2048).default('')
});
const DiscoverySchema = z.object({
  files: z.array(z.object({ path: z.string(), content: z.string() })).max(maxSkills),
  omitted: z.number().int().nonnegative(),
  truncated: z.boolean()
});

const discoveryScript = `import os, sys, stat, json, itertools
arg = json.loads(sys.argv[2])
root = os.open(sys.argv[1], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
files, omitted, total, truncated = [], 0, 0, False
def open_directory(parts):
    fd = os.dup(root)
    try:
        for part in parts:
            if part in ('', '.', '..') or '/' in part:
                raise ValueError('Invalid Skill path')
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise
def read_skill(path):
    global omitted, total, truncated
    if len(files) >= arg['maxSkills']:
        truncated = True
        return
    try:
        folder = open_directory(path.split('/')[:-1])
        try:
            fd = os.open('SKILL.md', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=folder)
        finally:
            os.close(folder)
        with os.fdopen(fd, 'rb') as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                raise ValueError('Skill must be a regular file')
            content = stream.read(arg['maxFileBytes'] + 1)
        if len(content) > arg['maxFileBytes']:
            raise ValueError('Skill metadata exceeds size limit')
        if total + len(content) > 1024 * 1024:
            truncated = True
            return
        files.append({'path': path, 'content': content.decode('utf-8')})
        total += len(content)
    except (OSError, ValueError):
        omitted += 1
try:
    for path in arg['publishedPaths'][:arg['maxSkills']]:
        read_skill(path)
    truncated = truncated or len(arg['publishedPaths']) > arg['maxSkills']
    try:
        folder = open_directory(['skills'])
    except OSError:
        folder = None
    if folder is not None:
        try:
            with os.scandir(folder) as stream:
                names = [entry.name for entry in itertools.islice(stream, arg['maxSkills'] + 1)]
            truncated = truncated or len(names) > arg['maxSkills']
            for name in sorted(names[:arg['maxSkills']]):
                read_skill('skills/' + name + '/SKILL.md')
        finally:
            os.close(folder)
    print(json.dumps({'files': files, 'omitted': omitted, 'truncated': truncated}))
finally:
    os.close(root)`;

export class SandboxSkillDiscoveryError extends Error {
  constructor() {
    super('Sandbox Skill discovery failed');
    this.name = 'SandboxSkillDiscoveryError';
  }
}

export const discoverRuntimeSandboxSkills = async ({
  provider,
  workspaceRoot,
  publishedSkills
}: {
  readonly provider: Pick<ISandbox, 'execute'>;
  readonly workspaceRoot: string;
  readonly publishedSkills: readonly DeployedSkillInfo[];
}): Promise<DeployedSkillInfo[]> => {
  const published = new Map(
    publishedSkills.map((skill) => [posix.relative(workspaceRoot, skill.skillMdPath), skill])
  );
  const result = await provider.execute(
    [
      'python3',
      '-c',
      discoveryScript,
      workspaceRoot,
      JSON.stringify({
        publishedPaths: [...published.keys()],
        maxSkills,
        maxFileBytes
      })
    ]
      .map(quote)
      .join(' '),
    { timeoutMs: 30000, maxOutputBytes: 8 * 1024 * 1024 }
  );
  if (result.exitCode !== 0) throw new SandboxSkillDiscoveryError();
  const discovered = DiscoverySchema.parse(JSON.parse(result.stdout));
  const skills: DeployedSkillInfo[] = [];
  let invalid = 0;
  for (const file of discovered.files) {
    const original = published.get(file.path);
    if (!original && !/^skills\/[^/]+\/SKILL\.md$/.test(file.path))
      throw new SandboxSkillDiscoveryError();
    const parsed = parseSkillMarkdown(file.content);
    const metadata = MetadataSchema.safeParse(parsed.frontmatter);
    if (parsed.error || !metadata.success) {
      invalid++;
      continue;
    }
    const relativeDirectory = posix.dirname(file.path);
    skills.push({
      ...(original ?? { id: `workspace:${relativeDirectory}` }),
      source: original ? 'published' : 'workspace',
      ...metadata.data,
      directory: posix.join(workspaceRoot, relativeDirectory),
      skillMdPath: posix.join(workspaceRoot, file.path)
    });
  }
  if (discovered.omitted || discovered.truncated || invalid) {
    getLogger(LogCategories.MODULE.AI.AGENT).warn(
      'Some workspace Skills were excluded from discovery',
      {
        omitted: discovered.omitted,
        invalid,
        truncated: discovered.truncated
      }
    );
  }
  return skills;
};
