import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { PresignChatFileGetUrlSchema } from '@fastgpt/global/openapi/core/chat/file/api';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { assertSkillChatSession } from '@fastgpt/service/core/agentSkills/chat';
import { assertSkillAttachmentKey } from '@fastgpt/service/core/agentSkills/attachments';
import { UserError } from '@fastgpt/global/common/error/utils';

async function handler(req: ApiRequestProps): Promise<string> {
  const { key, appId, mode, outLinkAuthData, sourceType, chatId } =
    PresignChatFileGetUrlSchema.parse(req.body);

  if (sourceType === 'skillEdit') {
    if (!chatId) throw new UserError('chatId is required');
    const { teamId, tmbId } = await authSkill({
      req,
      authToken: true,
      authApiKey: true,
      skillId: appId,
      per: WritePermissionVal
    });
    await assertSkillChatSession({ skillId: appId, teamId, chatId });
    assertSkillAttachmentKey({ key, skillId: appId, chatId, tmbId });
  } else
    await authChatCrud({
      req,
      authToken: true,
      authApiKey: true,
      appId,
      ...outLinkAuthData
    });

  const { url } = await getS3ChatSource().createGetChatFileURL({ key, external: true, mode });

  return url;
}

export default NextAPI(handler);
