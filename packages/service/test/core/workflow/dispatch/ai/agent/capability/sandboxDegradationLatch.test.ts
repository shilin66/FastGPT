import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { masterCall } from '@fastgpt/service/core/workflow/dispatch/ai/agent/master/call';
import { buildAgentTools } from '@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent/toolAdapter';
import { createSandboxTestContext } from './sandboxTestContext';

const mocks = vi.hoisted(() => ({ shell: vi.fn(), calls: [] as string[] }));
vi.mock('@fastgpt/service/core/ai/model', () => ({ getLLMModel: () => ({ name: 'test' }) }));
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox', () => ({
  dispatchSandboxShell: mocks.shell,
  dispatchSandboxGetFileUrl: mocks.shell
}));
vi.mock('@fastgpt/service/core/ai/llm/agentCall', () => ({
  runAgentCall: async ({
    handleToolResponse
  }: {
    handleToolResponse: (input: {
      call: { id: string; function: { name: string; arguments: string } };
      messages: [];
    }) => Promise<unknown>;
  }) => {
    for (const name of mocks.calls) {
      await handleToolResponse({
        call: { id: name, function: { name, arguments: '{"command":"side_effect"}' } },
        messages: []
      });
    }
    return {
      model: 'test',
      assistantMessages: [],
      completeMessages: [],
      inputTokens: 0,
      outputTokens: 0,
      llmTotalPoints: 0,
      childrenUsages: [],
      requestIds: []
    };
  }
}));

const audit: AIChatItemValueItemType = {
  sandboxEvent: { id: 'failed-call', status: 'degraded', code: 'sandbox_unavailable' }
};
const degraded = () => ({
  response: 'sandbox_unavailable',
  usages: [],
  assistantResponses: [audit]
});
const getSubAppInfo = () => ({ name: 'Sandbox', avatar: '', toolDescription: '' });
const makeMasterParams = (): Parameters<typeof masterCall>[0] => ({
  ...createSandboxTestContext(),
  node: {
    nodeId: 'node',
    name: 'Agent',
    flowNodeType: FlowNodeTypeEnum.agent,
    inputs: [],
    outputs: []
  },
  runtimeNodes: [],
  runtimeEdges: [],
  runtimeNodesMap: new Map(),
  histories: [],
  query: [],
  stream: false,
  params: { model: 'test', systemPrompt: '', userChatInput: 'task' },
  masterMessages: [],
  planMessages: [],
  completionTools: [],
  filesMap: {},
  getSubApp: () => undefined,
  getSubAppInfo
});

describe('Agent-wide Sandbox degradation latch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls = [];
    mocks.shell.mockResolvedValue({ ...degraded(), nodeResponse: {} });
  });

  it.each(['default', 'pi'])(
    '%s stops generic tools after a capability degrades',
    async (engine) => {
      const capability = vi.fn().mockResolvedValue(degraded());
      if (engine === 'default') {
        mocks.calls = ['sandbox_execute', 'sandbox_shell'];
        const result = await masterCall({
          ...makeMasterParams(),
          capabilityToolCallHandler: capability
        });
        expect(result.capabilityAssistantResponses).toEqual([audit]);
      } else {
        const responses: AIChatItemValueItemType[] = [];
        const tools = await buildAgentTools({
          completionTools: ['sandbox_execute', 'sandbox_shell'].map((name) => ({
            type: 'function',
            function: { name }
          })),
          ctx: createSandboxTestContext(),
          filesMap: {},
          getSubApp: () => undefined,
          getSubAppInfo,
          capabilityToolCallHandler: capability,
          nodeResponses: [],
          assistantResponses: responses
        });
        await tools[0].execute('one', { command: 'side_effect' });
        await tools[1].execute('two', { command: 'side_effect' });
        expect(responses).toEqual([audit]);
      }
      expect(mocks.shell).not.toHaveBeenCalled();
      expect(capability).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['default', 'pi'])(
    '%s stops capability tools after generic VM degrades',
    async (engine) => {
      const capability = vi.fn().mockResolvedValue({ response: 'executed' });
      if (engine === 'default') {
        mocks.calls = ['sandbox_shell', 'sandbox_execute'];
        await masterCall({ ...makeMasterParams(), capabilityToolCallHandler: capability });
      } else {
        const tools = await buildAgentTools({
          completionTools: ['sandbox_shell', 'sandbox_execute'].map((name) => ({
            type: 'function',
            function: { name }
          })),
          ctx: createSandboxTestContext(),
          filesMap: {},
          getSubApp: () => undefined,
          getSubAppInfo,
          capabilityToolCallHandler: capability,
          nodeResponses: []
        });
        await tools[0].execute('one', { command: 'side_effect' });
        await tools[1].execute('two', { command: 'side_effect' });
      }
      expect(mocks.shell).toHaveBeenCalledTimes(1);
      expect(capability).not.toHaveBeenCalled();
    }
  );

  it('keeps degradation across default Agent calls but not a new execution', async () => {
    const params = { ...makeMasterParams(), sandboxState: { unavailable: false } };
    mocks.calls = ['sandbox_shell'];
    await masterCall(params);
    const next = await masterCall(params);
    expect(mocks.shell).toHaveBeenCalledTimes(1);
    expect(next.capabilityAssistantResponses).toEqual([]);
    await masterCall(makeMasterParams());
    expect(mocks.shell).toHaveBeenCalledTimes(2);
  });
});
