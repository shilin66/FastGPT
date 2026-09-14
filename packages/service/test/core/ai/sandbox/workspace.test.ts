import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSandbox, type ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertSandboxWorkspacePath,
  getSandboxWorkspaceRoot,
  resolveSandboxWorkspacePath
} from '../../../../core/ai/sandbox/workspace';

describe('Sandbox workspace root and lexical path', () => {
  it('OpenSandbox 有卷时与 SDK 默认 cwd 一致，否则使用镜像默认目录', () => {
    const connection = { baseUrl: 'http://sandbox.example.test', sessionId: 'workspace-test' };
    expect(getSandboxWorkspaceRoot(createSandbox('opensandbox', connection))).toBe('/home/sandbox');
    const provider = createSandbox('opensandbox', connection, {
      image: { repository: 'test-image' },
      volumes: [{ name: 'workspace', mountPath: '/custom/work', pvc: { claimName: 'test' } }]
    });
    expect(getSandboxWorkspaceRoot(provider)).toBe('/custom/work');
  });

  it.each(['.', '', './report.csv', '/workspace/report.csv'])('支持现有前端路径 %s', (path) => {
    expect(resolveSandboxWorkspacePath({ workspaceRoot: '/workspace', path })).toBe(
      path.includes('report') ? '/workspace/report.csv' : '/workspace'
    );
  });

  it.each([
    '../secret',
    '/etc/passwd',
    '/workspace-other/file',
    'a/../file',
    'a\u0000b',
    '$(id)',
    '`id`',
    'a\\b',
    'a\nb'
  ])('拒绝越界或不安全路径 %s', (path) => {
    expect(() => resolveSandboxWorkspacePath({ workspaceRoot: '/workspace', path })).toThrow(
      'Invalid Sandbox workspace path'
    );
  });

  it.each(['/', '.', 'relative', '/workspace/../outside'])(
    '拒绝不安全根目录 %s',
    (workspaceRoot) => {
      expect(() => resolveSandboxWorkspacePath({ workspaceRoot, path: '.' })).toThrow();
    }
  );
});

describe('Sandbox provider-side realpath boundary', () => {
  let fixturePath: string;
  let workspaceRoot: string;
  const execute: ISandbox['execute'] = (command) =>
    new Promise((resolve) => {
      execFile('/bin/sh', ['-c', command], { timeout: 10000 }, (error, stdout, stderr) => {
        resolve({ stdout, stderr, exitCode: error ? 1 : 0 });
      });
    });

  beforeEach(async () => {
    fixturePath = await mkdtemp(join(await realpath(tmpdir()), 'fastgpt-workspace-test-'));
    workspaceRoot = join(fixturePath, 'work space');
    await mkdir(workspaceRoot);
    await mkdir(join(fixturePath, 'outside'));
    await writeFile(join(workspaceRoot, 'report.txt'), 'report');
    await writeFile(join(fixturePath, 'outside', 'secret.txt'), 'secret');
  });

  afterEach(async () => {
    await rm(fixturePath, { recursive: true, force: true });
  });

  const check = (path: string, allowMissing = false) =>
    assertSandboxWorkspacePath({
      provider: { execute },
      workspaceRoot,
      path,
      allowMissing
    });

  it('真实执行校验命令，支持空格及单双引号而不改变 shell 结构', async () => {
    const name = `report 'single' "double".txt`;
    await writeFile(join(workspaceRoot, name), 'safe');
    await expect(check(name)).resolves.toBe(join(workspaceRoot, name));
  });

  it('允许指向根内文件的符号链接', async () => {
    await symlink(join(workspaceRoot, 'report.txt'), join(workspaceRoot, 'local-link'));
    await expect(check('local-link')).resolves.toBe(join(workspaceRoot, 'local-link'));
  });

  it('拒绝指向根外文件的符号链接', async () => {
    await symlink(join(fixturePath, 'outside', 'secret.txt'), join(workspaceRoot, 'external-link'));
    await expect(check('external-link')).rejects.toThrow('Invalid Sandbox workspace path');
  });

  it('拒绝中间目录符号链接逃逸，包括新写入文件', async () => {
    await symlink(join(fixturePath, 'outside'), join(workspaceRoot, 'outside-dir'));
    await expect(check('outside-dir/secret.txt')).rejects.toThrow();
    await expect(check('outside-dir/new-file.txt', true)).rejects.toThrow();
  });

  it('写入允许工作区内尚不存在的普通子路径，读取不允许', async () => {
    await expect(check('new/folder/report.txt', true)).resolves.toBe(
      join(workspaceRoot, 'new/folder/report.txt')
    );
    await expect(check('new/folder/report.txt')).rejects.toThrow();
  });

  it('允许根内目录链接后创建文件，但拒绝悬空链接', async () => {
    await mkdir(join(workspaceRoot, 'target'));
    await symlink(join(workspaceRoot, 'target'), join(workspaceRoot, 'internal-dir'));
    await expect(check('internal-dir/new.txt', true)).resolves.toBe(
      join(workspaceRoot, 'internal-dir/new.txt')
    );
    await symlink(join(workspaceRoot, 'missing'), join(workspaceRoot, 'dangling'));
    await expect(check('dangling', true)).rejects.toThrow();
  });

  it('provider 校验命令无成功标记时 fail closed', async () => {
    const provider = { execute: async () => ({ stdout: '', stderr: '', exitCode: 0 }) };
    await expect(
      assertSandboxWorkspacePath({ provider, workspaceRoot, path: 'report.txt' })
    ).rejects.toThrow();
  });
});
