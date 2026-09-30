import { beforeEach, describe, expect, it, vi } from 'vitest';
import { masterCall } from '../../../../../../../core/workflow/dispatch/ai/agent/master/call';
import { SandboxUnavailableError } from '../../../../../../../core/workflow/dispatch/ai/agent/sub/sandbox/errors';
import { runAgentCall } from '@fastgpt/service/core/ai/llm/agentCall';

vi.mock('@fastgpt/service/core/ai/llm/agentCall', () => ({
  runAgentCall: vi.fn(
    async ({
      handleToolResponse
    }: {
      handleToolResponse: (input: {
        call: { id: string; function: { name: string; arguments: string } };
        messages: [];
      }) => Promise<unknown>;
    }) =>
      handleToolResponse({
        call: { id: 'call', function: { name: 'sandbox_execute', arguments: '{}' } },
        messages: []
      })
  )
}));

describe('Default Agent fatal tool boundary', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(['sandbox_shell', 'sandbox_get_file_url'])(
    'routes %s through the shared capability before legacy dispatch',
    async (toolId) => {
      const args = toolId === 'sandbox_shell' ? { command: 'pwd' } : { paths: ['report.txt'] };
      vi.mocked(runAgentCall).mockImplementationOnce(async ({ handleToolResponse }) => {
        const result = await handleToolResponse!({
          call: {
            id: 'shared-call',
            type: 'function',
            function: { name: toolId, arguments: JSON.stringify(args) }
          },
          messages: []
        });
        expect(result.response).toBe('shared workspace');
        throw new Error('routing verified');
      });
      const capabilityToolCallHandler = vi.fn(async () => ({
        response: 'shared workspace',
        usages: []
      }));
      const params = {
        params: { model: 'test' },
        masterMessages: [],
        planMessages: [],
        completionTools: [],
        filesMap: {},
        runningAppInfo: { id: 'app' },
        runningUserInfo: {},
        externalProvider: {},
        checkIsStopping: () => false,
        usagePush: vi.fn(),
        getSubAppInfo: () => ({ name: 'Sandbox', avatar: '', toolDescription: '' }),
        capabilityToolCallHandler
      } as unknown as Parameters<typeof masterCall>[0];
      await expect(masterCall(params)).rejects.toThrow('routing verified');
      expect(capabilityToolCallHandler).toHaveBeenCalledWith(
        toolId,
        JSON.stringify(args),
        'shared-call'
      );
    }
  );

  it('propagates Sandbox failures out of the model tool loop with the original audit', async () => {
    const failure = new SandboxUnavailableError([
      { sandboxEvent: { id: 'call', status: 'failed', code: 'sandbox_unavailable' } }
    ]);
    const params = {
      params: { model: 'test', aiChatDefaultConfig: { temperature: 0.7 } },
      masterMessages: [],
      planMessages: [],
      completionTools: [],
      filesMap: {},
      runningAppInfo: {},
      runningUserInfo: {},
      externalProvider: {},
      checkIsStopping: () => false,
      usagePush: vi.fn(),
      capabilityToolCallHandler: async () => {
        throw failure;
      }
    } as unknown as Parameters<typeof masterCall>[0];
    await expect(masterCall(params)).rejects.toBe(failure);
    expect(failure.assistantResponses).toHaveLength(1);
    expect(vi.mocked(runAgentCall).mock.calls[0][0].body).toMatchObject({
      extraBody: { temperature: 0.7 }
    });
  });
});
