import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import type { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { getNodeErrResponse } from '../../../utils';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { parseUserSystemPrompt } from '../sub/plan/prompt';
import { formatFileInput } from '../sub/file/utils';
import { normalizeSkillIds } from '@fastgpt/global/core/app/formEdit/type';
import { systemSubInfo } from '@fastgpt/global/core/workflow/node/agent/constants';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { getSubapps } from '../utils';
import { createCapabilityToolCallHandler, type AgentCapability } from '../capability/type';
import { createSandboxSkillsCapability } from '../capability/sandboxSkills';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { buildPiModel, getModelApiKey } from './modelBridge';
import { buildAgentTools, type ToolDispatchContext } from './toolAdapter';
import { getLogger, LogCategories } from '../../../../../../common/logger';
import { env } from '../../../../../../env';
import type { DispatchAgentModuleProps } from '..';
import { buildAgentMemory, getAgentHistories } from '../memory';
import { AIAskAnswerSchema, AIAskTool, formatAgentAsk } from '../sub/plan/ask/constants';
import type { InteractiveNodeResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { chatHistoriesToPiMessages, readPiAgentState, resumePiMessages } from './memory';
import { isFatalAgentError, SandboxUnavailableError } from '../sub/sandbox/errors';

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
}>;

export const dispatchPiAgent = async (props: DispatchAgentModuleProps): Promise<Response> => {
  const {
    checkIsStopping,
    node: { nodeId, inputs },
    lang,
    histories,
    query,
    requestOrigin,
    chatConfig,
    runningAppInfo,
    workflowStreamResponse,
    usagePush,
    mode,
    chatId,
    showSkillReferences,
    params: {
      model,
      systemPrompt,
      userChatInput,
      history = 6,
      fileUrlList: fileLinksInput,
      agent_selectedTools: selectedTools = [],
      skills: skillIds = [],
      useEditDebugSandbox,
      agent_datasetParams: datasetParams,
      useAgentSandbox = false,
      aiChatVision
    }
  } = props;

  const chatHistories = getAgentHistories({ history, histories, nodeId });
  const normalizedSkillIds = normalizeSkillIds(skillIds);

  const assistantResponses: AIChatItemValueItemType[] = [];
  const nodeResponses: ChatHistoryItemResType[] = [];
  const capabilities: AgentCapability[] = [];
  const restoredState = readPiAgentState({ histories, nodeId });
  let sandboxSkillVersions = restoredState?.sandboxSkillVersions;
  const terminalPlanEvent: AIChatItemValueItemType = {
    planEvent: { nodeId, type: 'completed', plan: null }
  };

  try {
    if (!env.SHOW_SKILL && (normalizedSkillIds.length > 0 || useEditDebugSandbox)) {
      throw new SandboxUnavailableError();
    }
    // Get files — check whether fileUrlList input has actual values
    const fileUrlInput = inputs.find((item) => item.key === NodeInputKeyEnum.fileUrlList);
    const fileLinks =
      fileUrlInput && fileUrlInput.value && fileUrlInput.value.length > 0
        ? fileLinksInput
        : undefined;

    const {
      filesMap,
      allFilesMap,
      prompt: fileInputPrompt
    } = await formatFileInput({
      fileUrls: fileLinks,
      requestOrigin,
      maxFiles: chatConfig?.fileSelectConfig?.maxFiles || 20,
      histories: chatHistories,
      useSkill: skillIds.length > 0
    });

    const formatUserChatInput = fileInputPrompt
      ? `${fileInputPrompt}\n\n${userChatInput}`
      : userChatInput;

    // Initialize capabilities — sandbox skills (lazy-init, gated by SHOW_SKILL)
    if (env.SHOW_SKILL) {
      const sandboxSessionId = mode === 'chat' ? chatId : `debug-${runningAppInfo.id}-${nodeId}`;
      const sandboxMode = useEditDebugSandbox ? 'editDebug' : 'sessionRuntime';

      const sandboxCap = await createSandboxSkillsCapability({
        skillIds: normalizedSkillIds,
        appId: runningAppInfo.id,
        runtimeUserId: props.uid,
        teamId: runningAppInfo.teamId,
        tmbId: runningAppInfo.tmbId,
        sessionId: sandboxSessionId,
        mode: sandboxMode,
        workflowStreamResponse,
        showSkillReferences: showSkillReferences === true,
        allFilesMap,
        expectedVersionIds: sandboxSkillVersions,
        onResolvedVersionIds: (versions) => {
          sandboxSkillVersions = versions;
        }
      });
      capabilities.push(sandboxCap);
    }

    // Aggregate capability contributions
    const capabilitySystemPrompt = capabilities
      .map((c) => c.systemPrompt)
      .filter(Boolean)
      .join('\n\n');
    const capabilityTools = capabilities.flatMap((c) => c.completionTools ?? []);
    const capabilityToolCallHandler =
      capabilities.length > 0 ? createCapabilityToolCallHandler(capabilities) : undefined;

    // Get sub apps — pi-agent-core manages reasoning, no plan tool needed
    const { completionTools: agentCompletionTools, subAppsMap: agentSubAppsMap } = await getSubapps(
      {
        tools: selectedTools,
        tmbId: runningAppInfo.tmbId,
        lang,
        getPlanTool: false,
        hasDataset: datasetParams && datasetParams.datasets.length > 0,
        hasFiles: !!chatConfig?.fileSelectConfig?.canSelectFile,
        useAgentSandbox: useAgentSandbox && !!global.feConfigs?.show_agent_sandbox,
        extraTools: capabilityTools
      }
    );

    const getSubAppInfo = (id: string) => {
      const formatId = id.startsWith('t') ? id.slice(1) : id;
      const userToolNode = agentSubAppsMap.get(id) || agentSubAppsMap.get(formatId);
      if (userToolNode) {
        return {
          name: userToolNode.name || '',
          avatar: userToolNode.avatar || '',
          toolDescription: userToolNode.toolDescription || userToolNode.name || ''
        };
      }
      const systemToolNode = systemSubInfo[id] || systemSubInfo[formatId];
      const systemDisplayName = parseI18nString(systemToolNode?.name, lang);
      return {
        name: systemDisplayName || '',
        avatar: systemToolNode?.avatar || '',
        toolDescription: systemToolNode?.toolDescription || systemDisplayName || ''
      };
    };
    const getSubApp = (id: string) => {
      const formatId = id.slice(1);
      return agentSubAppsMap.get(id) || agentSubAppsMap.get(formatId);
    };

    const formatedSystemPrompt = parseUserSystemPrompt({
      userSystemPrompt: capabilitySystemPrompt
        ? `${systemPrompt || ''}\n\n${capabilitySystemPrompt}`.trim()
        : systemPrompt,
      selectedDataset: datasetParams?.datasets
    });

    /* ===== Build pi-agent-core model & tools ===== */
    const piModel = buildPiModel(model, aiChatVision);
    const apiKey = getModelApiKey(model);

    const toolCtx: ToolDispatchContext = {
      checkIsStopping,
      chatConfig,
      runningUserInfo: props.runningUserInfo,
      runningAppInfo,
      chatId,
      uid: props.uid,
      variables: props.variables,
      externalProvider: props.externalProvider,
      workflowStreamResponse,
      lang,
      requestOrigin,
      mode,
      timezone: props.timezone,
      retainDatasetCite: props.retainDatasetCite,
      maxRunTimes: props.maxRunTimes,
      workflowDispatchDeep: props.workflowDispatchDeep,
      usagePush,
      model,
      datasetParams,
      requireSandbox: normalizedSkillIds.length > 0 || !!useEditDebugSandbox
    };

    let fatalError: Error | undefined;
    let agent: import('@mariozechner/pi-agent-core').Agent | undefined;
    let pendingAsk: { interactive: InteractiveNodeResponseType; toolCallId: string } | undefined;
    const piTools = await buildAgentTools({
      completionTools: agentCompletionTools,
      ctx: toolCtx,
      filesMap,
      getSubApp,
      getSubAppInfo,
      capabilityToolCallHandler,
      nodeResponses,
      assistantResponses,
      onFatalError: (error) => {
        fatalError ??= error;
        agent?.abort();
      }
    });

    const { Type } = await import('@mariozechner/pi-ai');
    piTools.push({
      name: AIAskTool.function.name,
      label: AIAskTool.function.name,
      description: AIAskTool.function.description ?? '',
      parameters: Type.Unsafe<unknown>(AIAskTool.function.parameters),
      execute: async (toolCallId, args: unknown) => {
        const data = AIAskAnswerSchema.parse(args);
        pendingAsk = { interactive: formatAgentAsk(data), toolCallId };
        agent?.abort();
        return {
          content: [{ type: 'text', text: 'Waiting for the user to answer.' }],
          details: {}
        };
      }
    });
    const restoredMessages = restoredState
      ? resumePiMessages({ state: restoredState, answer: chatValue2RuntimePrompt(query).text })
      : chatHistoriesToPiMessages({ histories: chatHistories, model: piModel });

    /* ===== Create & run Agent ===== */
    const { Agent } = await import('@mariozechner/pi-agent-core');
    type AgentEvent = import('@mariozechner/pi-agent-core').AgentEvent;

    agent = new Agent({
      initialState: {
        systemPrompt: formatedSystemPrompt,
        model: piModel,
        tools: piTools,
        messages: restoredMessages
      },
      getApiKey: () => apiKey,
      toolExecution: 'sequential',
      beforeToolCall: async () =>
        pendingAsk || fatalError || checkIsStopping()
          ? { block: true, reason: 'Agent execution has stopped. Retry after the user responds.' }
          : undefined,
      transformContext: async (messages) => {
        if (fatalError) throw fatalError;
        if (pendingAsk || checkIsStopping()) throw new Error('Agent execution paused');
        return messages;
      }
    });

    // Collect text deltas to build answerText
    let answerText = '';

    agent.subscribe((event: AgentEvent) => {
      if (event.type === 'message_update') {
        const e = event.assistantMessageEvent;
        if (e.type === 'text_delta') {
          answerText += e.delta;
          workflowStreamResponse?.({
            event: SseResponseEventEnum.answer,
            data: textAdaptGptResponse({ text: e.delta })
          });
        }
      } else if (event.type === 'turn_end') {
        const errMsg = event.message.role === 'assistant' ? event.message.errorMessage : undefined;
        if (errMsg && !pendingAsk) {
          getLogger(LogCategories.MODULE.AI.AGENT).error(`[piAgent] Turn error: ${errMsg}`);
        }
      }
      // SSE toolCall / toolResponse events are emitted inside each tool's execute()
      // wrapper in toolAdapter.ts
    });

    // Poll for user-initiated stop
    const stopPoller = setInterval(() => {
      if (checkIsStopping()) {
        agent?.abort();
        clearInterval(stopPoller);
      }
    }, 200);

    getLogger(LogCategories.MODULE.AI.AGENT).debug(`[piAgent] Starting agent prompt`);
    try {
      if (restoredState) await agent.continue();
      else await agent.prompt(formatUserChatInput);
    } finally {
      clearInterval(stopPoller);
    }
    getLogger(LogCategories.MODULE.AI.AGENT).debug(`[piAgent] Agent completed`);

    // Surface API errors that pi-agent-core stores instead of throwing
    if (fatalError) throw fatalError;
    if (agent.state.errorMessage && !pendingAsk) {
      throw new Error(agent.state.errorMessage);
    }

    // Build assistant responses
    if (answerText) {
      assistantResponses.push({ text: { content: answerText } });
    }

    if (pendingAsk && !checkIsStopping()) {
      return {
        [DispatchNodeResponseKeyEnum.interactive]: pendingAsk.interactive,
        [DispatchNodeResponseKeyEnum.memories]: buildAgentMemory({
          nodeId,
          engine: 'pi',
          status: 'paused',
          providerState: {
            pendingToolCallId: pendingAsk.toolCallId,
            sandboxSkillVersions,
            pendingMainContext: agent.state.messages.filter(
              (message) =>
                message.role !== 'assistant' || !['aborted', 'error'].includes(message.stopReason)
            )
          }
        }),
        [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
        [DispatchNodeResponseKeyEnum.nodeResponses]: nodeResponses
      };
    }
    assistantResponses.push(terminalPlanEvent);

    return {
      data: {
        [NodeOutputKeyEnum.answerText]: answerText
      },
      [DispatchNodeResponseKeyEnum.memories]: buildAgentMemory({
        nodeId,
        engine: 'pi',
        status: checkIsStopping() ? 'failed' : 'completed'
      }),
      [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
      [DispatchNodeResponseKeyEnum.nodeResponses]: nodeResponses
    };
  } catch (error) {
    getLogger(LogCategories.MODULE.AI.AGENT).error(`[piAgent] dispatchPiAgent error`, { error });
    if (isFatalAgentError(error)) {
      if (error.assistantResponses.length) assistantResponses.push(...error.assistantResponses);
      else
        assistantResponses.push({
          sandboxEvent: {
            id: nodeId,
            status: 'failed',
            code:
              error instanceof SandboxUnavailableError ? 'sandbox_unavailable' : 'skill_unavailable'
          }
        });
    }
    assistantResponses.push(terminalPlanEvent);
    return {
      ...getNodeErrResponse({ error }),
      [DispatchNodeResponseKeyEnum.memories]: buildAgentMemory({
        nodeId,
        engine: 'pi',
        status: 'failed'
      }),
      [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
      [DispatchNodeResponseKeyEnum.nodeResponses]: nodeResponses
    };
  } finally {
    for (const cap of capabilities) {
      await cap.dispose?.();
    }
  }
};
