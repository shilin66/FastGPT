/**
 * Agent Sandbox Lifecycle Management
 *
 * Manages sandbox creation/destruction for agent skill execution.
 *
 * 沙箱容器生命周期：
 * - createAgentSandbox：优先复用已有容器（查 MongoDB），否则创建新容器并持久化到 MongoDB
 * - releaseAgentSandbox：断开 SDK 连接，不销毁容器
 */

import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { createHash } from 'node:crypto';
import { authSkillByTmbId } from '../../../../../../../support/permission/agentSkill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { resolveEditWorkspace } from '../../../../../../agentSkills/editWorkspace/entity';
import { isEditWorkspaceOperationComplete } from '../../../../../../agentSkills/editWorkspace/utils';
import { SandboxUnavailableError } from './errors';
import { isSandboxInfrastructureError } from '../../../../../../ai/sandbox/errors';
import { MongoSandboxInstance } from '../../../../../../ai/sandbox/schema';
import { resolveRuntimeSkills } from '../../../../../../agentSkills/runtimeResolver';
import { downloadSkillPackage } from '../../../../../../agentSkills/storage';
import { parseSkillMarkdown } from '../../../../../../agentSkills/utils';
import {
  getSandboxDefaults,
  getSkillEditWorkspaceRoot,
  disconnectFromProviderSandbox,
  buildBaseContainerEnv
} from '../../../../../../agentSkills/sandboxConfig';
import {
  getSandboxProviderConfig,
  validateSandboxConfig
} from '../../../../../../ai/sandbox/config';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import {
  getSandboxClient,
  getExistingSandboxClient,
  type SandboxClient
} from '../../../../../../ai/sandbox/controller';
import { resolveAppSandboxIdentity } from '../../../../../../ai/sandbox/identity';
import { assertSandboxRuntimeIndexCompatibility } from '../../../../../../ai/sandbox/migration';
import { withSandboxLease } from '../../../../../../ai/sandbox/lease';
import { registerSandboxOperationHeartbeat } from '../../../../../../ai/sandbox/operation';
import { assertSandboxCapacity } from '../../../../../../ai/sandbox/capacity';
import {
  resolveSandboxWorkspacePath,
  assertSandboxWorkspacePath
} from '../../../../../../ai/sandbox/workspace';
import {
  deploySandboxSkillPackages,
  type SandboxSkillPackage
} from '../../../../../../agentSkills/sandboxDeployment';
import type { SandboxImageConfigType } from '@fastgpt/global/core/agentSkills/type';
import type { AgentSandboxContext, DeployedSkillInfo } from './types';
import { getLogger, LogCategories } from '../../../../../../../common/logger';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';
import type { SandboxInstanceSchemaType } from '../../../../../../ai/sandbox/type';

type CreateAgentSandboxParams = {
  skillIds: string[];
  expectedVersionIds?: Record<string, string>;
  appId: string;
  runtimeUserId: string;
  teamId: string;
  tmbId: string;
  sessionId: string; // chat 模式 = chatId，debug 模式 = 构造的 key
  entrypoint?: string; // override default entrypoint for this request
  image?: SandboxImageConfigType; // override default image for this request
  onProgress?: (status: SandboxStatusItemType) => void; // lifecycle progress callback
};

const logger = getLogger(LogCategories.MODULE.AI.AGENT);

export const getRuntimeSandboxWorkspaceRoot = (
  instance?: Pick<SandboxInstanceSchemaType, 'metadata'>
): string =>
  resolveSandboxWorkspacePath({
    workspaceRoot:
      instance?.metadata?.workspaceRoot ??
      (instance?.metadata?.sandboxType === SandboxTypeEnum.sessionRuntime
        ? '/home/sandbox/workspace'
        : getSandboxDefaults().workDirectory),
    path: '.'
  });

// --- Private helpers ---

/** Dynamically discover all deployed skill directories in the sandbox by locating SKILL.md files.
 * Example:
 * $ find ${FASTGPT_WORKDIR} -name "SKILL.md" -maxdepth 5 2>/dev/null
 * /home/sandbox/workspace/projects/skill-creator/SKILL.md
 * /home/sandbox/workspace/projects/deep-research/SKILL.md
 * /home/sandbox/workspace/projects/science/SKILL.md
 *
 * Runs `find` inside the sandbox to locate SKILL.md files up to maxdepth 5,
 * then reads each file and parses the frontmatter for name/description.
 * This replaces the pre-scan approach and works with arbitrary ZIP structures.
 */
async function discoverSkillsInSandbox(
  sandbox: ISandbox,
  workDirectory: string
): Promise<DeployedSkillInfo[]> {
  // Use `find` with -maxdepth 5 to avoid deep recursion performance issues.
  const findResult = await sandbox.execute(
    `find "${workDirectory}" -name "SKILL.md" -maxdepth 5 2>/dev/null`
  );
  if (findResult.exitCode !== 0 || !findResult.stdout.trim()) return [];

  const paths = findResult.stdout.trim().split('\n').filter(Boolean);
  const safePaths = await Promise.all(
    paths.map((path) =>
      assertSandboxWorkspacePath({ provider: sandbox, workspaceRoot: workDirectory, path })
    )
  );
  const files = await sandbox.readFiles(safePaths);

  const result: DeployedSkillInfo[] = [];
  for (const file of files) {
    if (file.error) throw file.error;
    const content =
      file.content instanceof Uint8Array
        ? new TextDecoder('utf-8').decode(file.content)
        : String(file.content);
    const { frontmatter } = parseSkillMarkdown(content);
    if (!frontmatter.name) continue;
    const directory = file.path.replace(/\/SKILL\.md$/i, '');
    result.push({
      id: file.path,
      name: String(frontmatter.name),
      description: frontmatter.description ? String(frontmatter.description) : '',
      directory,
      skillMdPath: file.path
    });
  }
  return result;
}

// --- Exported lifecycle functions ---

/**
 * 创建或复用 session-runtime 沙箱。
 *
 * 优先查询 MongoDB 中是否有相同 sessionId 的活跃容器：
 * - 有 → connect 复用，无冷启动
 * - 无 → 创建新容器，挂载会话 Volume，持久化到 MongoDB
 */
export async function createAgentSandbox(
  params: CreateAgentSandboxParams
): Promise<AgentSandboxContext> {
  const {
    skillIds,
    expectedVersionIds,
    appId,
    runtimeUserId,
    teamId,
    tmbId,
    sessionId,
    entrypoint,
    image,
    onProgress
  } = params;
  const providerConfig = getSandboxProviderConfig();
  const defaults = getSandboxDefaults();
  validateSandboxConfig(providerConfig);
  const identityProps = { appId, userId: runtimeUserId, chatId: sessionId };
  const initial = await resolveAppSandboxIdentity(identityProps);

  return withSandboxLease('skill-runtime-init:' + initial.sandboxId, async (lease) => {
    onProgress?.({ sandboxId: sessionId, phase: 'checkExisting' });
    const { identity, sandboxId, instance } = await resolveAppSandboxIdentity(identityProps);
    const workDirectory = getRuntimeSandboxWorkspaceRoot(instance);
    if (sandboxId !== initial.sandboxId) throw new Error('sandbox_identity_migration_required');
    await assertSandboxRuntimeIndexCompatibility({ appId, chatId: sessionId, sandboxId });
    if (!instance) {
      await assertSandboxCapacity(SandboxTypeEnum.sessionRuntime, (message) =>
        onProgress?.({ sandboxId: sessionId, phase: 'failed', message })
      );
    }
    const resolvedSkills = await resolveRuntimeSkills({
      skillIds,
      teamId,
      tmbId,
      expectedVersionIds
    });
    const skills = resolvedSkills.map(({ skill }) => skill);
    const filter = { provider: providerConfig.provider, sandboxId, 'operation.id': lease.token };
    let client: SandboxClient | undefined;
    let claimed = false;
    const assertActive = async () => {
      await lease.assertOwned();
      if (!(await MongoSandboxInstance.exists(filter))) {
        throw new Error('operation_conflict: runtime deployment no longer owns the workspace');
      }
      await lease.assertOwned();
    };
    try {
      onProgress?.({
        sandboxId: sessionId,
        phase: instance ? 'connecting' : 'creatingContainer',
        isWarmStart: !!instance
      });
      client = await getSandboxClient(
        { ...identityProps, sandboxId },
        {
          identity: { ...identity, teamId, ownerTmbId: tmbId },
          workspaceRoot: workDirectory,
          createConfig: {
            image: image ?? defaults.defaultImage,
            entrypoint: [entrypoint ?? defaults.entrypoint],
            env: buildBaseContainerEnv(sandboxId, workDirectory, false),
            metadata: {
              teamId,
              tmbId,
              sandboxType: SandboxTypeEnum.sessionRuntime,
              sessionId: sandboxId
            }
          }
        }
      );
      await lease.assertOwned();
      const current = await MongoSandboxInstance.findOne({
        provider: providerConfig.provider,
        sandboxId
      }).lean();
      if (
        !current ||
        current.deleteTime ||
        current.status !== SandboxStatusEnum.running ||
        current.operation?.checkpoint !== 'ready' ||
        !['provision', 'start'].includes(current.operation.type)
      )
        throw new Error('operation_conflict');
      const now = new Date();
      const result = await MongoSandboxInstance.updateOne(
        {
          _id: current._id,
          status: SandboxStatusEnum.running,
          deleteTime: null,
          'operation.id': current.operation.id,
          'operation.checkpoint': 'ready',
          'operation.type': current.operation.type
        },
        {
          $set: {
            ...identity,
            teamId,
            ownerTmbId: tmbId,
            appId,
            userId: runtimeUserId,
            chatId: sessionId,
            status: SandboxStatusEnum.provisioning,
            operation: {
              id: lease.token,
              type: 'deploy',
              checkpoint: 'deploying',
              startedAt: now,
              updatedAt: now,
              heartbeatAt: now,
              failureDisposition: 'unknown'
            }
          }
        }
      );
      if (result.matchedCount !== 1) throw new Error('operation_conflict');
      claimed = true;
      registerSandboxOperationHeartbeat(lease, {
        provider: providerConfig.provider,
        sandboxId,
        operationId: lease.token,
        operationType: 'deploy'
      });
      const sandboxInfo = await client.provider.getInfo();
      if (!sandboxInfo) throw new Error('Failed to get sandbox info after connection');
      const packages: SandboxSkillPackage[] = [];
      for (const { skill, version } of resolvedSkills) {
        await assertActive();
        onProgress?.({ sandboxId: sessionId, phase: 'downloadingPackage', skillName: skill.name });
        packages.push({
          skillId: String(skill._id),
          versionId: String(version._id),
          packageBuffer: await downloadSkillPackage({ storageInfo: version.storage }),
          contentHash: version.contentHash,
          avatar: skill.avatar
        });
      }
      const deployment = await deploySandboxSkillPackages({
        provider: client.provider,
        workspaceRoot: workDirectory,
        packages,
        assertActive
      });
      await assertActive();
      const persisted = await MongoSandboxInstance.updateOne(filter, {
        $set: {
          status: SandboxStatusEnum.running,
          lastActiveAt: new Date(),
          currentDeploymentHash: createHash('sha256')
            .update(JSON.stringify(deployment.manifest))
            .digest('hex'),
          'operation.checkpoint': 'completed',
          'operation.failureDisposition': 'retryable',
          'operation.updatedAt': new Date(),
          'metadata.sandboxType': SandboxTypeEnum.sessionRuntime,
          'metadata.teamId': teamId,
          'metadata.tmbId': tmbId,
          'metadata.sessionId': sessionId,
          'metadata.skillIds': skills.map((skill) => skill._id),
          'metadata.provider': providerConfig.provider,
          'metadata.providerSandboxId': sandboxInfo.id,
          'metadata.image': sandboxInfo.image,
          'metadata.providerCreatedAt': sandboxInfo.createdAt,
          'metadata.workspaceRoot': workDirectory
        }
      });
      if (persisted.matchedCount !== 1) throw new Error('operation_conflict');
      onProgress?.({ sandboxId: sessionId, phase: 'ready', isWarmStart: !!instance });
      return {
        sandbox: client.provider,
        sandboxId,
        providerSandboxId: sandboxInfo.id,
        sessionId,
        operationId: lease.token,
        skills,
        deployedSkills: deployment.deployedSkills.map((skill) => ({
          ...skill,
          versionId: String(
            resolvedSkills.find((resolved) => String(resolved.skill._id) === skill.id)!.version._id
          )
        })),
        workDirectory,
        isReady: true
      };
    } catch (error) {
      if (claimed) {
        await lease
          .assertOwned()
          .then(() =>
            MongoSandboxInstance.updateOne(filter, {
              $set: {
                status: SandboxStatusEnum.failed,
                'operation.updatedAt': new Date(),
                'operation.error': {
                  code: 'sandbox_deployment_failed',
                  message: 'Skill deployment failed; workspace retained for retry'
                }
              }
            })
          )
          .catch((stateError) =>
            logger.error('[Agent Sandbox] Failed to record deployment failure', {
              sandboxId,
              error: stateError
            })
          );
      }
      if (client)
        await disconnectFromProviderSandbox(client.provider).catch((error) => {
          logger.error('[Agent Sandbox] Failed to disconnect after deployment failure', {
            sandboxId,
            error
          });
        });
      onProgress?.({
        sandboxId: sessionId,
        phase: 'failed',
        message: 'Sandbox deployment failed; workspace retained for retry'
      });
      throw error;
    }
  });
}

/**
 * 结束本次 sandbox 使用。
 *
 * 只断开 SDK 连接，不销毁容器。
 * 容器保持存活，供同会话的下一次 agent 调用复用。
 */
export async function releaseAgentSandbox(ctx: AgentSandboxContext): Promise<void> {
  try {
    await disconnectFromProviderSandbox(ctx.sandbox);
    logger.info('[Agent Sandbox] Released sandbox connection', {
      sessionId: ctx.sessionId,
      providerSandboxId: ctx.providerSandboxId
    });
  } catch (error) {
    logger.error('[Agent Sandbox] Failed to close sandbox connection', { error });
  }
}

type ConnectEditDebugSandboxParams = {
  skillId: string;
  teamId: string;
  tmbId: string;
};

/**
 * 连接已有的 editDebug 沙箱，构建 AgentSandboxContext。
 * 用于 test 模式下，复用编辑中的沙箱进行调试。
 */
export async function connectEditDebugSandbox(
  params: ConnectEditDebugSandboxParams
): Promise<AgentSandboxContext> {
  const { skillId, teamId, tmbId } = params;
  return withSandboxLease(`skill-edit-init:${skillId}`, async (lease) => {
    const { skill } = await authSkillByTmbId({ skillId, tmbId, per: WritePermissionVal });
    if (String(skill.teamId) !== teamId) throw new SandboxUnavailableError();
    const instance = await resolveEditWorkspace({ skillId, teamId });
    if (!instance || instance.status !== 'running' || !isEditWorkspaceOperationComplete(instance))
      throw new SandboxUnavailableError();
    const workDirectory = getSkillEditWorkspaceRoot(instance);
    const sandbox = getExistingSandboxClient(instance).provider;
    try {
      if (
        sandbox.provider !== 'opensandbox' ||
        !('connectExisting' in sandbox) ||
        typeof sandbox.connectExisting !== 'function' ||
        !(await sandbox.connectExisting())
      )
        throw new SandboxUnavailableError();
      const info = await sandbox.getInfo();
      if (info?.status.state !== 'Running') throw new SandboxUnavailableError();
      const discovered = await discoverSkillsInSandbox(sandbox, workDirectory);
      await lease.assertOwned();
      return {
        sandbox,
        sandboxId: instance.sandboxId,
        providerSandboxId: info.id,
        sessionId: String(instance._id),
        operationId: instance.operation?.id,
        workspaceGeneration: instance.workspaceGeneration,
        baseVersionId: instance.baseVersionId ? String(instance.baseVersionId) : undefined,
        skills: [skill],
        deployedSkills: discovered.map((item) => ({
          ...item,
          id: skillId,
          avatar: skill.avatar
        })),
        workDirectory,
        isReady: true
      };
    } catch (error) {
      await disconnectFromProviderSandbox(sandbox).catch(() => {});
      throw error;
    }
  });
}

export async function runEditDebugSandboxTool<T>({
  context,
  skillId,
  teamId,
  tmbId,
  execute
}: {
  context: AgentSandboxContext;
  skillId: string;
  teamId: string;
  tmbId: string;
  execute: () => Promise<T>;
}): Promise<T> {
  return withSandboxLease(`skill-edit-init:${skillId}`, async (lease) => {
    await authSkillByTmbId({ skillId, tmbId, per: WritePermissionVal });
    const instance = await resolveEditWorkspace({ skillId, teamId });
    if (
      !instance ||
      instance.sandboxId !== context.sandboxId ||
      instance.provider !== context.sandbox.provider ||
      instance.workspaceGeneration !== context.workspaceGeneration ||
      instance.status !== 'running' ||
      !isEditWorkspaceOperationComplete(instance)
    )
      throw new SandboxUnavailableError();
    await lease.assertOwned();
    const filter = {
      _id: instance._id,
      status: 'running',
      deleteTime: null,
      'operation.id': instance.operation?.id ?? { $exists: false }
    };
    const now = new Date();
    const claim = await MongoSandboxInstance.updateOne(filter, {
      $set: {
        status: 'provisioning',
        operation: {
          id: lease.token,
          type: 'debug',
          checkpoint: 'executing',
          startedAt: now,
          updatedAt: now,
          heartbeatAt: now,
          failureDisposition: 'unknown'
        }
      }
    });
    if (claim.matchedCount !== 1) throw new SandboxUnavailableError();
    const activeFilter = { _id: instance._id, 'operation.id': lease.token };
    context.operationId = lease.token;
    registerSandboxOperationHeartbeat(lease, {
      provider: instance.provider,
      sandboxId: instance.sandboxId,
      operationId: lease.token,
      operationType: 'debug'
    });
    try {
      const result = await execute();
      await lease.assertOwned();
      const completed = await MongoSandboxInstance.updateOne(activeFilter, {
        $set: {
          status: 'running',
          'operation.checkpoint': 'ready',
          'operation.updatedAt': new Date(),
          'operation.failureDisposition': 'retryable',
          lastActiveAt: new Date()
        }
      });
      if (completed.matchedCount !== 1) throw new SandboxUnavailableError();
      return result;
    } catch (error) {
      await MongoSandboxInstance.updateOne(activeFilter, {
        $set: {
          status: 'failed',
          'operation.updatedAt': new Date(),
          'operation.error': {
            code: 'sandbox_unavailable',
            message: 'Skill debug did not complete; workspace retained'
          },
          'operation.failureDisposition': 'unknown'
        }
      }).catch(() => {});
      if (isSandboxInfrastructureError(error)) throw new SandboxUnavailableError();
      throw error;
    }
  });
}

/**
 * 只断开连接，不销毁沙箱。
 */
export async function disconnectEditDebugSandbox(ctx: AgentSandboxContext): Promise<void> {
  try {
    await disconnectFromProviderSandbox(ctx.sandbox);
    logger.info('[Agent Sandbox] Disconnected from edit-debug sandbox', {
      providerSandboxId: ctx.providerSandboxId
    });
  } catch (error) {
    logger.error('[Agent Sandbox] Failed to disconnect from edit-debug sandbox', { error });
  }
}
