import type { NextApiResponse } from 'next';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { getSkillChatScope } from '@fastgpt/service/core/agentSkills/chat';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import type { SkillDebugSessionListResponse } from '@fastgpt/global/core/agentSkills/api';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS);

async function handler(req: ApiRequestProps, _res: NextApiResponse) {
  const { skillId } = req.query as { skillId: string };

  // Authenticate skill access
  const { teamId } = await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: WritePermissionVal
  });

  const { pageSize, offset } = parsePaginationRequest(req);
  const scope = { ...getSkillChatScope({ skillId, teamId }), appId: skillId, deleteTime: null };

  logger.debug('Listing skill debug sessions', { skillId, pageSize, offset });

  const [list, total] = await Promise.all([
    MongoChat.find(scope, 'chatId title updateTime')
      .sort({ updateTime: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoChat.countDocuments(scope)
  ]);

  const result: SkillDebugSessionListResponse = {
    list: list.map((item) => ({
      chatId: item.chatId,
      title: item.title,
      updateTime: item.updateTime.toISOString()
    })),
    total
  };

  return result;
}

export default NextAPI(handler);
