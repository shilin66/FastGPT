import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { getExistingSandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import { env } from '@fastgpt/service/env';
import {
  SandboxWorkspaceActionBodySchema,
  type SandboxWorkspaceActionBody
} from '@fastgpt/global/openapi/core/ai/sandbox/management';
import { authSandboxManagement } from '@/service/core/sandbox/management';
import { UserError } from '@fastgpt/global/common/error/utils';
import { withSandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';
import { assertSkillWorkspaceTerminalIdle } from '@fastgpt/service/core/ai/sandbox/terminal';
import { recoverSandboxWorkspace } from '@fastgpt/service/core/ai/sandbox/manualRecovery';

export default NextAPI(async (req: ApiRequestProps<SandboxWorkspaceActionBody>) => {
  const body = SandboxWorkspaceActionBodySchema.parse(req.body);
  const scope = { sourceType: body.sourceType, sourceId: body.sourceId };
  const { teamId } = await authSandboxManagement(req, scope);
  if (
    env.AGENT_SANDBOX_PROVIDER !== 'opensandbox' ||
    env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME !== 'docker'
  ) {
    throw new UserError('sandbox_management_docker_only');
  }
  const instance = await MongoSandboxInstance.findOne({
    provider: 'opensandbox',
    teamId,
    ...scope,
    sandboxId: body.sandboxId,
    ...(body.action === 'forceDelete'
      ? { $or: [{ deleteTime: null }, { status: 'deleting', forceDeletion: { $exists: true } }] }
      : { deleteTime: null })
  }).lean();
  if (
    !instance ||
    instance.sourceType !== scope.sourceType ||
    instance.sourceId !== scope.sourceId ||
    String(instance.teamId) !== String(teamId) ||
    instance.provider !== 'opensandbox' ||
    instance.sandboxId !== body.sandboxId
  ) {
    throw new UserError('sandbox_workspace_not_found');
  }
  const client = getExistingSandboxClient(instance);
  const assertAuthorized = async () => {
    const renewed = await authSandboxManagement(req, scope);
    if (String(renewed.teamId) !== String(teamId))
      throw new UserError('sandbox_workspace_not_found');
  };
  if (body.action === 'forceDelete') {
    if (instance.sourceType !== 'appRuntime' || !body.deletionRevision) {
      throw new UserError('sandbox_workspace_not_found');
    }
    return client.forceDelete({ deletionRevision: body.deletionRevision, assertAuthorized });
  }
  if (body.action === 'recover') {
    if (instance.sourceType !== 'appRuntime') throw new UserError('sandbox_recovery_unsupported');
    return recoverSandboxWorkspace(instance, {
      rebuildEmpty: body.rebuildEmpty,
      recoveryRevision: body.recoveryRevision,
      assertAuthorized
    });
  }
  const execute = async () => {
    if (instance.sourceType === 'skillEdit' && instance.status === 'running') {
      await assertSkillWorkspaceTerminalIdle(instance);
    }
    if (body.action === 'release') {
      await client.release({ assertAuthorized });
    } else {
      const providerId = instance.metadata?.providerSandboxId;
      const providerAlreadyDeleted =
        instance.status === 'deleting' &&
        instance.operation?.type === 'delete' &&
        ['provider_deleted', 'volume_deleted'].includes(instance.operation.checkpoint) &&
        instance.operation.failureDisposition === 'retryable';
      if (!instance.releasedAt && providerId && !providerAlreadyDeleted) {
        const provider = client.provider;
        if (!('inspectExisting' in provider) || typeof provider.inspectExisting !== 'function') {
          throw new UserError('sandbox_instance_unverified');
        }
        const remote = await provider.inspectExisting(providerId);
        if (!remote || remote.id !== providerId) throw new UserError('sandbox_instance_unverified');
      }
      await client.delete({ assertAuthorized });
    }
  };
  if (instance.sourceType === 'skillEdit') {
    await withSandboxLease(`skill-edit-activity:${instance.sourceId}`, execute);
  } else await execute();
  return { success: true };
});
