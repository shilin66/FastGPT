import type { NextApiResponse } from 'next';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getSkillChatScope, assertSkillChatSession } from '@fastgpt/service/core/agentSkills/chat';
import { UserError } from '@fastgpt/global/common/error/utils';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import type { SkillDebugDeleteChatItemBody } from '@fastgpt/global/core/agentSkills/api';

async function handler(req: ApiRequestProps<SkillDebugDeleteChatItemBody>, _res: NextApiResponse) {
  const { skillId, chatId, contentId } = req.body;

  if (!skillId) throw new UserError('skillId is required');
  if (!chatId) throw new UserError('chatId is required');
  if (!contentId) throw new UserError('contentId is required');

  const { teamId } = await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: WritePermissionVal
  });
  await assertSkillChatSession({ skillId, teamId, chatId });

  await MongoChatItem.updateOne(
    {
      appId: skillId,
      chatId,
      ...getSkillChatScope({ skillId, teamId }),
      dataId: contentId
    },
    {
      $set: { deleteTime: new Date() }
    }
  );

  return;
}

export default NextAPI(handler);
