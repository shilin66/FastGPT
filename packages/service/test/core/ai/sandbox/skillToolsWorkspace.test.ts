import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSandbox } from '@fastgpt-sdk/sandbox-adapter';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentSandboxContext } from '../../../../core/workflow/dispatch/ai/agent/sub/sandbox/types';
import {
  dispatchSandboxReadFile,
  dispatchSandboxWriteFile,
  dispatchSandboxEditFile,
  dispatchSandboxExecute,
  dispatchSandboxSearch,
  dispatchSandboxFetchUserFile
} from '../../../../core/workflow/dispatch/ai/agent/sub/sandbox/skill';

type FileWriteEntries = Parameters<AgentSandboxContext['sandbox']['writeFiles']>[0];
type ExecuteOptions = Parameters<AgentSandboxContext['sandbox']['execute']>[1];

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('axios', () => ({ default: { get: fetchMock } }));
vi.mock('@fastgpt/service/common/api/serverRequest', () => ({
  serverRequestBaseUrl: 'http://localhost:3000'
}));

const availableFiles = { '1': { url: '/api/file/test', name: 'report.csv', type: 'file' } };
const workDirectory = '/workspace/skill';
const provider = createSandbox('opensandbox', {
  baseUrl: 'http://sandbox.example.test',
  sessionId: 'skill-tools-test'
});
const executeMock = vi.spyOn(provider, 'execute');
const readMock = vi.spyOn(provider, 'readFiles');
const writeMock = vi.spyOn(provider, 'writeFiles');
const editMock = vi.spyOn(provider, 'replaceContent');
const searchMock = vi.spyOn(provider, 'search');
const context: AgentSandboxContext = {
  sandbox: provider,
  sandboxId: 'sandbox',
  providerSandboxId: 'provider',
  sessionId: 'session',
  skills: [],
  deployedSkills: [],
  workDirectory,
  isReady: true
};

describe('Skill tools workspace boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeMock.mockImplementation(async (command: string) => ({
      stdout: command.startsWith("'python3'") ? 'FASTGPT_WORKSPACE_PATH_OK' : 'executed',
      stderr: '',
      exitCode: 0
    }));
    readMock.mockImplementation(async (paths: string[]) =>
      paths.map((path) => ({ path, content: Buffer.from('old value'), error: null }))
    );
    writeMock.mockImplementation(async (entries: FileWriteEntries) =>
      entries.map((entry) => ({ path: entry.path, bytesWritten: 9, error: null }))
    );
    editMock.mockResolvedValue();
    searchMock.mockResolvedValue([]);
    fetchMock.mockResolvedValue({ data: new TextEncoder().encode('report').buffer });
  });

  const operations = [
    { name: 'read', run: (path: string) => dispatchSandboxReadFile(context, { paths: [path] }) },
    {
      name: 'write',
      run: (path: string) => dispatchSandboxWriteFile(context, { path, content: 'new' })
    },
    {
      name: 'edit',
      run: (path: string) =>
        dispatchSandboxEditFile(context, {
          entries: [{ path, oldContent: 'old', newContent: 'new' }]
        })
    },
    {
      name: 'execute',
      run: (path: string) =>
        dispatchSandboxExecute(context, {
          command: 'echo unrestricted',
          workingDirectory: path,
          timeoutMs: 1000
        })
    },
    {
      name: 'search',
      run: (path: string) => dispatchSandboxSearch(context, { pattern: '*.txt', path })
    },
    {
      name: 'fetch',
      run: (path: string) =>
        dispatchSandboxFetchUserFile(
          context,
          { file_index: '1', target_path: path },
          availableFiles
        )
    }
  ];

  describe.each(operations)('$name', ({ run }) => {
    it.each(['/etc/passwd', '../outside', '/workspace/another-skill/file', 'bad\u0000name'])(
      '拒绝越界输入且没有文件或网络副作用 %s',
      async (path) => {
        const result = await run(path);
        expect(result.response).toMatch(/Failed/);
        expect(readMock).not.toHaveBeenCalled();
        expect(writeMock).not.toHaveBeenCalled();
        expect(editMock).not.toHaveBeenCalled();
        expect(searchMock).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(executeMock).not.toHaveBeenCalled();
      }
    );
  });

  it('读取使用显式 Skill 根，保留根内绝对路径契约', async () => {
    const result = await dispatchSandboxReadFile(context, {
      paths: ['report.txt', `${workDirectory}/absolute.txt`]
    });
    expect(result.response).toContain('old value');
    expect(readMock).toHaveBeenCalledWith([
      `${workDirectory}/report.txt`,
      `${workDirectory}/absolute.txt`
    ]);
  });

  it('读取复核 provider 返回路径，不把外部内容返回给模型', async () => {
    readMock.mockResolvedValue([
      { path: '/etc/passwd', content: Buffer.from('secret'), error: null }
    ]);
    const result = await dispatchSandboxReadFile(context, { paths: ['report.txt'] });
    expect(result.response).toContain('Failed');
    expect(result.response).not.toContain('secret');
  });

  it('读取错误不伪装成成功内容', async () => {
    readMock.mockResolvedValue([
      {
        path: `${workDirectory}/report.txt`,
        content: new Uint8Array(),
        error: new Error('read failed')
      }
    ]);
    const result = await dispatchSandboxReadFile(context, { paths: ['report.txt'] });
    expect(result.response).toContain('Failed to read files: read failed');
  });

  it('写入错误不伪装成成功', async () => {
    writeMock.mockResolvedValue([
      { path: `${workDirectory}/report.txt`, bytesWritten: 0, error: new Error('disk full') }
    ]);
    const result = await dispatchSandboxWriteFile(context, { path: 'report.txt', content: 'new' });
    expect(result.response).toContain('Failed to write file: disk full');
  });

  it('写入使用字节内容，内容中的 shell heredoc 标记不会被解释', async () => {
    const content = "hello\nPOLYFILL_EOF\n'quoted'\n";
    await dispatchSandboxWriteFile(context, { path: 'report.txt', content });
    expect(writeMock).toHaveBeenCalledWith([
      { path: `${workDirectory}/report.txt`, data: new TextEncoder().encode(content) }
    ]);
  });

  it('编辑支持单引号、多行和字面量正则字符，不调用 SDK sed', async () => {
    const content = "first\nold 'quoted'.*\nlast";
    readMock.mockImplementation(async (paths: string[]) =>
      paths.map((path) => ({ path, content: Buffer.from(content), error: null }))
    );
    const result = await dispatchSandboxEditFile(context, {
      entries: [
        {
          path: 'report.txt',
          oldContent: "first\nold 'quoted'.*",
          newContent: "new 'literal'\nnext"
        }
      ]
    });
    expect(result.response).toContain('Files edited successfully');
    expect(writeMock).toHaveBeenCalledWith([
      {
        path: `${workDirectory}/report.txt`,
        data: new TextEncoder().encode("new 'literal'\nnext\nlast")
      }
    ]);
    expect(editMock).not.toHaveBeenCalled();
  });

  it('批次任一旧内容未命中前不写入任何文件', async () => {
    const result = await dispatchSandboxEditFile(context, {
      entries: [
        { path: 'first.txt', oldContent: 'old', newContent: 'new' },
        { path: 'second.txt', oldContent: 'not present', newContent: 'new' }
      ]
    });
    expect(result.response).toContain('Failed to edit files');
    expect(writeMock).not.toHaveBeenCalled();
    expect(editMock).not.toHaveBeenCalled();
  });

  it('同一文件的多次编辑按顺序作用后仅写一次', async () => {
    await dispatchSandboxEditFile(context, {
      entries: [
        { path: 'report.txt', oldContent: 'old', newContent: 'new' },
        { path: 'report.txt', oldContent: 'new value', newContent: 'final' }
      ]
    });
    expect(writeMock).toHaveBeenCalledOnce();
    expect(writeMock).toHaveBeenCalledWith([
      { path: `${workDirectory}/report.txt`, data: new TextEncoder().encode('final') }
    ]);
  });

  it('执行默认 cwd 是 Skill 工作区，但不限制显式 shell 命令内容', async () => {
    const command = 'printf \'%s\' "$(echo command)"';
    const result = await dispatchSandboxExecute(context, { command, timeoutMs: 30000 });
    expect(result.response).toContain('executed');
    expect(executeMock).toHaveBeenLastCalledWith(command, {
      workingDirectory: workDirectory,
      timeoutMs: 30000
    });
  });

  it('搜索默认目录使用 Skill 根并校验返回结果', async () => {
    searchMock.mockResolvedValue([{ path: `${workDirectory}/report.txt` }]);
    const result = await dispatchSandboxSearch(context, { pattern: '*.txt' });
    expect(result.response).toContain(`${workDirectory}/report.txt`);
    expect(searchMock).toHaveBeenCalledWith('*.txt', workDirectory);
  });

  it('拒绝工作区外搜索结果', async () => {
    searchMock.mockResolvedValue([{ path: '/etc/passwd' }]);
    const result = await dispatchSandboxSearch(context, { pattern: '*' });
    expect(result.response).toContain('Failed to search files');
  });

  it.each(['$(id)', '`id`', 'bad"pattern', 'line\npattern', 'a\\b'])(
    '拒绝 SDK 无法安全处理的搜索表达式 %s',
    async (pattern) => {
      const result = await dispatchSandboxSearch(context, { pattern });
      expect(result.response).toContain('Failed to search files');
      expect(searchMock).not.toHaveBeenCalled();
    }
  );

  it('fetch 根内绝对路径不再重复拼接工作区目录', async () => {
    await dispatchSandboxFetchUserFile(
      context,
      { file_index: '1', target_path: `${workDirectory}/input.csv` },
      availableFiles
    );
    expect(writeMock).toHaveBeenCalledWith([
      { path: `${workDirectory}/input.csv`, data: new TextEncoder().encode('report').buffer }
    ]);
  });

  it('fetch 在网络下载前拒绝符号链接逃逸', async () => {
    executeMock.mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 });
    const result = await dispatchSandboxFetchUserFile(
      context,
      { file_index: '1', target_path: 'link/input.csv' },
      availableFiles
    );
    expect(result.response).toContain('Failed');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('文件源下载离线不等于 Sandbox 离线', async () => {
    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error('download failed'), { code: 'ECONNRESET' })
    );
    const result = await dispatchSandboxFetchUserFile(
      context,
      { file_index: '1', target_path: 'input.csv' },
      availableFiles
    );
    expect(result.response).toContain('Failed to fetch user file');
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('下载后 Sandbox 写入断线仍是致命基础设施故障且不重放', async () => {
    writeMock.mockRejectedValueOnce(
      Object.assign(new Error('write failed'), { code: 'ECONNRESET' })
    );
    await expect(
      dispatchSandboxFetchUserFile(
        context,
        { file_index: '1', target_path: 'input.csv' },
        availableFiles
      )
    ).rejects.toThrow('sandbox_unavailable');
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it('真实临时工作区可写入编辑读取并拒绝外部符号链接', async () => {
    const fixturePath = await mkdtemp(join(await realpath(tmpdir()), 'fastgpt-skill-tools-'));
    const root = join(fixturePath, 'workspace');
    await mkdir(root);
    const realContext = { ...context, workDirectory: root };
    executeMock.mockImplementation(
      (command: string, options: ExecuteOptions) =>
        new Promise((resolve) => {
          execFile(
            '/bin/sh',
            ['-c', command],
            { timeout: 10000, cwd: options?.workingDirectory ?? root },
            (error, stdout, stderr) => {
              resolve({ stdout, stderr, exitCode: error ? 1 : 0 });
            }
          );
        })
    );
    readMock.mockImplementation(async (paths: string[]) =>
      Promise.all(paths.map(async (path) => ({ path, content: await readFile(path), error: null })))
    );
    writeMock.mockImplementation(async (entries: FileWriteEntries) =>
      Promise.all(
        entries.map(async (entry) => {
          if (!(entry.data instanceof Uint8Array))
            throw new Error('Expected bytes for safe provider write');
          await writeFile(entry.path, entry.data);
          return { path: entry.path, bytesWritten: entry.data.byteLength, error: null };
        })
      )
    );
    try {
      const content = "old 'quoted'\nsecond line\nPOLYFILL_EOF\n";
      const write = await dispatchSandboxWriteFile(realContext, { path: 'report.txt', content });
      expect(write.response).toContain('File written successfully');
      expect(await readFile(join(root, 'report.txt'), 'utf8')).toBe(content);
      const edited = await dispatchSandboxEditFile(realContext, {
        entries: [
          {
            path: 'report.txt',
            oldContent: "old 'quoted'\nsecond line",
            newContent: "new 'literal'\nreplacement"
          }
        ]
      });
      expect(edited.response).toContain('Files edited successfully');
      const read = await dispatchSandboxReadFile(realContext, { paths: ['report.txt'] });
      expect(read.response).toContain("new 'literal'\nreplacement\nPOLYFILL_EOF");
      await writeFile(join(fixturePath, 'outside.txt'), 'private marker');
      await symlink(join(fixturePath, 'outside.txt'), join(root, 'outside-link'));
      const rejected = await dispatchSandboxReadFile(realContext, { paths: ['outside-link'] });
      expect(rejected.response).toContain('Failed to read files');
      expect(rejected.response).not.toContain('private marker');
    } finally {
      await rm(fixturePath, { recursive: true, force: true });
    }
  });
});
