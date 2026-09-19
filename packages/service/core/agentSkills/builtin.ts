import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import z from 'zod';
import { parseSkillMarkdown } from './utils';

const resourcePath = 'packages/service/core/agentSkills/builtin/skill-creator/SKILL.md';
const quote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;
const syncScript = `import os, json, sys, hashlib, base64, stat, tempfile
arg = json.loads(sys.argv[1])
home = os.path.realpath(os.path.expanduser('~'))
def folder(parts):
    path = home
    for part in parts:
        path = os.path.join(path, part)
        if os.path.lexists(path):
            if not stat.S_ISDIR(os.lstat(path).st_mode):
                raise ValueError('Invalid builtin directory')
        else:
            os.mkdir(path, mode=0o700)
    return path
root = folder(['.fastgpt', 'skills', 'skill-creator'])
runtime = folder(['.fastgpt', 'runtime'])
content = base64.b64decode(arg['content'], validate=True)
if hashlib.sha256(content).hexdigest() != arg['hash']:
    raise ValueError('Builtin content mismatch')
def replace(path, data):
    fd, temporary = tempfile.mkstemp(dir=os.path.dirname(path))
    try:
        with os.fdopen(fd, 'wb') as target:
            target.write(data)
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)
path = os.path.join(root, 'SKILL.md')
unchanged = False
if os.path.lexists(path) and stat.S_ISREG(os.lstat(path).st_mode):
    with open(path, 'rb') as source:
        unchanged = source.read(len(content) + 1) == content
if not unchanged: replace(path, content)
state_path = os.path.join(runtime, 'state.json')
state = {}
if os.path.lexists(state_path):
    if not stat.S_ISREG(os.lstat(state_path).st_mode): raise ValueError('Invalid runtime state')
    with open(state_path, 'rb') as source:
        raw = source.read(1048577)
    if len(raw) > 1048576: raise ValueError('Runtime state exceeds limit')
    state = json.loads(raw)
    if not isinstance(state, dict): raise ValueError('Invalid runtime state')
if state.get('builtinSkill:skill-creator') != arg['hash']:
    state['builtinSkill:skill-creator'] = arg['hash']
    replace(state_path, json.dumps(state).encode('utf-8'))
print(json.dumps({'root': root, 'path': path}))`;

export const loadSkillCreator = async () => {
  const content = await readFile(join(process.cwd(), resourcePath), 'utf8').catch(
    (error: unknown) => {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
      return readFile(join(process.cwd(), '../..', resourcePath), 'utf8');
    }
  );
  const { frontmatter } = parseSkillMarkdown(content);
  if (frontmatter.name !== 'skill-creator' || typeof frontmatter.description !== 'string')
    throw new Error('Invalid bundled Skill Creator');
  return {
    content,
    description: frontmatter.description,
    hash: createHash('sha256').update(content).digest('hex')
  };
};

export const syncSkillCreator = async (sandbox: Pick<ISandbox, 'execute'>) => {
  const resource = await loadSkillCreator();
  const result = await sandbox.execute(
    [
      'python3',
      '-c',
      syncScript,
      JSON.stringify({
        content: Buffer.from(resource.content).toString('base64'),
        hash: resource.hash
      })
    ]
      .map(quote)
      .join(' '),
    { timeoutMs: 15000 }
  );
  if (result.exitCode !== 0) throw new Error('Skill Creator initialization failed');
  const { root, path } = z
    .object({ root: z.string().startsWith('/'), path: z.string().startsWith('/') })
    .parse(JSON.parse(result.stdout));
  if (path !== `${root}/SKILL.md` || !root.endsWith('/.fastgpt/skills/skill-creator'))
    throw new Error('Invalid Skill Creator location');
  return { root, path, description: resource.description };
};
