import { NextAPI } from '@/service/middleware/entry';
import type {
  RetryInitializeSkillBody,
  RetryInitializeSkillResponse
} from '@fastgpt/global/core/agentSkills/api';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { retryAgentSkillInitialization } from '@fastgpt/service/core/agentSkills/initialize';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

async function handler(
  req: ApiRequestProps<RetryInitializeSkillBody>
): Promise<RetryInitializeSkillResponse> {
  const { skillId } = req.body;
  const { teamId, tmbId } = await authSkill({
    req,
    skillId,
    per: WritePermissionVal,
    authToken: true,
    authApiKey: true
  });

  const operationId = await retryAgentSkillInitialization({ skillId, teamId, tmbId });
  return { operationId };
}

export default NextAPI(handler);
