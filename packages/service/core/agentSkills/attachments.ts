import { UserError } from '@fastgpt/global/common/error/utils';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { getS3ChatSource } from '../../common/s3/sources/chat';
import { S3Sources } from '../../common/s3/contracts/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';

export const assertSkillAttachmentKey = ({
  key,
  skillId,
  chatId,
  tmbId
}: {
  key?: string;
  skillId: string;
  chatId: string;
  tmbId?: string;
}) => {
  const parts = key?.split('/') ?? [];
  if (
    parts.length !== 5 ||
    parts.some(
      (part) => !part || part === '.' || part === '..' || /[\\\u0000-\u001f]/.test(part)
    ) ||
    parts[0] !== S3Sources.chat ||
    parts[1] !== skillId ||
    parts[3] !== chatId ||
    (tmbId && parts[2] !== tmbId)
  ) {
    throw new UserError('Invalid Skill attachment scope');
  }
  return parts.join('/');
};

export const refreshSkillAttachments = async ({
  messages,
  skillId,
  chatId,
  tmbId
}: {
  messages: ChatItemMiniType[];
  skillId: string;
  chatId: string;
  tmbId?: string;
}) => {
  for (const message of messages) {
    if (message.obj !== ChatRoleEnum.Human) continue;
    for (const item of message.value) {
      if (!item.file) continue;
      const key = assertSkillAttachmentKey({ key: item.file.key, skillId, chatId, tmbId });
      // Only server-authorized object keys may become model/tool file URLs.
      item.file.url = (await getS3ChatSource().createGetChatFileURL({ key, external: false })).url;
    }
  }
};
