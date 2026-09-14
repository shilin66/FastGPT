import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callSandboxTool } from '../../../../core/ai/sandbox/toolCall';
import { SANDBOX_GET_FILE_URL_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/constants';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  readFileStream: vi.fn(),
  uploadChatFile: vi.fn(),
  jwtSignS3ObjectKey: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/controller', () => ({
  getSandboxClient: vi.fn(async () => ({
    provider: {
      rootPath: '/workspace',
      execute: mocks.execute,
      readFileStream: mocks.readFileStream
    }
  }))
}));
vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({ uploadChatFile: mocks.uploadChatFile })
}));
vi.mock('@fastgpt/service/common/s3/utils', () => ({
  jwtSignS3ObjectKey: mocks.jwtSignS3ObjectKey
}));

const callFileTool = (paths: string[]) =>
  callSandboxTool({
    appId: 'app',
    userId: 'user',
    chatId: 'chat',
    toolName: SANDBOX_GET_FILE_URL_TOOL_NAME,
    rawArgs: JSON.stringify({ paths })
  });

describe('Sandbox file URL workspace boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue({
      stdout: 'FASTGPT_WORKSPACE_PATH_OK',
      stderr: '',
      exitCode: 0
    });
    mocks.readFileStream.mockImplementation(async function* () {
      yield Buffer.from('report');
    });
    mocks.uploadChatFile.mockResolvedValue({ key: 'report-key' });
    mocks.jwtSignS3ObjectKey.mockReturnValue('https://files.example.test/report');
  });

  it.each(['../secret', '/etc/passwd', '$(whoami)', '`whoami`', 'a\u0000b'])(
    '不上传非法路径 %s',
    async (path) => {
      const result = await callFileTool([path]);
      expect(result.response).toContain('Get file URL error');
      expect(mocks.readFileStream).not.toHaveBeenCalled();
      expect(mocks.uploadChatFile).not.toHaveBeenCalled();
    }
  );

  it('相对路径通过校验后规范化再上传', async () => {
    const result = await callFileTool(['report.csv']);
    expect(mocks.readFileStream).toHaveBeenCalledWith('/workspace/report.csv');
    expect(JSON.parse(result.response)).toEqual([
      { filename: 'report.csv', fileUrl: 'https://files.example.test/report' }
    ]);
  });

  it('整批路径先校验，避免前半批上传后才发现越界', async () => {
    await callFileTool(['report.csv', '/etc/passwd']);
    expect(mocks.uploadChatFile).not.toHaveBeenCalled();
  });

  it('provider 符号链接校验失败时不上传', async () => {
    mocks.execute.mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 });
    await callFileTool(['/workspace/link']);
    expect(mocks.uploadChatFile).not.toHaveBeenCalled();
  });
});
