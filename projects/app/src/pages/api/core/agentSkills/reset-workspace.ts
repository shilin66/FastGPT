import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  ResetSkillWorkspaceBodySchema,
  ResetSkillWorkspaceResponseSchema,
  type ResetSkillWorkspaceBody
} from '@fastgpt/global/openapi/core/agentSkills/api';
import { resetEditWorkspace } from '@fastgpt/service/core/agentSkills/editWorkspace/service';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { isValidObjectId } from 'mongoose';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';

async function handler(req: ApiRequestProps<ResetSkillWorkspaceBody>) {
  const body = ResetSkillWorkspaceBodySchema.parse(req.body);
  if (!isValidObjectId(body.skillId)) throw SkillErrEnum.invalidSkillId;
  const { teamId } = await authSkill({
    req,
    skillId: body.skillId,
    per: ManagePermissionVal,
    authToken: true,
    authApiKey: true
  });
  return ResetSkillWorkspaceResponseSchema.parse(await resetEditWorkspace({ ...body, teamId }));
}

export default NextAPI(handler);
