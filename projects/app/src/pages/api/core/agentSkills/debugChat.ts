import type { NextApiRequest, NextApiResponse } from 'next';
import { sseErrRes } from '@fastgpt/service/common/response';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';
import { getChatTitleFromChatMessage, removeEmptyUserInput } from '@fastgpt/global/core/chat/utils';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  getSkillChatScope,
  assertSkillChatSession,
  loadSkillDebugHistories,
  claimSkillDebugResume
} from '@fastgpt/service/core/agentSkills/chat';
import { NextAPI } from '@/service/middleware/entry';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import {
  getLastInteractiveValue,
  textAdaptGptResponse
} from '@fastgpt/global/core/workflow/runtime/utils';
import { getWorkflowResponseWrite } from '@fastgpt/service/core/workflow/dispatch/utils';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { ChatRoleEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { pushChatRecords, updateInteractiveChat } from '@fastgpt/service/core/chat/saveChat';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { LimitTypeEnum, teamFrequencyLimit } from '@fastgpt/service/common/api/frequencyLimit';
import { getIpFromRequest } from '@fastgpt/service/common/geo';
import { UserError } from '@fastgpt/global/common/error/utils';
import { SkillDebugChatBodySchema } from '@fastgpt/global/openapi/core/agentSkills/api';
import { getDefaultLLMModel } from '@fastgpt/service/core/ai/model';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { resolveEditWorkspace } from '@fastgpt/service/core/agentSkills/editWorkspace/entity';
import { isEditWorkspaceOperationComplete } from '@fastgpt/service/core/agentSkills/editWorkspace/utils';
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
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { withSkillDebugRun } from '@fastgpt/service/core/agentSkills/debugRun';
import { skillAttachmentConfig } from '@fastgpt/global/core/agentSkills/attachments';
import { refreshSkillAttachments } from '@fastgpt/service/core/agentSkills/attachments';
import { assertSkillWorkspaceTerminalIdle } from '@fastgpt/service/core/ai/sandbox/terminal';
import type { AgentModelParams } from '@fastgpt/global/core/ai/agent/modelParams';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS);

export type Props = {
  skillId: string;
  chatId: string;
  responseChatItemId?: string;
  messages: ChatCompletionMessageParam[];
  model?: string;
  aiChatDefaultConfig?: AgentModelParams;
  systemPrompt?: string;
};

// Node IDs for the minimal workflow
const START_NODE_ID = 'skill-debug-start';
const AGENT_NODE_ID = 'skill-debug-agent';

/**
 * Build a minimal two-node runtime workflow for skill debug:
 * workflowStart -> agent (with useEditDebugSandbox=true + skillId)
 */
export function buildDebugRuntimeNodes(
  skillId: string,
  model: string,
  systemPrompt: string,
  aiChatDefaultConfig?: AgentModelParams
): {
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
} {
  const runtimeNodes: RuntimeNodeItemType[] = [
    {
      nodeId: START_NODE_ID,
      name: 'Workflow Start',
      avatar: '',
      intro: '',
      flowNodeType: FlowNodeTypeEnum.workflowStart,
      showStatus: false,
      isEntry: true,
      inputs: [
        {
          key: NodeInputKeyEnum.userChatInput,
          renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
          valueType: WorkflowIOValueTypeEnum.string,
          label: 'User Question',
          toolDescription: 'user question',
          required: true,
          value: ''
        }
      ],
      outputs: [
        {
          id: NodeOutputKeyEnum.userFiles,
          key: NodeOutputKeyEnum.userFiles,
          label: 'User Files',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.arrayString
        },
        {
          id: NodeOutputKeyEnum.userChatInput,
          key: NodeOutputKeyEnum.userChatInput,
          label: 'User Question',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]
    },
    {
      nodeId: AGENT_NODE_ID,
      name: 'Agent',
      avatar: '',
      intro: '',
      flowNodeType: FlowNodeTypeEnum.agent,
      showStatus: true,
      isEntry: false,
      inputs: [
        {
          key: NodeInputKeyEnum.userChatInput,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.string,
          label: 'User Question',
          required: true,
          // Reference to start node output: [nodeId, outputKey]
          value: [START_NODE_ID, NodeOutputKeyEnum.userChatInput]
        },
        {
          key: NodeInputKeyEnum.fileUrlList,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.arrayString,
          label: 'User Files',
          value: [START_NODE_ID, NodeOutputKeyEnum.userFiles]
        },
        {
          key: NodeInputKeyEnum.history,
          renderTypeList: [FlowNodeInputTypeEnum.numberInput],
          valueType: WorkflowIOValueTypeEnum.chatHistory,
          label: 'Chat History',
          required: true,
          min: 0,
          max: 50,
          value: 20
        },
        {
          key: NodeInputKeyEnum.aiModel,
          renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
          label: 'AI Model',
          required: true,
          valueType: WorkflowIOValueTypeEnum.string,
          value: model
        },
        {
          key: NodeInputKeyEnum.aiChatDefaultConfig,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          valueType: WorkflowIOValueTypeEnum.object,
          label: 'Model parameters',
          value: aiChatDefaultConfig
        },
        {
          key: NodeInputKeyEnum.aiSystemPrompt,
          renderTypeList: [FlowNodeInputTypeEnum.textarea],
          valueType: WorkflowIOValueTypeEnum.string,
          label: 'System Prompt',
          value: systemPrompt
        },
        {
          key: NodeInputKeyEnum.skills,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          valueType: WorkflowIOValueTypeEnum.arrayString,
          label: 'Skills',
          value: [skillId]
        },
        {
          key: NodeInputKeyEnum.useEditDebugSandbox,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          valueType: WorkflowIOValueTypeEnum.boolean,
          label: 'Use Edit Debug Sandbox',
          value: true
        }
      ],
      outputs: [
        {
          id: NodeOutputKeyEnum.answerText,
          key: NodeOutputKeyEnum.answerText,
          label: 'Answer',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]
    }
  ];

  const runtimeEdges: RuntimeEdgeItemType[] = [
    {
      source: START_NODE_ID,
      sourceHandle: getHandleId(START_NODE_ID, 'source', 'right'),
      target: AGENT_NODE_ID,
      targetHandle: getHandleId(AGENT_NODE_ID, 'target', 'left'),
      status: 'waiting'
    }
  ];

  return { runtimeNodes, runtimeEdges };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const {
    skillId,
    chatId,
    responseChatItemId,
    messages = [],
    model,
    aiChatDefaultConfig,
    systemPrompt = ''
  } = SkillDebugChatBodySchema.parse(req.body);

  try {
    // Validate required parameters
    if (!skillId) throw new UserError('skillId is required');
    if (!chatId) throw new UserError('chatId is required');
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new UserError('messages is required');
    }
    if (messages.length !== 1 || messages[0].role !== 'user')
      throw new UserError('messages must contain only the current user input');
    if (
      typeof chatId !== 'string' ||
      chatId.length > 128 ||
      typeof responseChatItemId !== 'string' ||
      responseChatItemId.length > 128
    )
      throw new UserError('Invalid chatId or responseChatItemId');

    const resolvedModel = model || getDefaultLLMModel().model;
    if (!global.llmModelMap.has(resolvedModel))
      throw new UserError('Selected model is unavailable');

    const originIp = getIpFromRequest(req);

    // Authenticate skill access
    const { teamId, tmbId, skill } = await authSkill({
      req,
      authToken: true,
      authApiKey: true,
      skillId,
      per: WritePermissionVal
    });
    const sourceScope = getSkillChatScope({ skillId, teamId });
    await assertSkillChatSession({ skillId, teamId, chatId });
    if (!(await teamFrequencyLimit({ teamId, type: LimitTypeEnum.chat, res }))) return;

    await withSkillDebugRun({
      skillId,
      teamId,
      tmbId,
      chatId,
      requestId: responseChatItemId,
      stopped: () => res.closed || !!res.errored,
      run: async (shouldStop) => {
        // Verify edit-debug sandbox exists for this skill
        const sandboxInstance = await resolveEditWorkspace({ skillId, teamId });
        if (
          !sandboxInstance ||
          sandboxInstance.status !== 'running' ||
          !isEditWorkspaceOperationComplete(sandboxInstance)
        ) {
          throw new UserError(
            'Edit debug sandbox not found. Please create it via /api/core/agentSkills/edit first.'
          );
        }
        logger.debug('Edit debug sandbox found', {
          skillId,
          sandboxId: String(sandboxInstance._id)
        });

        // Parse messages: pop the last human message as userQuestion
        const chatMessages = GPTMessages2Chats({ messages });
        const userQuestion = chatMessages.pop() as UserChatItemType;
        if (!userQuestion) {
          throw new UserError('User question is empty');
        }
        if (userQuestion.value.filter((item) => item.file).length > 10)
          throw new UserError('Too many attachments');
        await refreshSkillAttachments({ messages: [userQuestion], skillId, chatId, tmbId });

        // Load chat history (using skillId as virtual appId)
        const histories = await loadSkillDebugHistories({
          skillId,
          teamId,
          chatId,
          nodeId: AGENT_NODE_ID
        });
        await refreshSkillAttachments({ messages: histories, skillId, chatId });

        const newHistories = histories;
        const interactive = getLastInteractiveValue(newHistories);

        // Build the minimal workflow
        const { runtimeNodes, runtimeEdges } = buildDebugRuntimeNodes(
          skillId,
          resolvedModel,
          systemPrompt,
          aiChatDefaultConfig
        );

        // Setup SSE response
        const workflowResponseWrite = getWorkflowResponseWrite({
          res,
          detail: true,
          streamResponse: true,
          id: chatId,
          showNodeStatus: true
        });

        logger.debug('Dispatching skill debug workflow', { skillId, chatId, model });

        await assertSkillWorkspaceTerminalIdle(sandboxInstance);
        await claimSkillDebugResume({
          skillId,
          teamId,
          chatId,
          nodeId: AGENT_NODE_ID,
          requestId: responseChatItemId,
          histories: newHistories
        });

        // Execute workflow
        const {
          flowResponses,
          assistantResponses,
          system_memories,
          durationSeconds,
          customFeedbacks
        } = await dispatchWorkFlow({
          shouldStop,
          apiVersion: 'v1',
          res,
          lang: getLocale(req),
          requestOrigin: req.headers.origin,
          mode: 'test',
          usageSource: UsageSourceEnum.fastgpt,

          uid: tmbId,

          runningAppInfo: {
            id: skillId,
            name: skill.name,
            teamId,
            tmbId
          },
          runningUserInfo: await getRunningUserInfoByTmbId(tmbId),

          chatId,
          responseChatItemId,
          runtimeNodes,
          runtimeEdges,
          variables: {},
          query: removeEmptyUserInput(userQuestion.value),
          lastInteractive: interactive,
          chatConfig: { fileSelectConfig: skillAttachmentConfig },
          histories: newHistories,
          stream: true,
          maxRunTimes: WORKFLOW_MAX_RUN_TIMES,
          workflowStreamResponse: workflowResponseWrite,
          responseDetail: true
        });

        logger.debug('Skill debug workflow completed', { skillId, chatId, durationSeconds });

        // Save chat records (using skillId as virtual appId)
        const newTitle = getChatTitleFromChatMessage(userQuestion);
        const aiResponse: AIChatItemType & { dataId?: string } = {
          errorMsg: flowResponses.find((response) => response.errorText)?.errorText,
          dataId: responseChatItemId,
          obj: ChatRoleEnum.AI,
          value: assistantResponses,
          memories: system_memories,
          [DispatchNodeResponseKeyEnum.nodeResponse]: flowResponses,
          customFeedbacks
        };

        const saveParams = {
          chatId,
          sourceScope,
          appId: skillId,
          teamId,
          tmbId,
          nodes: [],
          appChatConfig: {},
          variables: {},
          newTitle,
          source: ChatSourceEnum.test,
          userContent: userQuestion,
          aiContent: aiResponse,
          durationSeconds,
          metadata: { originIp }
        };

        if (interactive) {
          await updateInteractiveChat({ interactive, ...saveParams });
        } else {
          await pushChatRecords(saveParams);
        }
        if (aiResponse.errorMsg) throw new UserError(aiResponse.errorMsg);
        workflowResponseWrite({
          event: SseResponseEventEnum.answer,
          data: textAdaptGptResponse({ text: null, finish_reason: 'stop' })
        });
        workflowResponseWrite({ event: SseResponseEventEnum.answer, data: '[DONE]' });
        return assistantResponses.some((value) => value.interactive)
          ? 'waitingForInput'
          : flowResponses.some((response) => response.errorText)
            ? 'failed'
            : 'completed';
      }
    });
  } catch (err) {
    logger.error('Skill debug chat error', { error: err, skillId });
    sseErrRes(res, err);
  }

  res.end();
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: '20mb'
  }
};
