import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSandbox, type ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertSandboxWorkspacePath,
  assertSandboxWorkspacePaths,
  getSandboxWorkspaceRoot,
  resolveSandboxWorkspacePath,
  resolveSandboxToolPath
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

describe('Sandbox tool working directory paths', () => {
  const resolve = (path: string) =>
    resolveSandboxToolPath({
      workspaceRoot: '/workspace',
      workingDirectory: '/workspace/sessions/chat',
      path
    });

  it.each([
    'report.txt',
    '/workspace/sessions/chat/report.txt',
    'workspace/sessions/chat/report.txt'
  ])('将 %s 解析到同一会话文件', (path) => {
    expect(resolve(path)).toBe('/workspace/sessions/chat/report.txt');
  });
  it.each(['', '.', 'workspace/sessions/chat', '/workspace/sessions/chat/'])(
    '将 %s 解析为当前工作目录',
    (path) => {
      expect(resolve(path)).toBe('/workspace/sessions/chat');
    }
  );
  it('按完整目录边界匹配，保留普通子目录、显式相对目录及历史绝对目录', () => {
    expect(resolve('outputs/report.txt')).toBe('/workspace/sessions/chat/outputs/report.txt');
    expect(resolve('workspace/sessions/chat-other/report.txt')).toBe(
      '/workspace/sessions/chat/workspace/sessions/chat-other/report.txt'
    );
    const nested = '/workspace/sessions/chat/workspace/sessions/chat/report.txt';
    expect(resolve('./workspace/sessions/chat/report.txt')).toBe(nested);
    expect(resolve(nested)).toBe(nested);
    expect(resolve('/workspace/.runtime/current/skill/SKILL.md')).toBe(
      '/workspace/.runtime/current/skill/SKILL.md'
    );
  });
  it.each([
    '../other',
    '/etc/passwd',
    'workspace/sessions/chat/../secret',
    'workspace/sessions/chat/$(id)'
  ])('路径纠正仍拒绝不安全输入 %s', (path) => {
    expect(() => resolve(path)).toThrow('Invalid Sandbox workspace path');
  });
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

  it('批量校验每个目录条目，任一符号链接越界时整体拒绝', async () => {
    await writeFile(join(workspaceRoot, 'second.txt'), 'safe');
    await expect(
      assertSandboxWorkspacePaths({
        provider: { execute },
        workspaceRoot,
        paths: ['report.txt', 'second.txt']
      })
    ).resolves.toEqual([join(workspaceRoot, 'report.txt'), join(workspaceRoot, 'second.txt')]);

    await symlink(join(fixturePath, 'outside', 'secret.txt'), join(workspaceRoot, 'external-link'));
    await expect(
      assertSandboxWorkspacePaths({
        provider: { execute },
        workspaceRoot,
        paths: ['report.txt', 'external-link']
      })
    ).rejects.toThrow('Invalid Sandbox workspace path');
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
