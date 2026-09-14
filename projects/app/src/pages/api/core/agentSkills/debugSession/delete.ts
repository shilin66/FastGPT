import type { NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import type { SkillDebugSessionDeleteBody } from '@fastgpt/global/core/agentSkills/api';
import { getSkillChatScope, assertSkillChatSession } from '@fastgpt/service/core/agentSkills/chat';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS);

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const { skillId, chatId } = req.body as SkillDebugSessionDeleteBody;

  if (!skillId) throw new UserError('skillId is required');
  if (!chatId) throw new UserError('chatId is required');

  // Authenticate skill access — write permission required for deletion
  const { teamId } = await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: WritePermissionVal
  });
  await assertSkillChatSession({ skillId, teamId, chatId });

  logger.debug('Deleting skill debug session', { skillId, chatId });

  // Soft delete: set deleteTime
  await MongoChat.updateOne(
    { appId: skillId, chatId, ...getSkillChatScope({ skillId, teamId }) },
    { $set: { deleteTime: new Date() } }
  );

  jsonRes(res);
}

export default NextAPI(handler);
