import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { publishEditWorkspace } from '@fastgpt/service/core/agentSkills/editWorkspace/service';
import {
  SaveDeploySkillBodySchema,
  SaveDeploySkillResponseSchema
} from '@fastgpt/global/openapi/core/agentSkills/api';
import type {
  SaveDeploySkillBody,
  SaveDeploySkillResponse
} from '@fastgpt/global/core/agentSkills/api';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { isValidObjectId } from 'mongoose';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

/**
 * Package and deploy a skill from sandbox, creating a new version.
 */
async function handler(
  req: ApiRequestProps<SaveDeploySkillBody>
): Promise<SaveDeploySkillResponse> {
  const body = SaveDeploySkillBodySchema.parse(req.body);
  const { skillId } = body;

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  // Verify write permission via authSkill (replaces authUserPer + canModifySkill)
  const { teamId, tmbId, skill } = await authSkill({
    req,
    skillId,
    per: WritePermissionVal,
    authToken: true,
    authApiKey: true
  });

  const response = await publishEditWorkspace({ ...body, teamId, tmbId });

  // Record audit log asynchronously to avoid blocking the response
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DEPLOY_SKILL,
      params: { skillName: skill.name, skillType: getI18nSkillType(skill.type) }
    });
  })();

  return SaveDeploySkillResponseSchema.parse(response);
}

export default NextAPI(handler);
