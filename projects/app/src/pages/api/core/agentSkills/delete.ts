import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { deleteSkill } from '@fastgpt/service/core/agentSkills/controller';
import type { DeleteSkillQuery } from '@fastgpt/global/core/agentSkills/api';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { isValidObjectId } from 'mongoose';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { addAgentSkillDeleteJob } from '@fastgpt/service/core/agentSkills/delete';

async function handler(req: ApiRequestProps<{}, DeleteSkillQuery>) {
  const { skillId } = req.query;

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  const { teamId, tmbId, skill } = await authSkill({
    req,
    skillId,
    per: ManagePermissionVal,
    authToken: true,
    authApiKey: true
  });

  const deletion = await mongoSessionRun(async (session) => {
    return deleteSkill({ skillId, teamId }, session);
  });
  await addAgentSkillDeleteJob(deletion);

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_SKILL,
      params: { skillName: skill.name, skillType: getI18nSkillType(skill.type) }
    });
  })();
}

export default NextAPI(handler);
