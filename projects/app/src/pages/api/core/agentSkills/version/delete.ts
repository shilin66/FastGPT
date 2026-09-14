import { NextAPI } from '@/service/middleware/entry';
import type {
  DeleteSkillVersionBody,
  DeleteSkillVersionResponse
} from '@fastgpt/global/openapi/core/agentSkills/api';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { addAgentSkillVersionCleanupJob } from '@fastgpt/service/core/agentSkills/version/cleanup';
import { softDeleteVersionById } from '@fastgpt/service/core/agentSkills/version/controller';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

async function handler(
  req: ApiRequestProps<DeleteSkillVersionBody>
): Promise<DeleteSkillVersionResponse> {
  const { skillId, versionId } = req.body;
  await authSkill({
    req,
    skillId,
    per: ManagePermissionVal,
    authToken: true,
    authApiKey: true
  });

  const deleteTime = new Date();
  await addAgentSkillVersionCleanupJob({
    skillId,
    versionId,
    deleteTime: deleteTime.toISOString()
  });
  await mongoSessionRun((session) =>
    softDeleteVersionById({ skillId, versionId, deleteTime, session })
  );
}

export default NextAPI(handler);
