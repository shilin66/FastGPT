import { buildDebugRuntimeNodes } from '@/pages/api/core/agentSkills/debugChat';
import * as debugChatApi from '@/pages/api/core/agentSkills/debugChat';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/agentSkills/constants';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import * as responseModule from '@fastgpt/service/common/response';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { SandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { assertSkillWorkspaceTerminalIdle } from '@fastgpt/service/core/ai/sandbox/terminal';
import { SkillDebugChatBodySchema } from '@fastgpt/global/openapi/core/agentSkills/api';

vi.mock('@fastgpt/service/core/ai/sandbox/terminal', () => ({
  assertSkillWorkspaceTerminalIdle: vi.fn(async () => {})
}));

vi.mock('@fastgpt/service/core/ai/sandbox/lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/lease')>()),
  withSandboxLease: async (key: string, run: (lease: SandboxLease) => Promise<unknown>) =>
    run({ token: key, isActive: () => true, assertOwned: async () => {}, setHeartbeat: () => {} })
}));
vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  dispatchWorkFlow: vi.fn(async () => ({
    flowResponses: [],
    assistantResponses: [{ text: { content: 'debug answer' } }],
    system_memories: {},
    durationSeconds: 1,
    customFeedbacks: []
  }))
}));

// ── Constants mirrored from the implementation ──
const START_NODE_ID = 'skill-debug-start';
const AGENT_NODE_ID = 'skill-debug-agent';

// ═══════════════════════════════════════════════
// describe: buildDebugRuntimeNodes
// ═══════════════════════════════════════════════
describe('buildDebugRuntimeNodes', () => {
  const SKILL_ID = '507f1f77bcf86cd799439011';
  const MODEL = 'gpt-4o';
  const SYSTEM_PROMPT = 'You are a helpful assistant.';

  it('validates and forwards model parameters without changing workspace controls', () => {
    const aiChatDefaultConfig = {
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 2048,
      chat_template_kwargs: { enable_thinking: false }
    };
    const body = SkillDebugChatBodySchema.parse({
      skillId: SKILL_ID,
      chatId: 'chat',
      responseChatItemId: 'response',
      messages: [{ role: 'user', content: 'hi' }],
      aiChatDefaultConfig
    });
    expect(body).toHaveProperty('aiChatDefaultConfig', aiChatDefaultConfig);
    const { runtimeNodes } = buildDebugRuntimeNodes(
      SKILL_ID,
      MODEL,
      SYSTEM_PROMPT,
      aiChatDefaultConfig
    );
    expect(
      runtimeNodes[1].inputs.find((input) => input.key === NodeInputKeyEnum.aiChatDefaultConfig)
        ?.value
    ).toEqual(aiChatDefaultConfig);
  });

  it.each([
    [],
    null,
    { model: 'other' },
    { messages: [] },
    { tools: [] },
    { stream: false },
    { temperature: 20 },
    { max_tokens: -1 },
    { top_p: 2 },
    { extra: 'x'.repeat(17000) }
  ])('rejects invalid or protected model parameters: %j', (aiChatDefaultConfig) => {
    expect(
      SkillDebugChatBodySchema.safeParse({
        skillId: SKILL_ID,
        chatId: 'chat',
        responseChatItemId: 'response',
        messages: [{ role: 'user', content: 'hi' }],
        aiChatDefaultConfig
      }).success
    ).toBe(false);
  });

  it('should return exactly two nodes and one edge', () => {
    const { runtimeNodes, runtimeEdges } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
    expect(runtimeNodes).toHaveLength(2);
    expect(runtimeEdges).toHaveLength(1);
  });

  // ── Start node ──────────────────────────────
  describe('start node (workflowStart)', () => {
    it('should be the first node with correct type and isEntry=true', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const startNode = runtimeNodes[0];

      expect(startNode.nodeId).toBe(START_NODE_ID);
      expect(startNode.flowNodeType).toBe(FlowNodeTypeEnum.workflowStart);
      expect(startNode.isEntry).toBe(true);
      expect(startNode.showStatus).toBe(false);
    });

    it('should have exactly one userChatInput input with empty default value', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const startNode = runtimeNodes[0];

      expect(startNode.inputs).toHaveLength(1);
      const input = startNode.inputs[0];
      expect(input.key).toBe(NodeInputKeyEnum.userChatInput);
      expect(input.valueType).toBe(WorkflowIOValueTypeEnum.string);
      expect(input.required).toBe(true);
      expect(input.value).toBe('');
    });

    it('should expose static userChatInput and userFiles outputs', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const startNode = runtimeNodes[0];

      expect(startNode.outputs).toHaveLength(2);
      expect(
        startNode.outputs.find((output) => output.key === NodeOutputKeyEnum.userChatInput)
      ).toMatchObject({
        id: NodeOutputKeyEnum.userChatInput,
        type: FlowNodeOutputTypeEnum.static,
        valueType: WorkflowIOValueTypeEnum.string
      });
      expect(
        startNode.outputs.find((output) => output.key === NodeOutputKeyEnum.userFiles)
      ).toMatchObject({
        id: NodeOutputKeyEnum.userFiles,
        type: FlowNodeOutputTypeEnum.static,
        valueType: WorkflowIOValueTypeEnum.arrayString
      });
      expect(
        runtimeNodes[1].inputs.find((input) => input.key === NodeInputKeyEnum.fileUrlList)?.value
      ).toEqual([START_NODE_ID, NodeOutputKeyEnum.userFiles]);
    });
  });

  // ── Agent node ──────────────────────────────
  describe('agent node', () => {
    it('should have correct type and isEntry=false with showStatus=true', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      expect(agentNode.nodeId).toBe(AGENT_NODE_ID);
      expect(agentNode.flowNodeType).toBe(FlowNodeTypeEnum.agent);
      expect(agentNode.isEntry).toBe(false);
      expect(agentNode.showStatus).toBe(true);
    });

    it('userChatInput input should reference start node output', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      const userInput = agentNode.inputs.find((i) => i.key === NodeInputKeyEnum.userChatInput);
      expect(userInput).toBeDefined();
      // Reference format: [nodeId, outputKey]
      expect(userInput!.value).toEqual([START_NODE_ID, NodeOutputKeyEnum.userChatInput]);
      expect(userInput!.renderTypeList).toContain(FlowNodeInputTypeEnum.reference);
    });

    it('history input should be a number with value 20', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      const historyInput = agentNode.inputs.find((i) => i.key === NodeInputKeyEnum.history);
      expect(historyInput).toBeDefined();
      expect(historyInput!.value).toBe(20);
      expect(historyInput!.valueType).toBe(WorkflowIOValueTypeEnum.chatHistory);
      expect(historyInput!.min).toBe(0);
      expect(historyInput!.max).toBe(50);
    });

    it('aiModel input should carry the provided model value', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      const modelInput = agentNode.inputs.find((i) => i.key === NodeInputKeyEnum.aiModel);
      expect(modelInput).toBeDefined();
      expect(modelInput!.value).toBe(MODEL);
      expect(modelInput!.valueType).toBe(WorkflowIOValueTypeEnum.string);
      expect(modelInput!.required).toBe(true);
    });

    it('aiSystemPrompt input should carry the provided system prompt', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      const promptInput = agentNode.inputs.find((i) => i.key === NodeInputKeyEnum.aiSystemPrompt);
      expect(promptInput).toBeDefined();
      expect(promptInput!.value).toBe(SYSTEM_PROMPT);
      expect(promptInput!.valueType).toBe(WorkflowIOValueTypeEnum.string);
    });

    it('skills input should contain exactly the given skillId', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      const skillsInput = agentNode.inputs.find((i) => i.key === NodeInputKeyEnum.skills);
      expect(skillsInput).toBeDefined();
      expect(skillsInput!.value).toEqual([SKILL_ID]);
      expect(skillsInput!.valueType).toBe(WorkflowIOValueTypeEnum.arrayString);
      expect(skillsInput!.renderTypeList).toContain(FlowNodeInputTypeEnum.hidden);
    });

    it('useEditDebugSandbox input must be true', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      const sandboxInput = agentNode.inputs.find(
        (i) => i.key === NodeInputKeyEnum.useEditDebugSandbox
      );
      expect(sandboxInput).toBeDefined();
      expect(sandboxInput!.value).toBe(true);
      expect(sandboxInput!.valueType).toBe(WorkflowIOValueTypeEnum.boolean);
      expect(sandboxInput!.renderTypeList).toContain(FlowNodeInputTypeEnum.hidden);
    });

    it('should have an answerText output with static type', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      expect(agentNode.outputs).toHaveLength(1);
      const output = agentNode.outputs[0];
      expect(output.key).toBe(NodeOutputKeyEnum.answerText);
      expect(output.id).toBe(NodeOutputKeyEnum.answerText);
      expect(output.type).toBe(FlowNodeOutputTypeEnum.static);
      expect(output.valueType).toBe(WorkflowIOValueTypeEnum.string);
    });
  });

  // ── Edge ────────────────────────────────────
  describe('edge (start -> agent)', () => {
    it('should connect start to agent with waiting status', () => {
      const { runtimeEdges } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const edge = runtimeEdges[0];

      expect(edge.source).toBe(START_NODE_ID);
      expect(edge.target).toBe(AGENT_NODE_ID);
      expect(edge.status).toBe('waiting');
    });

    it('should use correct handle IDs', () => {
      const { runtimeEdges } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const edge = runtimeEdges[0];

      expect(edge.sourceHandle).toBe(getHandleId(START_NODE_ID, 'source', 'right'));
      expect(edge.targetHandle).toBe(getHandleId(AGENT_NODE_ID, 'target', 'left'));
    });
  });

  // ── Dynamic input injection ─────────────────
  describe('dynamic value injection', () => {
    it('should inject different skillIds correctly', () => {
      const anotherSkillId = '507f1f77bcf86cd799439022';
      const { runtimeNodes } = buildDebugRuntimeNodes(anotherSkillId, MODEL, SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      const skillsInput = agentNode.inputs.find((i) => i.key === NodeInputKeyEnum.skills);
      expect(skillsInput!.value).toEqual([anotherSkillId]);
    });

    it('should inject different models correctly', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, 'claude-3-5-sonnet', SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      const modelInput = agentNode.inputs.find((i) => i.key === NodeInputKeyEnum.aiModel);
      expect(modelInput!.value).toBe('claude-3-5-sonnet');
    });

    it('should inject empty system prompt without error', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, '');
      const agentNode = runtimeNodes[1];

      const promptInput = agentNode.inputs.find((i) => i.key === NodeInputKeyEnum.aiSystemPrompt);
      expect(promptInput!.value).toBe('');
    });
  });
});

// ═══════════════════════════════════════════════
// describe: debugChat API handler — parameter validation
// ═══════════════════════════════════════════════
describe('debugChat handler — parameter validation', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let skillId: string;

  // Error written via sseErrRes can be checked through the vi.mocked spy
  const getSseErrResMock = () => vi.mocked(responseModule.sseErrRes);

  beforeEach(async () => {
    testUser = await getUser(`debug-chat-user-${getNanoid(6)}`);
    vi.clearAllMocks();

    const skill = await MongoAgentSkills.create({
      name: 'Test Debug Skill',
      source: AgentSkillSourceEnum.personal,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });
    skillId = String(skill._id);
  });

  it('rejects missing skillId before starting SSE', async () => {
    const result = await Call(debugChatApi.default, {
      auth: testUser,
      body: {
        chatId: getNanoid(),
        responseChatItemId: getNanoid(),
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hello' }]
      }
    });
    expect(result.code).not.toBe(200);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ['skillId'] })])
    );
    expect(getSseErrResMock()).not.toHaveBeenCalled();
  });

  it('rejects missing chatId before starting SSE', async () => {
    const result = await Call(debugChatApi.default, {
      auth: testUser,
      body: {
        skillId,
        responseChatItemId: getNanoid(),
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hello' }]
      }
    });
    expect(result.code).not.toBe(200);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ['chatId'] })])
    );
    expect(getSseErrResMock()).not.toHaveBeenCalled();
  });

  it('rejects empty messages before starting SSE', async () => {
    const result = await Call(debugChatApi.default, {
      auth: testUser,
      body: {
        skillId,
        chatId: getNanoid(),
        responseChatItemId: getNanoid(),
        model: 'gpt-4o',
        messages: []
      }
    });
    expect(result.code).not.toBe(200);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ['messages'] })])
    );
    expect(getSseErrResMock()).not.toHaveBeenCalled();
  });

  it('should call sseErrRes when edit-debug sandbox does not exist', async () => {
    await Call(debugChatApi.default, {
      auth: testUser,
      body: {
        skillId,
        chatId: getNanoid(),
        responseChatItemId: getNanoid(),
        model: 'gpt-5',
        aiChatDefaultConfig: { temperature: 0.7 },
        messages: [{ role: 'user', content: 'hi' }]
      }
    });
    expect(getSseErrResMock()).toHaveBeenCalled();
    const err = getSseErrResMock().mock.calls[0][1];
    expect(err?.message ?? err).toMatch(/sandbox/i);
  });

  it.each([false, true])('checks Terminal activity before dispatch (busy=%s)', async (busy) => {
    if (busy)
      vi.mocked(assertSkillWorkspaceTerminalIdle).mockRejectedValueOnce(
        new Error('workspace_terminal_busy')
      );
    // Create sandbox instance
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: getNanoid(),
      appId: skillId,
      chatId: 'edit-debug',
      userId: testUser.tmbId,
      status: 'running',
      metadata: {
        sandboxType: 'edit-debug',
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        skillId,
        provider: 'opensandbox',
        image: { repository: 'test-image', tag: 'latest' },
        providerCreatedAt: new Date()
      }
    });

    await Call(debugChatApi.default, {
      auth: testUser,
      headers: {},
      cookies: {},
      body: {
        skillId,
        chatId: getNanoid(),
        responseChatItemId: getNanoid(),
        model: 'gpt-5',
        aiChatDefaultConfig: { temperature: 0.7 },
        messages: [{ role: 'user', content: 'hi' }]
      }
    });

    expect(assertSkillWorkspaceTerminalIdle).toHaveBeenCalledOnce();
    if (busy) {
      expect(getSseErrResMock().mock.calls[0][1]).toMatchObject({
        message: 'workspace_terminal_busy'
      });
      expect(dispatchWorkFlow).not.toHaveBeenCalled();
    } else {
      expect(getSseErrResMock()).not.toHaveBeenCalled();
      expect(dispatchWorkFlow).toHaveBeenCalledOnce();
      expect(vi.mocked(dispatchWorkFlow).mock.calls[0][0].runtimeNodes[1].inputs).toContainEqual(
        expect.objectContaining({
          key: NodeInputKeyEnum.aiChatDefaultConfig,
          value: { temperature: 0.7 }
        })
      );
    }
  });
});
