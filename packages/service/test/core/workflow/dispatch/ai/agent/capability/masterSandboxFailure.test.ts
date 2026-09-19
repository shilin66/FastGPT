import { describe, expect, it, vi } from 'vitest';
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
