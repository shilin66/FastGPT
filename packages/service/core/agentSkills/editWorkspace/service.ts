import type { SkillEditWorkspace } from '@fastgpt/global/core/agentSkills/workspace';
import { EditWorkspaceIdentityConflict, resolveEditWorkspace, claimEditWorkspace } from './entity';
import {
  projectEditWorkspaceState,
  getEditWorkspaceVolume,
  isEditWorkspaceOperationComplete
} from './utils';
import { withSandboxLease } from '../../ai/sandbox/lease';
import { MongoAgentSkills } from '../schema';
import { packageSkillInSandbox } from '../sandboxController';
import { publishSkillPackage } from '../version/publish';
import { UserError } from '@fastgpt/global/common/error/utils';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import type {
  SaveDeploySkillBody,
  ResetSkillWorkspaceBody
} from '@fastgpt/global/openapi/core/agentSkills/api';
import { getExistingSandboxClient } from '../../ai/sandbox/controller';
import { getCurrentVersion } from '../version/current';
import { downloadSkillPackage } from '../storage';
import { SkillPackageValidationError, validateAndNormalizeSkillPackage } from '../packageValidator';
import { assertEditWorkspacePersistentMount, resetEditSandboxWorkspace } from '../sandboxWorkspace';
import {
  buildBaseContainerEnv,
  getProviderSandboxEndpoint,
  getSandboxDefaults,
  waitForSkillEditorReady,
  disconnectFromProviderSandbox
} from '../sandboxConfig';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoSandboxInstance } from '../../ai/sandbox/schema';
import { env } from '../../../env';
import { SkillTerminalActivityError } from '../../ai/sandbox/terminal';

export const resetEditWorkspace = async (params: ResetSkillWorkspaceBody & { teamId: string }) =>
  withSandboxLease(`skill-edit-activity:${params.skillId}`, () =>
    withSandboxLease(`skill-edit-init:${params.skillId}`, async (lease) => {
      const instance = await resolveEditWorkspace(params);
      if (
        !instance ||
        env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME !== 'docker' ||
        instance.provider !== 'opensandbox' ||
        instance.status !== 'running' ||
        !isEditWorkspaceOperationComplete(instance)
      )
        throw new UserError('workspace_reset_unavailable');
      const binding = getEditWorkspaceVolume(instance);
      if (!binding) throw new UserError('workspace_not_persistent');
      if (
        (instance.baseVersionId ? String(instance.baseVersionId) : null) !==
          params.expectedBaseVersionId ||
        (instance.operation?.id ?? null) !== params.expectedOperationId
      )
        throw new UserError('workspace_conflict');
      const version = await getCurrentVersion(params.skillId);
      if (!version || String(version._id) !== params.expectedCurrentVersionId)
        throw new UserError(SkillErrEnum.versionConflict);
      const validated = await validateAndNormalizeSkillPackage(
        await downloadSkillPackage({ storageInfo: version.storage }),
        { allowEmptyWorkspace: true }
      );
      if (version.contentHash && version.contentHash !== validated.contentHash)
        throw new UserError(SkillErrEnum.invalidSkillPackage);
      const client = getExistingSandboxClient(instance);
      const oldProvider = client.provider;
      if (
        !('connectExisting' in oldProvider) ||
        typeof oldProvider.connectExisting !== 'function' ||
        !(await oldProvider.connectExisting())
      )
        throw new UserError('workspace_not_running');
      const info = await oldProvider.getInfo();
      if (
        !info ||
        info.status.state !== 'Running' ||
        info.id !== instance.metadata?.providerSandboxId
      )
        throw new UserError('workspace_provider_changed');
      await assertEditWorkspacePersistentMount({
        provider: oldProvider,
        workDirectory: binding.root,
        mountPath: binding.volume.mountPath,
        claimName: binding.volume.claimName!,
        assertActive: lease.assertOwned
      });
      const operation = await claimEditWorkspace({
        instance,
        lease,
        type: 'resetWorkspace',
        expectedCurrentVersion: {
          skillId: params.skillId,
          teamId: params.teamId,
          versionId: params.expectedCurrentVersionId
        }
      });
      try {
        const defaults = getSandboxDefaults();
        const editor = await client.maintainWorkspace({
          instance,
          assertActive: operation.assertActive,
          checkpoint: operation.checkpoint,
          remoteEffect: operation.remoteEffect,
          createConfig: {
            image: info.image,
            entrypoint: info.entrypoint,
            resourceLimits: info.resourceLimits,
            env: buildBaseContainerEnv(instance.sandboxId, binding.root, true),
            metadata: {
              skillId: params.skillId,
              teamId: params.teamId,
              sandboxType: 'edit-debug',
              sessionId: instance.sandboxId
            },
            volumes: [
              {
                name: binding.volume.name,
                mountPath: binding.volume.mountPath,
                pvc: { claimName: binding.volume.claimName! }
              }
            ]
          },
          maintain: async (provider) => {
            await assertEditWorkspacePersistentMount({
              provider,
              workDirectory: binding.root,
              mountPath: binding.volume.mountPath,
              claimName: binding.volume.claimName!,
              assertActive: operation.assertActive
            });
            const resetId = operation.instance.workspaceGeneration;
            if (!resetId) throw new UserError('workspace_conflict');
            await operation.checkpoint('workspace_stage', {
              'metadata.resetBackupRoot': `${binding.volume.mountPath}/.skill-edit-reset-${resetId}`
            });
            const { backupRoot } = await operation.remoteEffect(() =>
              resetEditSandboxWorkspace({
                provider,
                workDirectory: binding.root,
                resetId,
                skillPackage: {
                  skillId: params.skillId,
                  versionId: String(version._id),
                  contentHash: validated.contentHash,
                  packageBuffer: validated.zipBuffer
                },
                assertActive: operation.assertActive
              })
            );
            await operation.checkpoint('workspace_exchanged', {
              'metadata.resetBackupRoot': backupRoot
            });
            await mongoSessionRun(async (session) => {
              await operation.assertActive();
              const current = await MongoAgentSkills.updateOne(
                {
                  _id: params.skillId,
                  teamId: params.teamId,
                  deleteTime: null,
                  currentVersionId: params.expectedCurrentVersionId
                },
                { $set: { updateTime: new Date() } },
                { session }
              );
              if (current.matchedCount !== 1) throw new UserError(SkillErrEnum.versionConflict);
              const baseline = await MongoSandboxInstance.updateOne(
                {
                  ...operation.filter,
                  baseVersionId: params.expectedBaseVersionId,
                  'operation.checkpoint': 'workspace_exchanged'
                },
                {
                  $set: {
                    baseVersionId: version._id,
                    currentDeploymentHash: validated.contentHash,
                    'operation.checkpoint': 'baseline_committed',
                    'operation.updatedAt': new Date()
                  }
                },
                { session }
              );
              if (baseline.matchedCount !== 1) throw new UserError('workspace_conflict');
              await lease.assertOwned();
            });
          }
        });
        const endpoint = await getProviderSandboxEndpoint(editor, defaults.targetPort);
        await waitForSkillEditorReady(editor);
        await operation.checkpoint('ready', {
          status: 'running',
          lastActiveAt: new Date(),
          'operation.failureDisposition': 'retryable',
          'metadata.endpoint': endpoint
        });
        return {
          workspace: await getEditWorkspaceState({
            ...params,
            currentVersionId: String(version._id)
          })
        };
      } catch (error) {
        await operation.fail().catch(() => {});
        throw error;
      } finally {
        await disconnectFromProviderSandbox(oldProvider).catch(() => {});
      }
    })
  );

export const publishEditWorkspace = async (
  params: SaveDeploySkillBody & { teamId: string; tmbId: string }
) =>
  withSandboxLease(`skill-edit-activity:${params.skillId}`, () =>
    withSandboxLease(`skill-edit-init:${params.skillId}`, async (lease) => {
      const instance = await resolveEditWorkspace(params);
      if (!instance || instance.status !== 'running') throw new UserError('workspace_not_running');
      const skill = await MongoAgentSkills.findOne({
        _id: params.skillId,
        teamId: params.teamId,
        deleteTime: null
      }).lean();
      if (
        !skill ||
        (skill.currentVersionId ? String(skill.currentVersionId) : null) !==
          params.expectedCurrentVersionId
      )
        throw new UserError(SkillErrEnum.versionConflict);
      if (
        (instance.baseVersionId ? String(instance.baseVersionId) : null) !==
        params.expectedBaseVersionId
      )
        throw new UserError('workspace_conflict');
      const operation = await claimEditWorkspace({
        instance,
        lease,
        type: 'publish',
        expectedCurrentVersion: {
          skillId: params.skillId,
          teamId: params.teamId,
          versionId: params.expectedCurrentVersionId
        }
      });
      try {
        const packageBuffer = await packageSkillInSandbox({
          sandboxId: instance.sandboxId,
          lease,
          operationId: lease.token,
          assertActive: operation.assertActive
        });
        await operation.checkpoint('package_ready');
        const published = await publishSkillPackage({
          ...params,
          packageBuffer,
          workspace: {
            instanceId: String(instance._id),
            sandboxId: instance.sandboxId,
            operationId: lease.token,
            generation: instance.workspaceGeneration,
            expectedBaseVersionId: params.expectedBaseVersionId,
            assertActive: lease.assertOwned,
            markExternalEffect: operation.markRemoteEffect
          }
        });
        return {
          skillId: params.skillId,
          ...published,
          workspace: await getEditWorkspaceState({
            ...params,
            currentVersionId: published.versionId
          })
        };
      } catch (error) {
        await operation
          .fail({
            invalidPackage: error instanceof SkillPackageValidationError,
            terminalRejection:
              error instanceof SkillTerminalActivityError ? error.reason : undefined
          })
          .catch(() => {});
        throw error;
      }
    })
  );

export const getEditWorkspaceState = async (params: {
  skillId: string;
  teamId: string;
  currentVersionId: string | null;
}): Promise<SkillEditWorkspace> => {
  try {
    return projectEditWorkspaceState({
      instance: await resolveEditWorkspace(params),
      currentVersionId: params.currentVersionId,
      providerRuntime: env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME
    });
  } catch (error) {
    if (!(error instanceof EditWorkspaceIdentityConflict)) throw error;
    return {
      status: 'conflict',
      baseVersionId: null,
      currentVersionId: params.currentVersionId,
      stale: true,
      resetAvailable: false,
      resetUnavailableReason: 'identity_conflict'
    };
  }
};
