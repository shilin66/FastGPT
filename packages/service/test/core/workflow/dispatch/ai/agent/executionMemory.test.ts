import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  dispatchRunAgent,
  type DispatchAgentModuleProps
} from '@fastgpt/service/core/workflow/dispatch/ai/agent';
import { dispatchPiAgent } from '@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent';
import { RuntimeSkillResolutionError } from '@fastgpt/service/core/agentSkills/runtimeResolver';
import type { ChatItemMiniType, ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { DispatchPlanAgentResponse } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/plan';
import type { AssistantMessage, Context, SimpleStreamOptions } from '@mariozechner/pi-ai';
import { getLLMRequestRecord } from '@fastgpt/service/core/ai/record/controller';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { piMessagesToGPT } from '@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent/context';
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
vi.mock('@fastgpt/service/common/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/logger')>()),
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() })
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/utils', () => ({
  getHistories: (history: number | ChatItemMiniType[], histories: ChatItemMiniType[]) =>
    Array.isArray(history) ? history : history ? histories.slice(-history * 2) : [],
  getNodeErrResponse: ({
    error,
    responseData
  }: {
    error: Error;
    responseData?: ChatHistoryItemResType;
  }) => ({
    error: { errorText: error.message },
    responseData: { errorText: error.message, ...responseData }
  })
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
const piResponse = async (
  content: AssistantMessage['content'],
  overrides: Partial<AssistantMessage> = {}
) => {
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
    },
    ...overrides
  };
  const result = createAssistantMessageEventStream();
  result.push({ type: 'start', partial: message });
  for (const item of content)
    if (item.type === 'text')
      result.push({ type: 'text_delta', contentIndex: 0, delta: item.text, partial: message });
  if (message.stopReason === 'error' || message.stopReason === 'aborted') {
    result.push({ type: 'error', reason: message.stopReason, error: message });
  } else {
    result.push({ type: 'done', reason: message.stopReason, message });
  }
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

it('passes native model parameters through the Pi provider payload hook', async () => {
  const input = props();
  input.params.aiChatDefaultConfig = {
    temperature: 0.7,
    max_tokens: 8192,
    chat_template_kwargs: { enable_thinking: false }
  };
  await dispatchPiAgent(input);
  const [model, , options] = mocks.stream.mock.calls[0];
  const payload = { model: 'test', messages: [], tools: [], stream: true, max_tokens: 512 };
  const patched = await (options as SimpleStreamOptions).onPayload?.(payload, model);
  expect(patched).toEqual({
    ...payload,
    temperature: 0.7,
    chat_template_kwargs: { enable_thinking: false }
  });
});

describe('Pi LLM request tracking', () => {
  it.each(['error', 'aborted'] as const)(
    'keeps a single record for a provider %s event',
    async (stopReason) => {
      mocks.stream.mockImplementationOnce(async (model, _context, options: SimpleStreamOptions) => {
        await options.onPayload?.({ model: model.id, messages: [] }, model);
        return piResponse([], { stopReason, errorMessage: 'provider interrupted' });
      });

      const result = await dispatchPiAgent(props());

      const ids = result[DispatchNodeResponseKeyEnum.nodeResponse]?.llmRequestIds ?? [];
      expect(ids).toHaveLength(1);
      const record = await getLLMRequestRecord(ids[0]);
      expect(record?.response).toMatchObject({
        error: 'provider interrupted',
        finish_reason: 'error'
      });
      expect(result.error).toBeDefined();
    }
  );

  it('keeps the request ID when an ask tool pauses the Agent', async () => {
    mocks.stream.mockImplementationOnce(async (model, _context, options: SimpleStreamOptions) => {
      await options.onPayload?.({ model: model.id, messages: [] }, model);
      return piResponse([
        { type: 'toolCall', id: 'ask-1', name: SubAppIds.ask, arguments: { question: 'question' } }
      ]);
    });

    const result = await dispatchPiAgent(props());

    expect(result[DispatchNodeResponseKeyEnum.interactive]).toBeDefined();
    const ids = result[DispatchNodeResponseKeyEnum.nodeResponse]?.llmRequestIds ?? [];
    expect(ids).toHaveLength(1);
    expect((await getLLMRequestRecord(ids[0]))?.response.finish_reason).toBe('tool_calls');
  });

  it('returns request IDs whose stored payload includes the applied model parameters', async () => {
    const input = props();
    input.params.aiChatDefaultConfig = { temperature: 0.7, max_tokens: 256 };
    const payload = {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'task' }],
      stream: true,
      max_tokens: 512
    };
    mocks.stream.mockImplementationOnce(async (model, _context, options: SimpleStreamOptions) => {
      await options.onPayload?.(payload, model);
      payload.messages[0].content = 'mutated after sending';
      return piResponse(
        [
          { type: 'thinking', thinking: 'reasoning' },
          { type: 'text', text: 'done' }
        ],
        {
          usage: {
            input: 20,
            output: 10,
            cacheRead: 5,
            cacheWrite: 2,
            totalTokens: 37,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
          }
        }
      );
    });

    const result = await dispatchPiAgent(input);

    const ids = result[DispatchNodeResponseKeyEnum.nodeResponse]?.llmRequestIds ?? [];
    expect(ids).toHaveLength(1);
    const record = await getLLMRequestRecord(ids[0]);
    expect(record?.body).toEqual({
      ...payload,
      temperature: 0.7,
      max_tokens: 256,
      messages: [{ role: 'user', content: 'task' }]
    });
    expect(record?.response).toMatchObject({
      answerText: 'done',
      reasoningText: 'reasoning',
      finish_reason: 'stop',
      usage: { inputTokens: 27, outputTokens: 10 }
    });
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]).toMatchObject({
      model: 'GPT-4o mini',
      query: 'task',
      inputTokens: 27,
      outputTokens: 10,
      temperature: 0.7,
      maxToken: 256,
      finishReason: 'stop',
      reasoningText: 'reasoning',
      contextTotalLen: 2,
      historyPreview: [
        { obj: ChatRoleEnum.Human, value: 'task' },
        { obj: ChatRoleEnum.AI, value: 'done' }
      ]
    });
  });

  it('records a separate request and response for each tool-call round', async () => {
    const toolCall = {
      type: 'toolCall',
      id: 'call-1',
      name: 'side_effect',
      arguments: {}
    } as const;
    mocks.stream.mockImplementation(
      async (model, context: Context, options: SimpleStreamOptions) => {
        await options.onPayload?.(
          { model: model.id, messages: piMessagesToGPT(context.messages) },
          model
        );
        return piResponse(
          context.messages.some((message) => message.role === 'toolResult')
            ? [{ type: 'text', text: 'done' }]
            : [toolCall],
          {
            usage: {
              input: 10,
              output: 5,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 15,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
            }
          }
        );
      }
    );

    const result = await dispatchPiAgent(props());

    const ids = result[DispatchNodeResponseKeyEnum.nodeResponse]?.llmRequestIds ?? [];
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    const records = await Promise.all(ids.map(getLLMRequestRecord));
    expect(records[0]?.response).toMatchObject({
      finish_reason: 'tool_calls',
      toolCalls: [
        { id: 'call-1', type: 'function', function: { name: 'side_effect', arguments: '{}' } }
      ]
    });
    expect(records[1]?.response).toMatchObject({ answerText: 'done', finish_reason: 'stop' });
    expect(records[0]?.body.messages).toHaveLength(1);
    expect(records[1]?.body.messages).toHaveLength(3);
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]).toMatchObject({
      inputTokens: 20,
      outputTokens: 10,
      finishReason: 'stop',
      contextTotalLen: 4,
      textOutput: 'done'
    });
  });

  it('preserves request details when the provider fails after receiving the payload', async () => {
    mocks.stream.mockImplementationOnce(async (model, _context, options: SimpleStreamOptions) => {
      await options.onPayload?.({ model: model.id, messages: [] }, model);
      throw new Error('provider unavailable');
    });

    const result = await dispatchPiAgent(props());

    expect(result.error).toBeDefined();
    const ids = result[DispatchNodeResponseKeyEnum.nodeResponse]?.llmRequestIds ?? [];
    expect(ids).toHaveLength(1);
    const record = await getLLMRequestRecord(ids[0]);
    expect(record?.response).toMatchObject({
      error: 'provider unavailable',
      finish_reason: 'error'
    });
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]?.finishReason).toBe('error');
  });
});

describe.each(['default', 'pi'] as const)('%s Sandbox session identity', (engine) => {
  const runAgent = engine === 'default' ? dispatchRunAgent : dispatchPiAgent;

  it('awaits Skill discovery before reading capability prompts or calling the model', async () => {
    mocks.env.SHOW_SKILL = true;
    let prepared = false;
    const readPrompt = vi.fn(() => {
      expect(prepared).toBe(true);
      expect(mocks.master).not.toHaveBeenCalled();
      expect(mocks.stream).not.toHaveBeenCalled();
      return 'Discovered workspace Skill';
    });
    const prepare = vi.fn(async () => {
      await Promise.resolve();
      prepared = true;
    });
    mocks.sandbox.mockResolvedValue({
      id: 'sandbox-skills',
      prepare,
      get systemPrompt() {
        return readPrompt();
      }
    });
    const input = props();
    input.params.skills = ['skill-1'];

    await runAgent(input);

    expect(prepare).toHaveBeenCalledOnce();
    expect(readPrompt).toHaveBeenCalled();
    expect(engine === 'default' ? mocks.master : mocks.stream).toHaveBeenCalled();
  });

  it.each(['test', 'debug'] as const)(
    'reuses one %s conversation but isolates a new conversation and node',
    async (mode) => {
      mocks.env.SHOW_SKILL = true;
      mocks.sandbox.mockResolvedValue({});
      const input = props();
      input.mode = mode;
      input.params.skills = ['skill-1'];

      await runAgent(input);
      await runAgent(input);
      await runAgent({ ...input, chatId: 'chat-2' });
      await runAgent({ ...input, node: { ...input.node, nodeId: 'node-2' } });

      const sessions = mocks.sandbox.mock.calls.map(([call]) => call.sessionId);
      expect(sessions[0]).toBe(sessions[1]);
      expect(sessions[0]).not.toBe(sessions[2]);
      expect(sessions[0]).not.toBe(sessions[3]);
      expect(sessions[0]).not.toBe(input.chatId);
      expect(mocks.sandbox).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: input.runningAppInfo.id,
          runtimeUserId: input.uid,
          mode: 'sessionRuntime'
        })
      );
    }
  );

  it('keeps online chat identity unchanged', async () => {
    mocks.env.SHOW_SKILL = true;
    mocks.sandbox.mockResolvedValue({});
    const input = props();
    input.params.skills = ['skill-1'];
    await runAgent(input);
    expect(mocks.sandbox).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: input.chatId, mode: 'sessionRuntime' })
    );
  });

  it('keeps preview workspace across rounds even when the usage record changes', async () => {
    mocks.env.SHOW_SKILL = true;
    mocks.sandbox.mockResolvedValue({});
    const input = props();
    input.mode = 'test';
    input.usageId = 'round-1';
    input.params.skills = ['skill-1'];
    await runAgent(input);
    await runAgent({ ...input, usageId: 'round-2' });
    await runAgent({ ...input, chatId: 'chat-2', usageId: 'round-3' });
    const sessions = mocks.sandbox.mock.calls.map(([call]) => call.sessionId);
    expect(sessions[0]).toBe(sessions[1]);
    expect(sessions[0]).not.toBe(sessions[2]);
  });

  it('does not alias node and chat IDs containing separators', async () => {
    mocks.env.SHOW_SKILL = true;
    mocks.sandbox.mockResolvedValue({});
    const input = props();
    input.mode = 'test';
    input.node.nodeId = 'node';
    input.chatId = 'part-chat';
    input.params.skills = ['skill-1'];
    await runAgent(input);
    await runAgent({
      ...input,
      node: { ...input.node, nodeId: 'node-part' },
      chatId: 'chat'
    });
    const sessions = mocks.sandbox.mock.calls.map(([call]) => call.sessionId);
    expect(sessions[0]).not.toBe(sessions[1]);
  });

  it('preserves explicit Skill Edit workspace routing', async () => {
    mocks.env.SHOW_SKILL = true;
    mocks.sandbox.mockResolvedValue({});
    const input = props();
    input.mode = 'test';
    input.params.skills = ['skill-1'];
    input.params.useEditDebugSandbox = true;
    await runAgent(input);
    expect(mocks.sandbox).toHaveBeenCalledWith(
      expect.objectContaining({ skillIds: ['skill-1'], mode: 'editDebug' })
    );
  });
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

  it.each([undefined, '', '\n\n', ' \t\r\n'])(
    'stops without replaying tools or replanning when a step returns %j',
    async (rawResponse) => {
      const audit: AIChatItemValueItemType = {
        sandboxEvent: { id: 'already-executed', status: 'ready', versionId: 'version-1' }
      };
      mocks.master
        .mockRejectedValue(new Error('Unexpected replay'))
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
          nodeResponse: { id: 'empty-step', finishReason: 'stop' },
          assistantMessages: [
            {
              role: 'assistant',
              content: '\n\n',
              tool_calls: [
                {
                  id: 'side-effect-1',
                  type: 'function',
                  function: { name: 'side_effect', arguments: '{}' }
                }
              ]
            },
            { role: 'tool', tool_call_id: 'side-effect-1', content: 'already executed' }
          ],
          capabilityAssistantResponses: [audit],
          stepResponse: rawResponse === undefined ? undefined : { rawResponse, summary: '' }
        });
      mocks.plan.mockResolvedValue({
        plan: { ...plan, steps: [] },
        completeMessages: [],
        usages: [],
        nodeResponse: {}
      });

      const result = await dispatchRunAgent(props());

      expect(mocks.master).toHaveBeenCalledTimes(2);
      expect(mocks.plan).not.toHaveBeenCalled();
      expect(result.system_memories?.['agentLoopMemory-node-1']).toMatchObject({
        status: 'failed'
      });
      expect(result.nodeResponses).toContainEqual(
        expect.objectContaining({
          id: 'empty-step',
          finishReason: 'error',
          errorText: expect.any(String)
        })
      );
      expect(result.assistantResponses).toContainEqual({ ...audit, stepId: 'step-1' });
      expect(result.assistantResponses?.flatMap((item) => item.tools ?? [])).toContainEqual(
        expect.objectContaining({ id: 'side-effect-1', response: 'already executed' })
      );
    }
  );

  it('does not mark a failed master model response as completed', async () => {
    mocks.master.mockResolvedValueOnce({
      ...masterResult(),
      nodeResponse: { errorText: 'provider failed' }
    });
    const result = await dispatchRunAgent(props());
    expect(result.system_memories?.['agentLoopMemory-node-1']).toMatchObject({ status: 'failed' });
  });

  it.each(['cancelled', 'provider-error'] as const)(
    'preserves step audit and the original outcome when %s',
    async (outcome) => {
      let stopped = false;
      const audit: AIChatItemValueItemType = {
        sandboxEvent: { id: 'executed-before-stop', status: 'ready' }
      };
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
        .mockImplementationOnce(async () => {
          stopped = outcome === 'cancelled';
          return {
            ...masterResult(),
            nodeResponse: {
              id: 'stopped-step',
              ...(outcome === 'provider-error' ? { errorText: 'provider failed' } : {})
            },
            capabilityAssistantResponses: [audit]
          };
        });

      const result = await dispatchRunAgent({ ...props(), checkIsStopping: () => stopped });

      expect(mocks.master).toHaveBeenCalledTimes(2);
      expect(mocks.plan).not.toHaveBeenCalled();
      expect(result.system_memories?.['agentLoopMemory-node-1']).toMatchObject({
        status: 'failed'
      });
      expect(result.assistantResponses).toContainEqual({ ...audit, stepId: 'step-1' });
      expect(result.nodeResponses?.find((item) => item.id === 'stopped-step')?.errorText).toBe(
        outcome === 'provider-error' ? 'provider failed' : undefined
      );
    }
  );

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
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4N8AAAAASUVORK5CYII=';
  const imageFile = {
    type: ChatFileTypeEnum.image,
    name: 'pixel.png',
    url: `data:image/png;base64,${png}`
  };
  const imageContent = { type: 'image', mimeType: 'image/png', data: png };

  it('sends an image-only turn when the workflow omits its text input', async () => {
    const input = props();
    Reflect.deleteProperty(input.params, 'userChatInput');
    input.query = [{ file: imageFile }];
    input.params.aiChatVision = true;

    const result = await dispatchPiAgent(input);

    expect(result.data?.answerText).toBe('done');
    const context: Context = mocks.stream.mock.calls[0][1];
    expect(context.messages).toContainEqual(
      expect.objectContaining({ role: 'user', content: expect.arrayContaining([imageContent]) })
    );
  });

  it('sends both the task and its image when the user supplies text', async () => {
    const input = props();
    input.params.userChatInput = 'Describe this image';
    input.params.aiChatVision = true;
    input.query = [{ file: imageFile }, { text: { content: 'Describe this image' } }];

    await dispatchPiAgent(input);

    const context: Context = mocks.stream.mock.calls[0][1];
    expect(context.messages).toContainEqual(
      expect.objectContaining({
        role: 'user',
        content: expect.arrayContaining([
          { type: 'text', text: 'Describe this image' },
          imageContent
        ])
      })
    );
  });

  it.each([false, true])('retains a prior image-only turn when editDebug=%s', async (editDebug) => {
    const input = props([
      { obj: ChatRoleEnum.Human, value: [{ file: imageFile }] },
      { obj: ChatRoleEnum.AI, value: [{ text: { content: 'A diagram' } }] }
    ]);
    input.params.history = 1;
    input.params.aiChatVision = true;
    input.params.userChatInput = 'What color is it?';
    input.params.useEditDebugSandbox = editDebug;
    if (editDebug) {
      mocks.env.SHOW_SKILL = true;
      mocks.sandbox.mockResolvedValue({});
      const modelId = 'pi-image-history-debug';
      global.llmModelMap.set(modelId, { ...getLLMModel(input.params.model), maxContext: 128000 });
      input.params.model = modelId;
      onTestFinished(() => {
        global.llmModelMap.delete(modelId);
      });
    }

    const result = await dispatchPiAgent(input);

    expect(result).toMatchObject({ data: { answerText: 'done' } });
    const context: Context = mocks.stream.mock.calls[0][1];
    expect(context.messages).toContainEqual(
      expect.objectContaining({ role: 'user', content: expect.arrayContaining([imageContent]) })
    );
  });

  it('passes an uploaded image to the model when resuming an ask tool', async () => {
    mocks.stream.mockImplementationOnce(() =>
      piResponse([
        {
          type: 'toolCall',
          id: 'ask-image',
          name: SubAppIds.ask,
          arguments: { question: 'Image?' }
        }
      ])
    );
    const paused = await dispatchPiAgent(props());
    const input = props([pending(paused.system_memories ?? {})]);
    input.query = [{ file: imageFile }];
    input.params.aiChatVision = true;

    const result = await dispatchPiAgent(input);

    expect(result.data?.answerText).toBe('done');
    const context: Context = mocks.stream.mock.calls[1][1];
    expect(context.messages).toContainEqual(
      expect.objectContaining({ role: 'toolResult', toolCallId: 'ask-image' })
    );
    expect(context.messages).toContainEqual(
      expect.objectContaining({ role: 'user', content: expect.arrayContaining([imageContent]) })
    );
  });

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
