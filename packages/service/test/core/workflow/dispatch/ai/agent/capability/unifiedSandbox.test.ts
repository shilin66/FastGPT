import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSandboxContext } from '../../../../../../../core/workflow/dispatch/ai/agent/sub/sandbox/types';
import { createSandboxSkillsCapability } from '../../../../../../../core/workflow/dispatch/ai/agent/capability/sandboxSkills';
import {
  SANDBOX_GET_FILE_URL_TOOL_NAME,
  SANDBOX_TOOL_NAME
} from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxToolIds } from '@fastgpt/global/core/workflow/node/agent/skillTools';
import { ConnectionError } from '@fastgpt-sdk/sandbox-adapter';

vi.mock('@fastgpt/service/core/ai/sandbox/operation', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/ai/sandbox/operation')>()),
  runSandboxActivity: async (_scope: unknown, run: () => Promise<unknown>) => run()
}));

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  edit: vi.fn(),
  getClient: vi.fn(),
  upload: vi.fn(),
  runEdit: vi.fn(async ({ execute }: { execute: () => Promise<unknown> }) => execute())
}));
vi.mock('@fastgpt/service/core/agentSkills/runtimeResolver', () => ({
  resolveRuntimeSkills: async () => [],
  RuntimeSkillResolutionError: class extends Error {}
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox', () => ({
  createAgentSandbox: mocks.create,
  connectEditDebugSandbox: mocks.edit,
  releaseAgentSandbox: vi.fn(),
  disconnectEditDebugSandbox: vi.fn()
}));
vi.mock(
  '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/lifecycle',
  async (original) => ({
    ...(await original<
      typeof import('../../../../../../../core/workflow/dispatch/ai/agent/sub/sandbox/lifecycle')
    >()),
    runEditDebugSandboxTool: mocks.runEdit
  })
);
vi.mock('@fastgpt/service/core/ai/sandbox/controller', () => ({
  getSandboxClient: mocks.getClient
}));
vi.mock('@fastgpt/service/core/ai/sandbox/identity', () => ({
  resolveAppSandboxIdentity: async () => ({})
}));
vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({ uploadChatFile: mocks.upload })
}));
vi.mock('@fastgpt/service/common/s3/utils', () => ({
  jwtSignS3ObjectKey: (key: string) => `https://files.example.test/${key}`
}));

describe('Agent sandbox tools share one workspace', () => {
  const params = {
    skillIds: [],
    appId: 'app',
    runtimeUserId: 'visitor',
    teamId: 'team',
    tmbId: 'owner',
    sessionId: JSON.stringify(['test', 'app', 'node', 'chat']),
    sourceChatId: 'chat',
    mode: 'sessionRuntime' as const,
    showSkillReferences: false,
    allFilesMap: {}
  };
  let context: AgentSandboxContext;
  let files: Map<string, Uint8Array>;
  let downloaded: string;
  beforeEach(() => {
    vi.clearAllMocks();
    files = new Map();
    downloaded = '';
    const provider = {
      provider: 'opensandbox',
      rootPath: '/home/sandbox',
      execute: vi.fn(async (command: string, options?: { workingDirectory?: string }) => {
        if (command.includes('FASTGPT_WORKSPACE_PATH_OK'))
          return { stdout: 'FASTGPT_WORKSPACE_PATH_OK', stderr: '', exitCode: 0 };
        const content = files.get(`${options?.workingDirectory}/report.txt`);
        return {
          stdout: content ? new TextDecoder().decode(content) : '',
          stderr: '',
          exitCode: content ? 0 : 1
        };
      }),
      writeFiles: async (entries: { path: string; data: Uint8Array }[]) =>
        entries.map((entry) => {
          files.set(entry.path, entry.data);
          return { path: entry.path, error: null };
        }),
      readFileStream: async function* (path: string) {
        const content = files.get(path);
        if (!content) throw new Error('File not found');
        yield content;
      }
    };
    context = {
      sandbox: provider as unknown as AgentSandboxContext['sandbox'],
      sandboxId: 'logical',
      providerSandboxId: 'provider',
      sessionId: params.sessionId,
      skills: [],
      deployedSkills: [],
      workDirectory: '/workspace',
      isReady: true
    };
    mocks.create.mockResolvedValue(context);
    mocks.edit.mockResolvedValue(context);
    mocks.getClient.mockRejectedValue(new Error('Unexpected second sandbox'));
    mocks.upload.mockImplementation(async ({ body }: { body: AsyncIterable<Uint8Array> }) => {
      for await (const chunk of body) downloaded += new TextDecoder().decode(chunk);
      return { key: 'report' };
    });
  });

  it.each(['chat', 'test', 'debug', 'editDebug'] as const)(
    'writes, executes and downloads in the same %s workspace',
    async (workflowMode) => {
      const mode = workflowMode === 'editDebug' ? 'editDebug' : 'sessionRuntime';
      const sessionId =
        workflowMode === 'chat' ? 'chat' : JSON.stringify([workflowMode, 'app', 'node', 'chat']);
      context.sessionId = sessionId;
      const capability = await createSandboxSkillsCapability({
        ...params,
        mode,
        sessionId,
        skillIds: mode === 'editDebug' ? ['skill'] : []
      });
      const call = (name: string, args: object) =>
        capability.handleToolCall!(name, JSON.stringify(args), name);
      const written = await call(SandboxToolIds.writeFile, {
        path: 'report.txt',
        content: 'shared file'
      });
      expect(written?.assistantResponses).toContainEqual(
        expect.objectContaining({
          sandboxEvent: expect.objectContaining({ status: 'ready', sandboxId: 'logical' })
        })
      );
      const shell = await call(SANDBOX_TOOL_NAME, { command: 'cat report.txt', timeout: 3 });
      expect(shell?.response).toContain('shared file');
      expect(context.sandbox.execute).toHaveBeenCalledWith('cat report.txt', {
        workingDirectory: '/workspace',
        timeoutMs: 3000
      });
      const file = await call(SANDBOX_GET_FILE_URL_TOOL_NAME, { paths: ['report.txt'] });
      expect(file?.response).toContain('https://files.example.test/report');
      expect(downloaded).toBe('shared file');
      expect(mocks.upload).toHaveBeenCalledWith(
        expect.objectContaining({ appId: 'app', chatId: 'chat', uId: 'visitor' })
      );
      expect(mocks.getClient).not.toHaveBeenCalled();
      if (mode === 'sessionRuntime') {
        expect(mocks.create).toHaveBeenCalledTimes(1);
        expect(mocks.create).toHaveBeenCalledWith(
          expect.objectContaining({ sessionId, sourceChatId: 'chat' })
        );
      } else {
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.runEdit).toHaveBeenCalledTimes(3);
      }
    }
  );

  it('does not bypass the Skill editor instruction gate with legacy shell or download tools', async () => {
    context.builtinSkillRoot = '/builtin/creator';
    const capability = await createSandboxSkillsCapability({
      ...params,
      mode: 'editDebug',
      skillIds: ['skill']
    });
    for (const [name, args] of [
      [SANDBOX_TOOL_NAME, { command: 'true' }],
      [SANDBOX_GET_FILE_URL_TOOL_NAME, { paths: ['report.txt'] }]
    ] as const) {
      const result = await capability.handleToolCall!(name, JSON.stringify(args), name);
      expect(result?.response).toContain('Read /builtin/creator/SKILL.md');
    }
    expect(mocks.runEdit).not.toHaveBeenCalled();
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('initializes only once when shell and file tools are the first parallel calls', async () => {
    const capability = await createSandboxSkillsCapability(params);
    await Promise.all([
      capability.handleToolCall!(SANDBOX_TOOL_NAME, '{"command":"true"}', 'shell'),
      capability.handleToolCall!(
        SandboxToolIds.writeFile,
        '{"path":"report.txt","content":"hello"}',
        'write'
      )
    ]);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it('latches infrastructure failure across both tool families without a second sandbox', async () => {
    vi.mocked(context.sandbox.execute).mockRejectedValue(new ConnectionError('transport failed'));
    const capability = await createSandboxSkillsCapability(params);
    const failed = await capability.handleToolCall!(
      SANDBOX_TOOL_NAME,
      '{"command":"true"}',
      'shell'
    );
    expect(failed?.assistantResponses?.[0].sandboxEvent?.status).toBe('degraded');
    const skipped = await capability.handleToolCall!(
      SandboxToolIds.writeFile,
      '{"path":"report.txt","content":"hello"}',
      'write'
    );
    expect(skipped?.response).toContain('sandbox_unavailable');
    expect(files.size).toBe(0);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it('rejects invalid legacy arguments before starting a sandbox', async () => {
    const capability = await createSandboxSkillsCapability(params);
    expect(
      (await capability.handleToolCall!(SANDBOX_TOOL_NAME, '{"command":42}', 'shell'))?.response
    ).toContain('string');
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
