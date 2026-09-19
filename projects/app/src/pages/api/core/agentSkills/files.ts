import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { SkillWorkspaceFileBodySchema } from '@fastgpt/global/openapi/core/agentSkills/files';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { resolveEditWorkspace } from '@fastgpt/service/core/agentSkills/editWorkspace/entity';
import { getExistingSandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import {
  disconnectFromProviderSandbox,
  getSkillEditWorkspaceRoot
} from '@fastgpt/service/core/agentSkills/sandboxConfig';
import { operateSkillWorkspaceFiles } from '@fastgpt/service/core/agentSkills/editWorkspace/files';
import { withSandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';
import { runEditDebugSandboxTool } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/lifecycle';
import { UserError } from '@fastgpt/global/common/error/utils';

export default NextAPI(async (req: NextApiRequest) => {
  const request = SkillWorkspaceFileBodySchema.parse(req.body);
  const { teamId, tmbId } = await authSkill({
    req,
    skillId: request.skillId,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal
  });
  const instance = await resolveEditWorkspace({ skillId: request.skillId, teamId });
  if (
    !instance ||
    !(
      instance.status === 'running' ||
      (instance.status === 'provisioning' && instance.operation?.type === 'debug')
    )
  )
    throw new UserError('workspace_not_running');
  const sandbox = getExistingSandboxClient(instance).provider;
  if (
    !('connectExisting' in sandbox) ||
    typeof sandbox.connectExisting !== 'function' ||
    !(await sandbox.connectExisting())
  )
    throw new UserError('workspace_not_running');
  try {
    const workspaceRoot = getSkillEditWorkspaceRoot(instance);
    const execute = async () => {
      try {
        return {
          data: await operateSkillWorkspaceFiles({ provider: sandbox, workspaceRoot, request })
        };
      } catch (error) {
        if (error instanceof UserError) return { error };
        throw error;
      }
    };
    const result =
      request.action !== 'write'
        ? await execute()
        : await withSandboxLease(`skill-edit-activity:${request.skillId}`, () =>
            runEditDebugSandboxTool({
              skillId: request.skillId,
              teamId,
              tmbId,
              execute,
              context: {
                sandbox,
                sandboxId: instance.sandboxId,
                providerSandboxId: instance.sandboxId,
                sessionId: String(instance._id),
                workspaceGeneration: instance.workspaceGeneration,
                workDirectory: workspaceRoot,
                skills: [],
                deployedSkills: [],
                isReady: true
              }
            })
          );
    if (result.error) throw result.error;
    return result.data;
  } finally {
    await disconnectFromProviderSandbox(sandbox);
  }
});
