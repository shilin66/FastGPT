import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  archiveWorkspaceScript,
  restoreWorkspaceScript
} from '@fastgpt/service/core/ai/sandbox/archiveIO';

const folders: string[] = [];
const temp = () => {
  const path = mkdtempSync(join(tmpdir(), 'sandbox-archive-test-'));
  folders.push(path);
  return path;
};
const python = (script: string, ...args: string[]) =>
  execFileSync('python3', ['-c', script, ...args], {
    encoding: 'utf8',
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe']
  }).trim();
afterEach(() => {
  for (const path of folders.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('workspace archive scripts', () => {
  it('round trips sessions, hidden files, empty directories and internal skill links', () => {
    const source = temp(),
      target = temp();
    mkdirSync(join(source, 'sessions/chat'), { recursive: true });
    writeFileSync(join(source, 'sessions/chat/report.txt'), '用户工作区');
    mkdirSync(join(source, '.runtime/skills'), { recursive: true });
    writeFileSync(join(source, '.runtime/skills/SKILL.md'), '# Skill');
    symlinkSync('skills', join(source, '.runtime/current'));
    mkdirSync(join(source, 'empty'));
    const receipt = JSON.parse(python(archiveWorkspaceScript, source, '1048576')) as {
      path: string;
      hash: string;
      size: number;
    };
    try {
      expect(
        python(
          restoreWorkspaceScript,
          JSON.stringify({ root: target, maximum: 1048576, parts: [receipt.path], ...receipt })
        )
      ).toBe('FASTGPT_ARCHIVE_INSTALLED');
      expect(readFileSync(join(target, 'sessions/chat/report.txt'), 'utf8')).toBe('用户工作区');
      expect(readFileSync(join(target, '.runtime/current/SKILL.md'), 'utf8')).toBe('# Skill');
      writeFileSync(join(target, 'new.txt'), 'retained on receipt retry');
      python(
        restoreWorkspaceScript,
        JSON.stringify({ root: target, maximum: 1048576, parts: [receipt.path], ...receipt })
      );
      expect(readFileSync(join(target, 'new.txt'), 'utf8')).toBe('retained on receipt retry');
    } finally {
      rmSync(receipt.path, { force: true });
    }
  });

  it('rejects links outside the workspace while packing', () => {
    const source = temp();
    symlinkSync('/etc/passwd', join(source, 'external'));
    expect(() => python(archiveWorkspaceScript, source, '1048576')).toThrow();
  });

  it.each(['../escape', '/absolute', 'link/escape'])(
    'rejects unsafe restore entries %s before changing the workspace',
    (name) => {
      const target = temp(),
        parts = temp();
      writeFileSync(join(target, 'draft'), 'keep this draft');
      const path = join(parts, 'bad.tar.gz');
      python(
        `import tarfile, io, sys
with tarfile.open(sys.argv[1], 'w:gz') as target:
    if sys.argv[2].startswith('link/'):
        link = tarfile.TarInfo('link'); link.type = tarfile.SYMTYPE; link.linkname = '/tmp'; target.addfile(link)
    member = tarfile.TarInfo(sys.argv[2]); member.size = 3; target.addfile(member, io.BytesIO(b'bad'))
`,
        path,
        name
      );
      const buffer = readFileSync(path);
      const args = {
        root: target,
        maximum: 1048576,
        parts: [path],
        size: buffer.length,
        hash: createHash('sha256').update(buffer).digest('hex')
      };
      expect(() => python(restoreWorkspaceScript, JSON.stringify(args))).toThrow();
      expect(readFileSync(join(target, 'draft'), 'utf8')).toBe('keep this draft');
    }
  );

  it('enforces the workspace size limit', () => {
    const source = temp();
    writeFileSync(join(source, 'large'), Buffer.alloc(1024));
    expect(() => python(archiveWorkspaceScript, source, '100')).toThrow();
  });
});
