import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  readdir,
  rm,
  writeFile,
  symlink,
  link,
  chmod
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { JSZip } from '@fastgpt/service/core/agentSkills/zipBuilder';
import {
  initializeEditSandboxWorkspace,
  exportEditSandboxWorkspace
} from '@fastgpt/service/core/agentSkills/sandboxWorkspace';
import type { SkillPackageLimits } from '@fastgpt/service/core/agentSkills/packageValidator';

const { limitOverrides } = vi.hoisted(() => ({
  limitOverrides: {} as Partial<SkillPackageLimits>
}));
vi.mock('@fastgpt/service/core/agentSkills/packageValidator', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@fastgpt/service/core/agentSkills/packageValidator')>();
  return {
    ...original,
    getSkillPackageLimits: () => ({ ...original.getSkillPackageLimits(), ...limitOverrides })
  };
});
const execute = promisify(execFile);

describe('Skill Edit atomic workspace and safe export', () => {
  let parent: string;
  let workDirectory: string;
  let provider: Parameters<typeof initializeEditSandboxWorkspace>[0]['provider'] &
    Parameters<typeof exportEditSandboxWorkspace>[0]['provider'];
  const assertActive = vi.fn(async () => undefined);
  const skillPackage = async () => {
    const zip = new JSZip();
    zip.file('skills/demo/SKILL.md', '---\nname: demo\ndescription: Demo\n---\n');
    zip.file("skills/demo/notes'; touch UNSAFE; '.txt", 'draft');
    return {
      skillId: '111111111111111111111111',
      versionId: '222222222222222222222222',
      packageBuffer: await zip.generateAsync({ type: 'nodebuffer' })
    };
  };
  beforeEach(async () => {
    parent = await realpath(await mkdtemp(join(tmpdir(), 'fastgpt-edit-')));
    workDirectory = join(parent, "edit 'quoted'");
    for (const key of Object.keys(limitOverrides))
      delete limitOverrides[key as keyof SkillPackageLimits];
    assertActive.mockReset().mockResolvedValue(undefined);
    provider = {
      execute: vi.fn(async (command) => {
        try {
          const result = await execute('/bin/sh', ['-c', command], { maxBuffer: 4 * 1024 * 1024 });
          return { ...result, exitCode: 0 };
        } catch (error) {
          return {
            stdout: '',
            stderr: error instanceof Error ? error.message : 'failed',
            exitCode: 1
          };
        }
      }),
      writeFiles: vi.fn(async (files: Parameters<typeof provider.writeFiles>[0]) =>
        Promise.all(
          files.map(async (file) => {
            await mkdir(dirname(file.path), { recursive: true });
            if (typeof file.data !== 'string' && !(file.data instanceof Uint8Array)) {
              throw new Error('Unexpected package upload type');
            }
            await writeFile(file.path, file.data);
            return {
              path: file.path,
              bytesWritten: (await readFile(file.path)).length,
              error: null
            };
          })
        )
      ),
      readFiles: vi.fn(
        async (paths: string[], options?: Parameters<typeof provider.readFiles>[1]) =>
          Promise.all(
            paths.map(async (path) => {
              const file = await readFile(path);
              const [start, end] = options?.range?.split('-').map(Number) ?? [0, file.length];
              return { path, content: new Uint8Array(file.subarray(start, end)), error: null };
            })
          )
      )
    };
  });
  afterEach(async () => {
    await rm(parent, { recursive: true, force: true });
  });
  const initialize = async () =>
    initializeEditSandboxWorkspace({
      provider,
      workDirectory,
      skillPackage: await skillPackage(),
      assertActive
    });
  const exportPackage = () => exportEditSandboxWorkspace({ provider, workDirectory, assertActive });
  const writeDraft = async (files: Record<string, string>) => {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(workDirectory, path)), { recursive: true });
      await writeFile(join(workDirectory, path), content);
    }
  };

  it.each([false, true])(
    'atomically initializes an absent/empty root (existing=%s)',
    async (existing) => {
      if (existing) await mkdir(workDirectory);
      await initialize();
      expect(await readdir(workDirectory)).toEqual(['skills']);
      expect(
        await readFile(join(workDirectory, "skills/demo/notes'; touch UNSAFE; '.txt"), 'utf8')
      ).toBe('draft');
      expect(await readdir(parent)).not.toContain('UNSAFE');
    }
  );
  it('refuses to overwrite any existing draft including one without SKILL.md', async () => {
    await mkdir(workDirectory);
    await writeFile(join(workDirectory, 'draft.txt'), 'keep');
    await expect(initialize()).rejects.toThrow();
    expect(await readdir(workDirectory)).toEqual(['draft.txt']);
    expect(await readFile(join(workDirectory, 'draft.txt'), 'utf8')).toBe('keep');
  });
  it('keeps the user root absent when upload or the initialization lease fails', async () => {
    vi.mocked(provider.writeFiles).mockRejectedValueOnce(new Error('upload failed'));
    await expect(initialize()).rejects.toThrow('upload failed');
    expect(await readdir(parent)).not.toContain("edit 'quoted'");
    assertActive.mockRejectedValue(new Error('lease lost'));
    await expect(initialize()).rejects.toThrow('lease lost');
    expect(await readdir(parent)).not.toContain("edit 'quoted'");
  });
  it('rejects provider write results containing errors', async () => {
    vi.mocked(provider.writeFiles).mockImplementationOnce(async (files) =>
      files.map((file) => ({ path: file.path, bytesWritten: 0, error: new Error('write denied') }))
    );
    await expect(initialize()).rejects.toThrow('write denied');
    expect(await readdir(parent)).not.toContain("edit 'quoted'");
  });
  it('exports a validated canonical ZIP outside the user root and removes only its temporary archive', async () => {
    await initialize();
    const zip = await JSZip.loadAsync(new Uint8Array(await exportPackage()));
    expect(await zip.file("skills/demo/notes'; touch UNSAFE; '.txt")?.async('string')).toBe(
      'draft'
    );
    expect(await readdir(workDirectory)).toEqual(['skills']);
    expect((await readdir(parent)).filter((name) => name.endsWith('.zip'))).toEqual([]);
  });
  it('reads the complete ZIP through the installed OpenSandbox SDK half-open range contract', async () => {
    await initialize();
    const requireFromService = createRequire(
      new URL('../../../../../packages/service/package.json', import.meta.url)
    );
    const { OpenSandboxAdapter } = requireFromService('@fastgpt-sdk/sandbox-adapter') as {
      OpenSandboxAdapter: new (connection: {
        baseUrl: string;
        sessionId: string;
      }) => typeof provider;
    };
    const adapter = new OpenSandboxAdapter({
      baseUrl: 'http://sandbox.invalid',
      sessionId: 'local-sdk-contract'
    });
    const localExecute = provider.execute;
    adapter.execute = (command, options) =>
      localExecute(command.replace('base64 -w 0', 'openssl base64 -A'), options);
    provider.readFiles = adapter.readFiles.bind(adapter);
    const zip = await JSZip.loadAsync(new Uint8Array(await exportPackage()));
    expect(await zip.file("skills/demo/notes'; touch UNSAFE; '.txt")?.async('string')).toBe(
      'draft'
    );
    expect(localExecute).toHaveBeenCalledWith(
      expect.stringMatching(/tail -c \+1 .+ \| head -c \d+ \| openssl base64 -A/),
      undefined
    );
  });
  it('exports a large ZIP without losing data to the SDK command output limit', async () => {
    await initialize();
    const payload = randomBytes(1024 * 1024 + 17);
    await writeFile(join(workDirectory, 'skills/demo/payload.bin'), payload);
    const requireFromService = createRequire(
      new URL('../../../../../packages/service/package.json', import.meta.url)
    );
    const { OpenSandboxAdapter } = requireFromService('@fastgpt-sdk/sandbox-adapter') as {
      OpenSandboxAdapter: new (connection: {
        baseUrl: string;
        sessionId: string;
      }) => typeof provider;
    };
    const adapter = new OpenSandboxAdapter({
      baseUrl: 'http://sandbox.invalid',
      sessionId: 'local-sdk-large-archive'
    });
    const localExecute = provider.execute;
    adapter.execute = async (command, options) => {
      const result = await localExecute(
        command.replace('base64 -w 0', 'openssl base64 -A'),
        options
      );
      // Model the installed SDK's 1 MiB tail-retaining command output buffer.
      return { ...result, stdout: result.stdout.slice(-1024 * 1024) };
    };
    provider.readFiles = adapter.readFiles.bind(adapter);
    const zip = await JSZip.loadAsync(new Uint8Array(await exportPackage()));
    expect(await zip.file('skills/demo/payload.bin')?.async('nodebuffer')).toEqual(payload);
    expect((await readdir(parent)).filter((name) => name.endsWith('.zip'))).toEqual([]);
  });
  it.each(['short', 'long', 'corrupted', 'missing', 'error'] as const)(
    'rejects a %s later archive chunk without changing the draft',
    async (failure) => {
      await initialize();
      const payload = randomBytes(1024 * 1024 + 17);
      const payloadPath = join(workDirectory, 'skills/demo/payload.bin');
      await writeFile(payloadPath, payload);
      const readFiles = provider.readFiles;
      let reads = 0;
      provider.readFiles = async (paths, options) => {
        const files = await readFiles(paths, options);
        if (++reads !== 2) return files;
        if (failure === 'missing') return [];
        if (failure === 'error') return [{ ...files[0], error: new Error('read denied') }];
        const bytes = files[0].content;
        if (!(bytes instanceof Uint8Array)) throw new Error('Expected archive bytes');
        if (failure === 'short') files[0].content = bytes.slice(0, -1);
        if (failure === 'long') files[0].content = new Uint8Array(bytes.length + 1);
        if (failure === 'corrupted') bytes[0] ^= 1;
        return files;
      };
      const expected = {
        short: 'Invalid Edit archive size',
        long: 'Invalid Edit archive size',
        corrupted: 'Edit archive changed during read',
        missing: 'Missing Edit archive read result',
        error: 'read denied'
      };
      await expect(exportPackage()).rejects.toThrow(expected[failure]);
      expect(reads).toBeGreaterThanOrEqual(2);
      expect(await readFile(payloadPath)).toEqual(payload);
      expect((await readdir(parent)).filter((name) => name.endsWith('.zip'))).toEqual([]);
    }
  );
  it('checks the active lease before reading each archive chunk', async () => {
    await initialize();
    await writeFile(join(workDirectory, 'skills/demo/payload.bin'), randomBytes(1024 * 1024));
    const readFiles = provider.readFiles;
    provider.readFiles = async (paths, options) => {
      const files = await readFiles(paths, options);
      assertActive.mockRejectedValue(new Error('lease lost'));
      return files;
    };
    await expect(exportPackage()).rejects.toThrow('lease lost');
    expect(readFiles).toHaveBeenCalledTimes(1);
    expect(await readdir(workDirectory)).toEqual(['skills']);
  });
  it('preserves executable entrypoint permissions in the validated export', async () => {
    await initialize();
    await writeFile(join(workDirectory, 'entrypoint.sh'), '#!/bin/sh\necho ready\n');
    await chmod(join(workDirectory, 'entrypoint.sh'), 0o755);
    const zip = await JSZip.loadAsync(new Uint8Array(await exportPackage()));
    expect(zip.file('entrypoint.sh')?.unixPermissions).toBe(0o100755);
  });
  it('preserves non-shell executable files without promoting source-only shell files', async () => {
    await initialize();
    await writeDraft({ 'skills/demo/run': '#!/bin/sh\n', 'skills/demo/source.sh': '# source\n' });
    await chmod(join(workDirectory, 'skills/demo/run'), 0o750);
    await chmod(join(workDirectory, 'skills/demo/source.sh'), 0o640);
    const zip = await JSZip.loadAsync(new Uint8Array(await exportPackage()));
    expect(zip.file('skills/demo/run')?.unixPermissions).toBe(0o100750);
    expect(zip.file('skills/demo/source.sh')?.unixPermissions).toBe(0o100640);
  });
  it('uses root and nested gitignore precedence, globstar, escapes and directory pruning', async () => {
    await initialize();
    await writeDraft({
      '.gitignore':
        '*.tmp\n!keep.tmp\n/skills/demo/root-only.txt\n**/generated/**\nblocked/\n!blocked/keep.txt\n',
      'skills/demo/.gitignore': '!nested.tmp\n\\#note.txt\n\\!note.txt\nspace\\ \n[a-c].txt\n',
      'skills/demo/drop.tmp': 'omit',
      'skills/demo/keep.tmp': 'keep',
      'skills/demo/nested.tmp': 'keep',
      'skills/demo/root-only.txt': 'omit',
      'skills/demo/sub/root-only.txt': 'keep',
      'skills/demo/sub/generated/item.txt': 'omit',
      'skills/demo/blocked/keep.txt': 'omit',
      'skills/demo/#note.txt': 'omit',
      'skills/demo/!note.txt': 'omit',
      'skills/demo/space ': 'omit',
      'skills/demo/a.txt': 'omit',
      'skills/demo/d.txt': 'keep'
    });
    const zip = await JSZip.loadAsync(new Uint8Array(await exportPackage()));
    const files = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map((entry) => entry.name);
    expect(files).toEqual(
      expect.arrayContaining([
        '.gitignore',
        'skills/demo/.gitignore',
        'skills/demo/keep.tmp',
        'skills/demo/nested.tmp',
        'skills/demo/sub/root-only.txt',
        'skills/demo/d.txt'
      ])
    );
    for (const path of [
      'drop.tmp',
      'root-only.txt',
      'sub/generated/item.txt',
      'blocked/keep.txt',
      '#note.txt',
      '!note.txt',
      'space ',
      'a.txt'
    ]) {
      expect(files).not.toContain(`skills/demo/${path}`);
    }
    expect(await readFile(join(workDirectory, 'skills/demo/drop.tmp'), 'utf8')).toBe('omit');
  });
  it('applies shared skills-level rules, reopened directories and directory-only matches', async () => {
    await initialize();
    await writeDraft({
      'skills/.gitignore':
        '*.scratch\n!keep.scratch\nreopened/\n!reopened/\n**/reopened/*\n!**/reopened/keep.txt\ncache-dir/\n',
      'skills/demo/drop.scratch': 'omit',
      'skills/demo/keep.scratch': 'keep',
      'skills/demo/reopened/drop.txt': 'omit',
      'skills/demo/reopened/keep.txt': 'keep',
      'skills/demo/cache-dir': 'a regular file',
      'skills/demo/sub/cache-dir/drop.txt': 'omit'
    });
    const zip = await JSZip.loadAsync(new Uint8Array(await exportPackage()));
    expect(zip.file('skills/.gitignore')).not.toBeNull();
    expect(zip.file('skills/demo/drop.scratch')).toBeNull();
    expect(zip.file('skills/demo/keep.scratch')).not.toBeNull();
    expect(zip.file('skills/demo/reopened/drop.txt')).toBeNull();
    expect(zip.file('skills/demo/reopened/keep.txt')).not.toBeNull();
    expect(zip.file('skills/demo/cache-dir')).not.toBeNull();
    expect(zip.file('skills/demo/sub/cache-dir/drop.txt')).toBeNull();
  });
  it('never lets negation publish credentials, provider state, dependencies or caches', async () => {
    await initialize();
    const excluded = [
      '.env',
      '.env.production',
      '.envrc',
      'tls.key',
      'client.pem',
      'id_ed25519',
      'keys/api.json',
      'credentials.json',
      '.npmrc',
      '.git/config',
      'node_modules/deep/file.txt',
      '.venv/bin/python',
      '.cache/file.txt',
      '__pycache__/code.pyc',
      'logs/run.txt',
      'run.log',
      'run.log.1',
      'provider/state.json',
      '.codex/auth.json',
      '.fastgpt/runtime/state.json',
      '.omni/skills/skill-creator/SKILL.md',
      '.runtime/manifest.json',
      '.code-server/User/settings.json'
    ];
    await writeDraft({
      '.gitignore':
        excluded.map((path) => `!**/${path}\n`).join('') + '!**/node_modules/\n!**/.git/\n',
      '.env': 'root credential',
      '.codex/auth.json': 'root state',
      ...Object.fromEntries(excluded.map((path) => [`skills/demo/${path}`, 'do not publish']))
    });
    const zip = await JSZip.loadAsync(new Uint8Array(await exportPackage()));
    for (const path of excluded) expect(zip.file(`skills/demo/${path}`)).toBeNull();
    expect(zip.file('.env')).toBeNull();
    expect(zip.file('.codex/auth.json')).toBeNull();
    expect(zip.file('skills/demo/SKILL.md')).not.toBeNull();
    expect(await readFile(join(workDirectory, 'skills/demo/.env'), 'utf8')).toBe('do not publish');
  });
  it('prunes ignored dependency trees before counting or opening their unsafe contents', async () => {
    await initialize();
    const dependencies = join(workDirectory, 'skills/demo/node_modules/a/b/c/d/e/f');
    await mkdir(dependencies, { recursive: true });
    await symlink(parent, join(dependencies, 'outside'));
    limitOverrides.maxDepth = 4;
    limitOverrides.maxEntries = 6;
    const zip = await JSZip.loadAsync(new Uint8Array(await exportPackage()));
    expect(Object.keys(zip.files).some((path) => path.includes('node_modules'))).toBe(false);
  });
  it('does not read workspace git configuration or external exclude files', async () => {
    await initialize();
    const outside = join(parent, 'external-ignore');
    await writeFile(outside, '*\n');
    await writeDraft({ '.git/config': `[core]\nexcludesFile = ${outside}\n` });
    const zip = await JSZip.loadAsync(new Uint8Array(await exportPackage()));
    expect(zip.file('skills/demo/SKILL.md')).not.toBeNull();
    expect(zip.file('.git/config')).toBeNull();
  });
  it('ignores inherited Git configuration and global excludes', async () => {
    await initialize();
    const externalIgnore = join(parent, 'external-ignore');
    const externalConfig = join(parent, 'external-config');
    await writeFile(externalIgnore, '*\n');
    await writeFile(externalConfig, `[core]\nexcludesFile = ${externalIgnore}\n`);
    vi.mocked(provider.execute).mockImplementation(async (command) => {
      const result = await execute('/bin/sh', ['-c', command], {
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: externalConfig,
          GIT_CONFIG_COUNT: '1',
          GIT_CONFIG_KEY_0: 'core.excludesFile',
          GIT_CONFIG_VALUE_0: externalIgnore
        }
      });
      return { ...result, exitCode: 0 };
    });
    const zip = await JSZip.loadAsync(new Uint8Array(await exportPackage()));
    expect(zip.file('skills/demo/SKILL.md')).not.toBeNull();
  });
  it('rejects unknown root entries even when user gitignore would hide them', async () => {
    await initialize();
    await writeDraft({ '.gitignore': 'unknown.txt\n', 'unknown.txt': 'keep draft' });
    await expect(exportPackage()).rejects.toThrow();
    expect(await readFile(join(workDirectory, 'unknown.txt'), 'utf8')).toBe('keep draft');
  });
  it.each(['symlink', 'hardlink'])(
    'refuses a %s gitignore without reading the target',
    async (kind) => {
      await initialize();
      const outside = join(parent, 'outside-ignore');
      await writeFile(outside, '*\n');
      const target = join(workDirectory, '.gitignore');
      if (kind === 'symlink') await symlink(outside, target);
      else await link(outside, target);
      await expect(exportPackage()).rejects.toThrow();
      expect(provider.readFiles).not.toHaveBeenCalled();
    }
  );
  it('bounds gitignore input before downloading or publishing', async () => {
    await initialize();
    await writeDraft({ '.gitignore': '#'.repeat(65537) });
    await expect(exportPackage()).rejects.toThrow('gitignore');
    expect(provider.readFiles).not.toHaveBeenCalled();
  });
  it('bounds cumulative nested gitignore input', async () => {
    await initialize();
    await writeDraft(
      Object.fromEntries(
        Array.from({ length: 17 }, (_, index) => [
          `skills/demo/rules-${index}/.gitignore`,
          '#'.repeat(65536)
        ])
      )
    );
    await expect(exportPackage()).rejects.toThrow('gitignore rules exceed total size');
    expect(provider.readFiles).not.toHaveBeenCalled();
    expect((await readdir(parent)).filter((name) => name.endsWith('.zip'))).toEqual([]);
  });
  it('rejects gitignore changes during evaluation even when the rules exclude themselves', async () => {
    await initialize();
    await writeDraft({ '.gitignore': '.gitignore\n*.tmp\n', 'skills/demo/data.tmp': 'draft' });
    const localExecute = provider.execute;
    provider.execute = (command, options) =>
      localExecute(
        command.replace(
          'import hashlib, io, shutil, subprocess, tempfile, zipfile',
          `import hashlib, io, shutil, subprocess, tempfile, zipfile
original_git_run = subprocess.run
def mutate_rules(*args, **kwargs):
    result = original_git_run(*args, **kwargs)
    with open(os.path.join(arg["root"], ".gitignore"), "ab") as rules:
        rules.write(b"# concurrent edit")
    return result
subprocess.run = mutate_rules`
        ),
        options
      );
    await expect(exportPackage()).rejects.toThrow('gitignore changed');
    expect(provider.readFiles).not.toHaveBeenCalled();
    expect((await readdir(parent)).filter((name) => name.endsWith('.zip'))).toEqual([]);
  });
  it('rejects changes to an already copied file before the snapshot is sealed', async () => {
    await initialize();
    const localExecute = provider.execute;
    provider.execute = (command, options) =>
      localExecute(
        command.replace(
          '# All copied files must overlap at one unchanged workspace instant before packaging.',
          'with open(os.path.join(arg["root"], "skills/demo/SKILL.md"), "ab") as changed: changed.write(b"concurrent edit")'
        ),
        options
      );
    await expect(exportPackage()).rejects.toThrow('changed during snapshot');
    expect(provider.readFiles).not.toHaveBeenCalled();
    expect((await readdir(parent)).filter((name) => name.endsWith('.zip'))).toEqual([]);
  });
  it('preserves a draft created while package upload is in progress', async () => {
    const write = provider.writeFiles;
    provider.writeFiles = async (files) => {
      const result = await write(files);
      await mkdir(workDirectory, { recursive: true });
      await writeFile(join(workDirectory, 'draft.txt'), 'concurrent draft');
      return result;
    };
    await expect(initialize()).rejects.toThrow('not empty');
    expect(await readdir(workDirectory)).toEqual(['draft.txt']);
    expect(await readFile(join(workDirectory, 'draft.txt'), 'utf8')).toBe('concurrent draft');
  });
  it.each(['symlink', 'hardlink', 'fifo'])(
    'refuses %s files without reading outside the workspace',
    async (kind) => {
      await initialize();
      const outside = join(parent, 'secret.txt');
      await writeFile(outside, 'do not export');
      const target = join(workDirectory, 'skills/demo/unsafe');
      if (kind === 'symlink') await symlink(outside, target);
      if (kind === 'hardlink') await link(outside, target);
      if (kind === 'fifo') await execute('mkfifo', [target]);
      await expect(exportPackage()).rejects.toThrow();
      expect(provider.readFiles).not.toHaveBeenCalled();
      expect(await readFile(outside, 'utf8')).toBe('do not export');
    }
  );
  it('rejects a symlink root during initialization and export', async () => {
    const outside = join(parent, 'outside');
    await mkdir(outside);
    await symlink(outside, workDirectory);
    await expect(initialize()).rejects.toThrow();
    await expect(exportPackage()).rejects.toThrow();
    expect(await readdir(outside)).toEqual([]);
  });
  it.each([
    'maxFileBytes',
    'maxArchiveBytes',
    'maxEntries',
    'maxDepth',
    'maxUncompressedBytes'
  ] as const)('enforces shared %s before downloading', async (limit) => {
    await initialize();
    limitOverrides[limit] = 1;
    await expect(exportPackage()).rejects.toThrow();
    expect(provider.readFiles).not.toHaveBeenCalled();
    expect((await readdir(parent)).filter((name) => name.endsWith('.zip'))).toEqual([]);
  });
  it('rejects provider read errors and cleans up only its temporary archive', async () => {
    await initialize();
    vi.mocked(provider.readFiles).mockImplementationOnce(async ([path]) => [
      { path, content: new Uint8Array(), error: new Error('read denied') }
    ]);
    await expect(exportPackage()).rejects.toThrow('read denied');
    expect((await readdir(parent)).filter((name) => name.endsWith('.zip'))).toEqual([]);
    expect(await readdir(workDirectory)).toEqual(['skills']);
  });
});
