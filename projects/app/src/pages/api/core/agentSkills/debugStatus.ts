import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { SkillDebugStatusQuerySchema } from '@fastgpt/global/openapi/core/agentSkills/api';
import { assertSkillChatSession } from '@fastgpt/service/core/agentSkills/chat';
import { getSkillDebugRunStatus } from '@fastgpt/service/core/agentSkills/debugRun';

export default NextAPI(async (req: ApiRequestProps) => {
  const { skillId, chatId } = SkillDebugStatusQuerySchema.parse(req.query);
  const { teamId } = await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: WritePermissionVal
  });
  await assertSkillChatSession({ skillId, teamId, chatId });
  return getSkillDebugRunStatus({ skillId, teamId, chatId });
});
