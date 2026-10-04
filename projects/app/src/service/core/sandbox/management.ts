import type { NextApiRequest } from 'next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { SandboxWorkspaceActionBody } from '@fastgpt/global/openapi/core/ai/sandbox/management';

export const authSandboxManagement = async (
  req: NextApiRequest,
  scope: Pick<SandboxWorkspaceActionBody, 'sourceType' | 'sourceId'>
) => {
  if (scope.sourceType === 'appRuntime') {
    const { app, teamId } = await authApp({
      req,
      appId: scope.sourceId,
      per: WritePermissionVal,
      authToken: true,
      authApiKey: true
    });
    return { teamId, sourceName: app.name };
  }
  const { skill, teamId } = await authSkill({
    req,
    skillId: scope.sourceId,
    per: WritePermissionVal,
    authToken: true,
    authApiKey: true
  });
  return { teamId, sourceName: skill.name };
};
