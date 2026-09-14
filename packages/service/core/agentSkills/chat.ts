import { UserError } from '@fastgpt/global/common/error/utils';
import type { ChatSourceScope } from '@fastgpt/global/core/chat/type';
import { MongoChat } from '../chat/chatSchema';
import { MongoApp } from '../app/schema';

export const getSkillChatScope = ({
  skillId,
  teamId
}: {
  skillId: string;
  teamId: string;
}): ChatSourceScope => ({
  teamId,
  sourceType: 'skillEdit',
  sourceId: skillId
});

export const assertSkillChatSession = async ({
  skillId,
  teamId,
  chatId,
  requireExisting = false
}: {
  skillId: string;
  teamId: string;
  chatId: string;
  requireExisting?: boolean;
}) => {
  const [chat, app] = await Promise.all([
    MongoChat.findOne({ appId: skillId, chatId })
      .select('teamId sourceType sourceId +deleteTime')
      .lean(),
    MongoApp.exists({ _id: skillId })
  ]);
  if (
    app ||
    (requireExisting && !chat) ||
    (chat &&
      (String(chat.teamId) !== teamId ||
        chat.sourceType !== 'skillEdit' ||
        String(chat.sourceId) !== skillId ||
        chat.deleteTime))
  ) {
    throw new UserError('Skill debug session is unavailable or has an ambiguous legacy source');
  }
};
