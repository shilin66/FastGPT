import path from 'path';
import type { z } from 'zod';
import type { AgentCapability } from './type';
import {
  allSandboxTools,
  SandboxToolIds,
  SandboxReadFileSchema,
  SandboxWriteFileSchema,
  SandboxEditFileSchema,
  SandboxExecuteSchema,
  SandboxSearchSchema,
  SandboxFetchUserFileSchema
} from '@fastgpt/global/core/workflow/node/agent/skillTools';
import {
  createAgentSandbox,
  releaseAgentSandbox,
  connectEditDebugSandbox,
  disconnectEditDebugSandbox
} from '../sub/sandbox';
import { buildSkillsContextPrompt } from '../sub/sandbox/prompt';
import { parseJsonArgs } from '../../../../../ai/utils';
import {
  dispatchSandboxReadFile,
  dispatchSandboxWriteFile,
  dispatchSandboxEditFile,
  dispatchSandboxExecute,
  dispatchSandboxSearch,
  dispatchSandboxFetchUserFile
} from '../sub/sandbox/skill';
import { getLogger, LogCategories } from '../../../../../../common/logger';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { WorkflowResponseType } from '../../../type';
import type {
  AIChatItemValueItemType,
  SandboxStatusItemType
} from '@fastgpt/global/core/chat/type';
import type { AgentSandboxContext, DeployedSkillInfo } from '../sub/sandbox/types';
import { MongoSandboxInstance } from '../../../../../ai/sandbox/schema';
import {
  resolveRuntimeSkills,
  type ResolvedRuntimeSkill
} from '../../../../../agentSkills/runtimeResolver';
import { SandboxUnavailableError, isFatalAgentError } from '../sub/sandbox/errors';
import { isSandboxInfrastructureError } from '../../../../../ai/sandbox/errors';
import { resolveSandboxWorkspacePath } from '../../../../../ai/sandbox/workspace';
import { resolveAppSandboxIdentity } from '../../../../../ai/sandbox/identity';
import { getRuntimeSandboxWorkspaceRoot, runEditDebugSandboxTool } from '../sub/sandbox/lifecycle';
import { env } from '../../../../../../env';

type SandboxToolResult = {
  response: string;
  usages: any[];
  assistantResponses?: AIChatItemValueItemType[];
};

const sandboxToolSchemas: Record<string, z.ZodType> = {
  [SandboxToolIds.readFile]: SandboxReadFileSchema,
  [SandboxToolIds.writeFile]: SandboxWriteFileSchema,
  [SandboxToolIds.editFile]: SandboxEditFileSchema,
  [SandboxToolIds.execute]: SandboxExecuteSchema,
  [SandboxToolIds.search]: SandboxSearchSchema,
  [SandboxToolIds.fetchUserFile]: SandboxFetchUserFileSchema
};

type SandboxSkillsCapabilityParams = {
  skillIds: string[];
  expectedVersionIds?: Record<string, string>;
  onResolvedVersionIds?: (versions: Record<string, string>) => void;
  appId: string;
  runtimeUserId: string;
  teamId: string;
  tmbId: string;
  sessionId: string;
  mode: 'sessionRuntime' | 'editDebug';
  workflowStreamResponse?: WorkflowResponseType; // SSE stream for lifecycle and skill events
  showSkillReferences: boolean;
  allFilesMap: Record<string, { url: string; name: string; type: string }>;
};

function fetchSkillsMetaForPrompt({
  resolvedSkills,
  workDirectory
}: {
  resolvedSkills: ResolvedRuntimeSkill[];
  workDirectory: string;
}): DeployedSkillInfo[] {
  return resolvedSkills.flatMap(({ skill, version, runtimeSkills }) =>
    runtimeSkills.map((runtimeSkill) => {
      const directory = resolveSandboxWorkspacePath({
        workspaceRoot: workDirectory,
        path: '.runtime/current/' + skill._id + '/' + runtimeSkill.path
      });
      return {
        id: String(skill._id),
        versionId: String(version._id),
        name: runtimeSkill.name,
        description: runtimeSkill.description,
        avatar: skill.avatar,
        directory,
        skillMdPath: path.posix.join(directory, 'SKILL.md')
      };
    })
  );
}

export function collectSkillReferenceResponses({
  paths,
  sandboxContext,
  workflowStreamResponse,
  showSkillReferences,
  toolCallId
}: {
  paths: string[];
  sandboxContext: AgentSandboxContext;
  workflowStreamResponse?: WorkflowResponseType;
  showSkillReferences: boolean;
  toolCallId: string;
}): AIChatItemValueItemType[] {
  const skillResponses: AIChatItemValueItemType[] = [];
  for (const requestedPath of paths) {
    const filePath = (() => {
      try {
        return resolveSandboxWorkspacePath({
          workspaceRoot: sandboxContext.workDirectory,
          path: requestedPath
        });
      } catch {
        return '';
      }
    })();
    if (!filePath.endsWith('/SKILL.md')) continue;

    const skill = sandboxContext.deployedSkills.find(
      (s) => s.skillMdPath === filePath || filePath.startsWith(s.directory + '/')
    );
    if (!skill) continue;

    // Use toolCallId from the triggering tool call for correlation
    if (showSkillReferences)
      workflowStreamResponse?.({
        id: toolCallId,
        event: SseResponseEventEnum.skillCall,
        data: {
          skill: {
            id: toolCallId,
            skillName: skill.name,
            skillAvatar: skill.avatar || '',
            description: skill.description,
            skillMdPath: filePath
          }
        }
      });

    const audit = {
      id: toolCallId,
      status: 'referenced' as const,
      skillId: skill.id,
      versionId: skill.versionId,
      baseVersionId: sandboxContext.baseVersionId,
      workspaceGeneration: sandboxContext.workspaceGeneration,
      sandboxId: sandboxContext.sandboxId,
      operationId: sandboxContext.operationId
    };
    skillResponses.push({
      sandboxEvent: audit,
      ...(showSkillReferences && {
        skills: [
          {
            id: toolCallId,
            skillId: skill.id,
            versionId: skill.versionId,
            sandboxId: sandboxContext.sandboxId,
            operationId: sandboxContext.operationId,
            skillName: skill.name,
            skillAvatar: skill.avatar || '',
            description: skill.description,
            skillMdPath: filePath
          }
        ]
      })
    });
  }
  return skillResponses;
}

export async function createSandboxSkillsCapability(
  params: SandboxSkillsCapabilityParams
): Promise<AgentCapability> {
  const {
    skillIds,
    appId,
    runtimeUserId,
    teamId,
    tmbId,
    sessionId,
    mode,
    workflowStreamResponse,
    showSkillReferences,
    allFilesMap
  } = params;
  const isEditDebug = mode === 'editDebug';
  const logger = getLogger(LogCategories.MODULE.AI.AGENT);
  const failure = ({
    context,
    toolCallId = sessionId
  }: {
    context?: AgentSandboxContext;
    toolCallId?: string;
  }): SandboxToolResult => {
    const status = skillIds.length || isEditDebug ? 'failed' : 'degraded';
    const bindings = context?.deployedSkills.length ? context.deployedSkills : [undefined];
    const assistantResponses: AIChatItemValueItemType[] = bindings.map((skill) => ({
      sandboxEvent: {
        id: toolCallId,
        status,
        code: 'sandbox_unavailable',
        skillId: skill?.id,
        versionId: skill?.versionId,
        baseVersionId: context?.baseVersionId,
        workspaceGeneration: context?.workspaceGeneration,
        sandboxId: context?.sandboxId,
        operationId: context?.operationId
      }
    }));
    logger.error('Agent Sandbox unavailable', {
      teamId,
      appId,
      sessionId,
      status,
      code: 'sandbox_unavailable',
      sandboxId: context?.sandboxId,
      operationId: context?.operationId
    });
    if (status === 'failed') throw new SandboxUnavailableError(assistantResponses);
    return {
      response: JSON.stringify({ code: 'sandbox_unavailable', status, retryable: false }),
      usages: [],
      assistantResponses
    };
  };

  // editDebug: keep existing immediate-connect behavior
  if (isEditDebug) {
    if (skillIds.length !== 1) {
      throw new Error('useEditDebugSandbox only supports a single skill');
    }
    const sandboxContext = await connectEditDebugSandbox({
      skillId: skillIds[0],
      teamId,
      tmbId
    }).catch((error) => {
      if (isFatalAgentError(error)) throw error;
      failure({});
      throw new SandboxUnavailableError();
    });

    const systemPrompt = buildSkillsContextPrompt(
      sandboxContext.deployedSkills,
      sandboxContext.workDirectory
    );

    return {
      id: 'sandbox-skills',
      systemPrompt,
      completionTools: allSandboxTools,
      handleToolCall: async (toolId, args, toolCallId) => {
        if (!(Object.values(SandboxToolIds) as string[]).includes(toolId)) return null;
        const parsed = sandboxToolSchemas[toolId].safeParse(parseJsonArgs(args));
        if (!parsed.success) return { response: parsed.error.message, usages: [] };
        const result = await runEditDebugSandboxTool({
          context: sandboxContext,
          skillId: skillIds[0],
          teamId,
          tmbId,
          execute: () =>
            buildEditDebugHandler(
              toolId,
              args,
              sandboxContext,
              allFilesMap,
              workflowStreamResponse,
              showSkillReferences,
              toolCallId
            )
        }).catch(() => {
          return failure({ context: sandboxContext, toolCallId });
        });
        if (result !== null) {
          result.assistantResponses = [
            {
              sandboxEvent: {
                id: toolCallId,
                status: 'ready',
                skillId: skillIds[0],
                sandboxId: sandboxContext.sandboxId,
                operationId: sandboxContext.operationId,
                baseVersionId: sandboxContext.baseVersionId,
                workspaceGeneration: sandboxContext.workspaceGeneration
              }
            },
            ...(result.assistantResponses ?? [])
          ];
          // Fire-and-forget: renew sandbox expiration after successful execution
          MongoSandboxInstance.updateOne(
            { provider: sandboxContext.sandbox.provider, sandboxId: sandboxContext.sandboxId },
            { lastActiveAt: new Date() }
          ).catch((err) =>
            logger.error('[Agent Sandbox] Failed to renew lastActiveAt', { error: err })
          );
        }
        return result;
      },
      dispose: async () => {
        disconnectEditDebugSandbox(sandboxContext).catch((err) => {
          logger.error('[Agent Sandbox] Disconnect failed', { error: err });
        });
      }
    };
  }

  const resolvedSkills = await resolveRuntimeSkills({
    skillIds,
    teamId,
    tmbId,
    expectedVersionIds: params.expectedVersionIds
  });
  const expectedVersionIds = Object.fromEntries(
    resolvedSkills.map(({ skill, version }) => [String(skill._id), String(version._id)])
  );
  params.onResolvedVersionIds?.(expectedVersionIds);
  const instance = env.AGENT_SANDBOX_PROVIDER
    ? (await resolveAppSandboxIdentity({ appId, userId: runtimeUserId, chatId: sessionId }))
        .instance
    : undefined;
  const workDirectory = getRuntimeSandboxWorkspaceRoot(instance);
  const skillsMeta = fetchSkillsMetaForPrompt({ resolvedSkills, workDirectory });

  const systemPrompt = buildSkillsContextPrompt(skillsMeta, workDirectory);

  // --- Lazy-init state ---
  let sandboxContext: AgentSandboxContext | null = null;
  let initPromise: Promise<AgentSandboxContext> | null = null;
  let unavailableResult: SandboxToolResult | undefined;
  let deploymentRecorded = false;

  const onProgress = workflowStreamResponse
    ? (status: SandboxStatusItemType) =>
        workflowStreamResponse({ event: SseResponseEventEnum.sandboxStatus, data: status })
    : undefined;

  async function initializeSandbox(): Promise<AgentSandboxContext> {
    onProgress?.({ sandboxId: sessionId, phase: 'lazyInit' });
    return createAgentSandbox({
      skillIds,
      expectedVersionIds,
      appId,
      runtimeUserId,
      teamId,
      tmbId,
      sessionId,
      onProgress
    });
  }

  async function ensureSandbox(): Promise<AgentSandboxContext> {
    if (sandboxContext) return sandboxContext;
    if (!initPromise) {
      initPromise = initializeSandbox()
        .then((ctx) => {
          sandboxContext = ctx;
          initPromise = null;
          return ctx;
        })
        .catch((err) => {
          initPromise = null;
          throw err;
        });
    }
    return initPromise;
  }

  async function executeOnce(
    executor: (ctx: AgentSandboxContext) => Promise<SandboxToolResult>,
    toolCallId: string
  ): Promise<SandboxToolResult> {
    if (unavailableResult) return { ...unavailableResult, assistantResponses: [] };
    let ctx: AgentSandboxContext;
    try {
      ctx = await ensureSandbox();
    } catch (err) {
      if (isFatalAgentError(err) && !(err instanceof SandboxUnavailableError)) throw err;
      unavailableResult = failure({ toolCallId });
      return unavailableResult;
    }

    let result: SandboxToolResult;
    try {
      result = await executor(ctx);
    } catch (err) {
      if (!isSandboxInfrastructureError(err)) throw err;
      unavailableResult = failure({ context: ctx, toolCallId });
      return unavailableResult;
    }

    if (!deploymentRecorded) {
      const assistantResponses: AIChatItemValueItemType[] = skillsMeta.map((skill) => ({
        sandboxEvent: {
          id: toolCallId,
          status: 'ready',
          skillId: skill.id,
          versionId: skill.versionId,
          sandboxId: ctx.sandboxId,
          operationId: ctx.operationId
        }
      }));
      result = {
        ...result,
        assistantResponses: [...assistantResponses, ...(result.assistantResponses ?? [])]
      };
      deploymentRecorded = true;
    }

    // Fire-and-forget: renew sandbox expiration after successful execution
    MongoSandboxInstance.updateOne(
      { provider: ctx.sandbox.provider, sandboxId: ctx.sandboxId },
      { lastActiveAt: new Date() }
    ).catch((err) => logger.error('[Agent Sandbox] Failed to renew lastActiveAt', { error: err }));

    return result;
  }

  return {
    id: 'sandbox-skills',
    systemPrompt,
    completionTools: allSandboxTools,
    handleToolCall: async (toolId, args, toolCallId) => {
      if (!(Object.values(SandboxToolIds) as string[]).includes(toolId)) return null;
      const parsed = sandboxToolSchemas[toolId].safeParse(parseJsonArgs(args));
      if (!parsed.success) return { response: parsed.error.message, usages: [] };

      return executeOnce(async (ctx) => {
        return buildSessionHandler(
          toolId,
          args,
          ctx,
          allFilesMap,
          workflowStreamResponse,
          showSkillReferences,
          toolCallId
        );
      }, toolCallId);
    },
    dispose: async () => {
      if (sandboxContext) {
        releaseAgentSandbox(sandboxContext).catch((err) => {
          logger.error('[Agent Sandbox] Release failed', { error: err });
        });
      }
    }
  };
}

// --- Handler builders ---

async function buildEditDebugHandler(
  toolId: string,
  args: string,
  sandboxContext: AgentSandboxContext,
  allFilesMap: Record<string, { url: string; name: string; type: string }>,
  workflowStreamResponse?: WorkflowResponseType,
  showSkillReferences = false,
  toolCallId = ''
): Promise<SandboxToolResult | null> {
  const handlers: Record<string, () => Promise<SandboxToolResult>> = {
    [SandboxToolIds.readFile]: async () => {
      const parsed = SandboxReadFileSchema.safeParse(parseJsonArgs(args));
      if (!parsed.success) return { response: parsed.error.message, usages: [] };

      const assistantResponses = collectSkillReferenceResponses({
        paths: parsed.data.paths,
        sandboxContext,
        workflowStreamResponse,
        showSkillReferences,
        toolCallId
      });

      return {
        ...(await dispatchSandboxReadFile(sandboxContext, parsed.data)),
        ...(assistantResponses.length > 0 && { assistantResponses })
      };
    },
    [SandboxToolIds.writeFile]: async () => {
      const parsed = SandboxWriteFileSchema.safeParse(parseJsonArgs(args));
      if (!parsed.success) return { response: parsed.error.message, usages: [] };
      return dispatchSandboxWriteFile(sandboxContext, parsed.data);
    },
    [SandboxToolIds.editFile]: async () => {
      const parsed = SandboxEditFileSchema.safeParse(parseJsonArgs(args));
      if (!parsed.success) return { response: parsed.error.message, usages: [] };
      return dispatchSandboxEditFile(sandboxContext, parsed.data);
    },
    [SandboxToolIds.execute]: async () => {
      const parsed = SandboxExecuteSchema.safeParse(parseJsonArgs(args));
      if (!parsed.success) return { response: parsed.error.message, usages: [] };
      return dispatchSandboxExecute(sandboxContext, parsed.data);
    },
    [SandboxToolIds.search]: async () => {
      const parsed = SandboxSearchSchema.safeParse(parseJsonArgs(args));
      if (!parsed.success) return { response: parsed.error.message, usages: [] };
      return dispatchSandboxSearch(sandboxContext, parsed.data);
    },
    [SandboxToolIds.fetchUserFile]: async () => {
      const parsed = SandboxFetchUserFileSchema.safeParse(parseJsonArgs(args));
      if (!parsed.success) return { response: parsed.error.message, usages: [] };
      return dispatchSandboxFetchUserFile(sandboxContext, parsed.data, allFilesMap);
    }
  };

  const handler = handlers[toolId];
  if (!handler) return null;
  return handler();
}

async function buildSessionHandler(
  toolId: string,
  args: string,
  sandboxContext: AgentSandboxContext,
  allFilesMap: Record<string, { url: string; name: string; type: string }>,
  workflowStreamResponse?: WorkflowResponseType,
  showSkillReferences = false,
  toolCallId = ''
): Promise<SandboxToolResult> {
  const handlers: Record<string, () => Promise<SandboxToolResult>> = {
    [SandboxToolIds.readFile]: async () => {
      const parsed = SandboxReadFileSchema.safeParse(parseJsonArgs(args));
      if (!parsed.success) return { response: parsed.error.message, usages: [] };

      const assistantResponses = collectSkillReferenceResponses({
        paths: parsed.data.paths,
        sandboxContext,
        workflowStreamResponse,
        showSkillReferences,
        toolCallId
      });

      return {
        ...(await dispatchSandboxReadFile(sandboxContext, parsed.data)),
        ...(assistantResponses.length > 0 && { assistantResponses })
      };
    },
    [SandboxToolIds.writeFile]: async () => {
      const parsed = SandboxWriteFileSchema.safeParse(parseJsonArgs(args));
      if (!parsed.success) return { response: parsed.error.message, usages: [] };
      return dispatchSandboxWriteFile(sandboxContext, parsed.data);
    },
    [SandboxToolIds.editFile]: async () => {
      const parsed = SandboxEditFileSchema.safeParse(parseJsonArgs(args));
      if (!parsed.success) return { response: parsed.error.message, usages: [] };
      return dispatchSandboxEditFile(sandboxContext, parsed.data);
    },
    [SandboxToolIds.execute]: async () => {
      const parsed = SandboxExecuteSchema.safeParse(parseJsonArgs(args));
      if (!parsed.success) return { response: parsed.error.message, usages: [] };
      return dispatchSandboxExecute(sandboxContext, parsed.data);
    },
    [SandboxToolIds.search]: async () => {
      const parsed = SandboxSearchSchema.safeParse(parseJsonArgs(args));
      if (!parsed.success) return { response: parsed.error.message, usages: [] };
      return dispatchSandboxSearch(sandboxContext, parsed.data);
    },
    [SandboxToolIds.fetchUserFile]: async () => {
      const parsed = SandboxFetchUserFileSchema.safeParse(parseJsonArgs(args));
      if (!parsed.success) return { response: parsed.error.message, usages: [] };
      return dispatchSandboxFetchUserFile(sandboxContext, parsed.data, allFilesMap);
    }
  };

  const handler = handlers[toolId];
  if (!handler) return { response: 'Unknown sandbox tool', usages: [] };
  return handler();
}
