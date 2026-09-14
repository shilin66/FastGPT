import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { setCurrentVersion } from '@fastgpt/service/core/agentSkills/version/current';
import { validateSkillVersionPackage } from '@fastgpt/service/core/agentSkills/version/validate';
import {
  type SwitchSkillVersionBody,
  type SwitchSkillVersionResponse
} from '@fastgpt/global/openapi/core/agentSkills/api';

export type { SwitchSkillVersionBody, SwitchSkillVersionResponse };

async function handler(
  req: ApiRequestProps<SwitchSkillVersionBody>
): Promise<SwitchSkillVersionResponse> {
  const { skillId, versionId } = req.body;
  const { skill } = await authSkill({
    skillId,
    req,
    per: WritePermissionVal,
    authToken: true,
    authApiKey: true
  });

  await validateSkillVersionPackage({ skillId, versionId });

  await mongoSessionRun(async (session) => {
    await setCurrentVersion({
      skillId,
      versionId,
      expectedCurrentVersionId: skill.currentVersionId ? String(skill.currentVersionId) : null,
      session
    });
  });

  return;
}

export default NextAPI(handler);
