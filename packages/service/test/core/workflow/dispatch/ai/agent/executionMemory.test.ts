import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  dispatchRunAgent,
  type DispatchAgentModuleProps
} from '@fastgpt/service/core/workflow/dispatch/ai/agent';
import { dispatchPiAgent } from '@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent';
import { RuntimeSkillResolutionError } from '@fastgpt/service/core/agentSkills/runtimeResolver';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { DispatchPlanAgentResponse } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/plan';
import type { AssistantMessage, Context } from '@mariozechner/pi-ai';
import {
  buildAgentMemory,
  restoreAgentPlan
} from '@fastgpt/service/core/workflow/dispatch/ai/agent/memory';

const mocks = vi.hoisted(() => ({
  master: vi.fn(),
  plan: vi.fn(),
  stream: vi.fn(),
  tool: vi.fn(),
  agentInputs: [] as unknown[],
  env: { SHOW_SKILL: false, AGENT_ENGINE: 'default' },
  sandbox: vi.fn()
}));
vi.mock('@fastgpt/service/env', () => ({ env: mocks.env }));
vi.mock('@fastgpt/service/core/agentSkills/runtimeResolver', () => ({
  RuntimeSkillResolutionError: class extends Error {
    constructor(
      readonly reason: string,
      readonly assistantResponses: AIChatItemValueItemType[] = []
    ) {
      super('skill_unavailable');
    }
  }
}));
vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  LogCategories: { MODULE: { AI: { AGENT: 'agent' } } }
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/utils', () => ({
  getHistories: (history: number | ChatItemMiniType[], histories: ChatItemMiniType[]) =>
    Array.isArray(history) ? history : history ? histories.slice(-history * 2) : [],
  getNodeErrResponse: ({ error }: { error: Error }) => ({ error: { errorText: error.message } })
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/utils', () => ({
  filterMemoryMessages: (messages: unknown) => messages
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/master/call', () => ({
  masterCall: mocks.master
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/plan', () => ({
  dispatchPlanAgent: mocks.plan
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/plan/prompt', () => ({
  parseUserSystemPrompt: () => 'system',
  getContinuePlanQuery: () => 'continue'
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/file/utils', () => ({
  formatFileInput: async () => ({ filesMap: {}, allFilesMap: {} })
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/utils', () => ({
  getSubapps: async () => ({ completionTools: [], subAppsMap: new Map() })
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/capability/sandboxSkills', () => ({
  createSandboxSkillsCapability: mocks.sandbox
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent/toolAdapter', () => ({
  buildAgentTools: async () => [
    {
      name: 'side_effect',
      label: 'side_effect',
      description: 'Run work',
      parameters: { type: 'object', properties: {} },
      execute: mocks.tool
    }
  ]
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent/modelBridge', async () => {
  const { getModel } = await import('@mariozechner/pi-ai');
  return { buildPiModel: () => getModel('openai', 'gpt-4o-mini'), getModelApiKey: () => 'unused' };
});
vi.mock('@mariozechner/pi-agent-core', async () => {
  const actual = await vi.importActual<typeof import('@mariozechner/pi-agent-core')>(
    '@mariozechner/pi-agent-core'
  );
  return {
    ...actual,
    Agent: class extends actual.Agent {
      constructor(options: ConstructorParameters<typeof actual.Agent>[0]) {
        mocks.agentInputs.push(options?.initialState?.messages);
        super({ ...options, streamFn: mocks.stream });
      }
    }
  };
});

const plan = {
  planId: 'plan-1',
  task: 'task',
  description: 'details',
  steps: [{ id: 'step-1', title: 'Step', description: 'Work' }]
};
const pending = (memories: Record<string, unknown>): ChatItemMiniType => ({
  obj: ChatRoleEnum.AI,
  memories,
  value: [
    {
      interactive: {
        type: 'agentPlanAskQuery',
        params: { content: 'Question?' },
        entryNodeIds: ['node-1'],
        memoryEdges: [],
        nodeOutputs: []
      }
    }
  ]
});
const props = (histories: ChatItemMiniType[] = []): DispatchAgentModuleProps => ({
  node: {
    nodeId: 'node-1',
    inputs: [],
    outputs: [],
    name: 'Agent',
    flowNodeType: FlowNodeTypeEnum.agent
  },
  runtimeNodes: [],
  runtimeEdges: [],
  runtimeNodesMap: new Map(),
  checkIsStopping: () => false,
  histories,
  query: [{ text: { content: 'answer from user' } }],
  params: { model: 'test', systemPrompt: '', userChatInput: 'task', history: 0 },
  runningAppInfo: { id: 'app-1', teamId: 'team-1', tmbId: 'member-1', name: 'App' },
  runningUserInfo: {
    teamId: 'team-1',
    tmbId: 'member-1',
    username: 'user',
    teamName: 'team',
    memberName: 'member',
    contact: ''
  },
  chatConfig: {},
  externalProvider: {},
  usagePush: vi.fn(),
  mode: 'chat',
  chatId: 'chat-1',
  uid: 'user-1',
  timezone: 'UTC',
  variables: {},
  stream: false,
  maxRunTimes: 20,
  workflowDispatchDeep: 1
});
const masterResult = () => ({
  masterMessages: [{ role: 'user', content: 'task' }],
  assistantMessages: [],
  nodeResponse: {}
});
const piResponse = async (content: AssistantMessage['content']) => {
  const { createAssistantMessageEventStream } = await import('@mariozechner/pi-ai');
  const message: AssistantMessage = {
    role: 'assistant',
    content,
    api: 'openai-completions',
    provider: 'openai',
    model: 'gpt-4o-mini',
    stopReason: content.some((item) => item.type === 'toolCall') ? 'toolUse' : 'stop',
    timestamp: 1,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    }
  };
  const result = createAssistantMessageEventStream();
  result.push({ type: 'start', partial: message });
  for (const item of content)
    if (item.type === 'text')
      result.push({ type: 'text_delta', contentIndex: 0, delta: item.text, partial: message });
  result.push({
    type: 'done',
    reason: message.stopReason === 'toolUse' ? 'toolUse' : 'stop',
    message
  });
  result.end();
  return result;
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const mock of [mocks.master, mocks.plan, mocks.stream, mocks.tool, mocks.sandbox])
    mock.mockReset();
  mocks.agentInputs.length = 0;
  mocks.env.SHOW_SKILL = false;
  mocks.env.AGENT_ENGINE = 'default';
  mocks.master.mockResolvedValue(masterResult());
  mocks.tool.mockResolvedValue({ content: [{ type: 'text', text: 'worked' }], details: {} });
  mocks.stream.mockImplementation(() => piResponse([{ type: 'text', text: 'done' }]));
});

it.each(['default', 'pi'] as const)(
  '%s keeps a failed Skill audit event when runtime resolution fails',
  async (engine) => {
    mocks.env.SHOW_SKILL = true;
    mocks.sandbox.mockRejectedValueOnce(new RuntimeSkillResolutionError('inaccessible'));
    const input = props();
    input.params.skills = ['skill-1'];
    const result = await (engine === 'default' ? dispatchRunAgent : dispatchPiAgent)(input);
    expect(result.assistantResponses).toContainEqual({
      sandboxEvent: { id: 'node-1', status: 'failed', code: 'skill_unavailable' }
    });
    expect(result.system_memories?.['agentLoopMemory-node-1']).toMatchObject({
      engine,
      status: 'failed'
    });
  }
);

it.each(['default', 'pi'] as const)(
  '%s preserves child app audit events carried by a fatal Skill error',
  async (engine) => {
    mocks.env.SHOW_SKILL = true;
    const events: AIChatItemValueItemType[] = [
      { sandboxEvent: { id: 'deployed', status: 'ready', versionId: 'version-1' } },
      { sandboxEvent: { id: 'child-node', status: 'failed', code: 'skill_unavailable' } }
    ];
    mocks.sandbox.mockRejectedValueOnce(new RuntimeSkillResolutionError('inaccessible', events));
    const input = props();
    input.params.skills = ['skill-1'];
    const result = await (engine === 'default' ? dispatchRunAgent : dispatchPiAgent)(input);
    expect(result.assistantResponses).toEqual(expect.arrayContaining(events));
  }
);

describe('default Agent execution memory', () => {
  it('writes a paused envelope on ask, resumes it with history=0, and clears it on completion', async () => {
    const askPlan: Partial<DispatchPlanAgentResponse> = {
      completeMessages: [{ role: 'user', content: 'plan task' }],
      planBuffer: { planId: 'plan-1', task: 'task', description: 'details' },
      askInteractive: { type: 'agentPlanAskQuery', params: { content: 'Question?' } },
      usages: [],
      nodeResponse: {
        nodeId: 'plan-node',
        id: 'plan-node',
        moduleType: FlowNodeTypeEnum.emptyNode,
        moduleName: 'Plan'
      }
    };
    mocks.master.mockResolvedValueOnce({ ...masterResult(), planResponse: askPlan });
    const paused = await dispatchRunAgent(props());
    expect(paused.system_memories?.['agentLoopMemory-node-1']).toMatchObject({
      schemaVersion: 1,
      engine: 'default',
      status: 'paused'
    });
    expect(paused.system_memories?.['agentPlan-node-1']).toBeUndefined();
    const ai = pending(paused.system_memories ?? {});
    mocks.plan.mockResolvedValueOnce({ completeMessages: [], usages: [], nodeResponse: {} });
    const input = props([{ obj: ChatRoleEnum.Human, value: [{ text: { content: 'task' } }] }, ai]);
    input.lastInteractive = ai.obj === ChatRoleEnum.AI ? ai.value[0].interactive : undefined;
    const completed = await dispatchRunAgent(input);
    expect(mocks.plan).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'interactive',
        queryInput: 'answer from user',
        planMessages: askPlan.completeMessages
      })
    );
    expect(completed.system_memories?.['agentLoopMemory-node-1']).toEqual({
      schemaVersion: 1,
      engine: 'default',
      status: 'completed'
    });
  });

  it('persists Plan creation, step progress and a terminal event in chat values', async () => {
    mocks.master
      .mockResolvedValueOnce({
        ...masterResult(),
        planResponse: {
          plan: structuredClone(plan),
          completeMessages: [],
          usages: [],
          nodeResponse: {}
        }
      })
      .mockResolvedValueOnce({
        ...masterResult(),
        stepResponse: { rawResponse: 'worked', summary: 'summary' }
      });
    mocks.plan.mockResolvedValueOnce({
      plan: { ...plan, steps: [] },
      completeMessages: [],
      usages: [],
      nodeResponse: {}
    });
    const result = await dispatchRunAgent(props());
    const events = result.assistantResponses?.flatMap((item) =>
      item.planEvent ? [item.planEvent] : []
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'create' }),
        expect.objectContaining({
          type: 'update',
          plan: expect.objectContaining({
            steps: [expect.objectContaining({ response: 'worked' })]
          })
        }),
        { nodeId: 'node-1', type: 'completed', plan: null }
      ])
    );
    expect(
      restoreAgentPlan({
        histories: [{ obj: ChatRoleEnum.AI, value: result.assistantResponses ?? [] }],
        nodeId: 'node-1'
      })
    ).toBeUndefined();
    const states = mocks.master.mock.calls.map(([input]) => input.sandboxState);
    expect(states.length).toBeGreaterThan(1);
    expect(states[0]).toEqual({ unavailable: false });
    expect(states.every((state) => state === states[0])).toBe(true);
  });

  it('terminates old state and old plans when a run fails', async () => {
    mocks.master.mockRejectedValueOnce(new Error('failure'));
    const result = await dispatchRunAgent(props());
    expect(result.system_memories?.['agentLoopMemory-node-1']).toEqual({
      schemaVersion: 1,
      engine: 'default',
      status: 'failed'
    });
    expect(result.assistantResponses).toContainEqual({
      planEvent: { nodeId: 'node-1', type: 'completed', plan: null }
    });
  });

  it('does not mark a failed master model response as completed', async () => {
    mocks.master.mockResolvedValueOnce({
      ...masterResult(),
      nodeResponse: { errorText: 'provider failed' }
    });
    const result = await dispatchRunAgent(props());
    expect(result.system_memories?.['agentLoopMemory-node-1']).toMatchObject({ status: 'failed' });
  });

  it('preserves completed steps and pauses when the continuation planner requests clarification', async () => {
    mocks.master
      .mockResolvedValueOnce({
        ...masterResult(),
        planResponse: {
          plan: structuredClone(plan),
          completeMessages: [],
          usages: [],
          nodeResponse: {}
        }
      })
      .mockResolvedValueOnce({
        ...masterResult(),
        stepResponse: { rawResponse: 'worked', summary: 'summary' }
      });
    mocks.plan.mockResolvedValueOnce({
      completeMessages: [{ role: 'user', content: 'continue' }],
      usages: [],
      nodeResponse: {},
      planBuffer: { planId: 'plan-1', task: 'task', description: 'details' },
      askInteractive: { type: 'agentPlanAskQuery', params: { content: 'Continue?' } }
    });
    const result = await dispatchRunAgent(props());
    expect(result.INTERACTIVE).toMatchObject({ params: { content: 'Continue?' } });
    expect(result.system_memories?.['agentLoopMemory-node-1']).toMatchObject({ status: 'paused' });
    expect(
      restoreAgentPlan({
        histories: [{ obj: ChatRoleEnum.AI, value: result.assistantResponses ?? [] }],
        nodeId: 'node-1'
      })?.steps[0].response
    ).toBe('worked');
  });

  it.each(['default', 'pi'] as const)(
    'keeps the resolved Skill versions through %s ask resume and discards them after completion',
    async (engine) => {
      mocks.env.SHOW_SKILL = true;
      mocks.sandbox.mockImplementation(
        async ({
          onResolvedVersionIds
        }: {
          onResolvedVersionIds?: (versions: Record<string, string>) => void;
        }) => {
          onResolvedVersionIds?.({ 'skill-1': 'version-1' });
          return {};
        }
      );
      const input = props();
      input.params.skills = ['skill-1'];
      mocks.master.mockResolvedValueOnce({
        ...masterResult(),
        planResponse: {
          planBuffer: { planId: 'plan-1', task: 'task', description: 'details' },
          completeMessages: [{ role: 'user', content: 'planning' }],
          askInteractive: { type: 'agentPlanAskQuery', params: { content: 'Question?' } },
          usages: [],
          nodeResponse: {}
        }
      });
      const runAgent = engine === 'default' ? dispatchRunAgent : dispatchPiAgent;
      if (engine === 'pi')
        mocks.stream.mockImplementationOnce(() =>
          piResponse([
            {
              type: 'toolCall',
              id: 'ask-1',
              name: SubAppIds.ask,
              arguments: { question: 'Question?' }
            }
          ])
        );
      const paused = await runAgent(input);
      expect(paused.system_memories?.['agentLoopMemory-node-1']).toMatchObject({
        providerState: { sandboxSkillVersions: { 'skill-1': 'version-1' } }
      });
      const ai = pending(paused.system_memories ?? {});
      const resumedInput = props([ai]);
      resumedInput.params.skills = ['skill-1'];
      resumedInput.lastInteractive =
        ai.obj === ChatRoleEnum.AI ? ai.value[0].interactive : undefined;
      mocks.plan.mockResolvedValueOnce({ completeMessages: [], usages: [], nodeResponse: {} });
      const result = await runAgent(resumedInput);
      expect(mocks.sandbox).toHaveBeenLastCalledWith(
        expect.objectContaining({ expectedVersionIds: { 'skill-1': 'version-1' } })
      );
      expect(result.system_memories?.['agentLoopMemory-node-1']).not.toHaveProperty(
        'providerState'
      );
    }
  );
});

describe('Pi execution memory with the installed SDK', () => {
  it('pauses on a real ask tool, avoids another model call, resumes with its answer and clears state', async () => {
    mocks.stream.mockImplementationOnce(() =>
      piResponse([
        { type: 'toolCall', id: 'ask-1', name: SubAppIds.ask, arguments: { question: 'Question?' } }
      ])
    );
    const paused = await dispatchPiAgent(props());
    expect(paused.INTERACTIVE).toMatchObject({
      type: 'agentPlanAskQuery',
      params: { content: 'Question?' }
    });
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(paused.system_memories?.['agentLoopMemory-node-1']).toMatchObject({
      engine: 'pi',
      status: 'paused',
      providerState: { pendingToolCallId: 'ask-1' }
    });
    const completed = await dispatchPiAgent(props([pending(paused.system_memories ?? {})]));
    expect(mocks.stream).toHaveBeenCalledTimes(2);
    const context: Context = mocks.stream.mock.calls[1][1];
    expect(context.messages).toContainEqual(
      expect.objectContaining({
        role: 'toolResult',
        toolCallId: 'ask-1',
        isError: false,
        content: [{ type: 'text', text: 'answer from user' }]
      })
    );
    expect(completed.data?.answerText).toBe('done');
    expect(completed.system_memories?.['agentLoopMemory-node-1']).toEqual({
      schemaVersion: 1,
      engine: 'pi',
      status: 'completed'
    });
    expect(completed.system_memories?.['piMessages-node-1']).toBeUndefined();
  });

  it('uses selected chat history on ordinary turns and ignores stale legacy Pi messages', async () => {
    const input = props([
      { obj: ChatRoleEnum.Human, value: [{ text: { content: 'prior task' } }] },
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'prior answer' } }],
        memories: { 'piMessages-node-1': [{ role: 'user', content: 'stale', timestamp: 1 }] }
      }
    ]);
    input.params.history = 1;
    await dispatchPiAgent(input);
    const context: Context = mocks.stream.mock.calls[0][1];
    expect(context.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'prior task' }),
        expect.objectContaining({
          role: 'assistant',
          content: [{ type: 'text', text: 'prior answer' }]
        })
      ])
    );
    expect(JSON.stringify(context.messages)).not.toContain('stale');
  });

  it('writes failed memory on provider failure', async () => {
    mocks.stream.mockRejectedValueOnce(new Error('provider unavailable'));
    const result = await dispatchPiAgent(
      props([pending(buildAgentMemory({ nodeId: 'node-1', engine: 'pi', status: 'completed' }))])
    );
    expect(result.system_memories?.['agentLoopMemory-node-1']).toEqual({
      schemaVersion: 1,
      engine: 'pi',
      status: 'failed'
    });
  });

  it('blocks later tools in the same model turn after ask, and can pause a second time', async () => {
    mocks.stream.mockImplementationOnce(() =>
      piResponse([
        {
          type: 'toolCall',
          id: 'ask-1',
          name: SubAppIds.ask,
          arguments: { question: 'First question?' }
        },
        { type: 'toolCall', id: 'work-1', name: 'side_effect', arguments: {} }
      ])
    );
    const first = await dispatchPiAgent(props());
    expect(first.INTERACTIVE).toMatchObject({ params: { content: 'First question?' } });
    expect(mocks.tool).not.toHaveBeenCalled();
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    mocks.stream.mockImplementationOnce(() =>
      piResponse([
        {
          type: 'toolCall',
          id: 'ask-2',
          name: SubAppIds.ask,
          arguments: {
            question: 'More details?',
            form: [{ type: 'input', label: 'Detail' }]
          }
        }
      ])
    );
    const second = await dispatchPiAgent(props([pending(first.system_memories ?? {})]));
    expect(second.INTERACTIVE).toMatchObject({
      type: 'agentPlanAskUserForm',
      params: { description: 'More details?' }
    });
    expect(second.system_memories?.['agentLoopMemory-node-1']).toMatchObject({
      providerState: { pendingToolCallId: 'ask-2' }
    });
    expect(mocks.stream).toHaveBeenCalledTimes(2);
  });
});
