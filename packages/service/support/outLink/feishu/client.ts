import type { FeishuAppType } from '@fastgpt/global/support/outLink/type';
import { getFeishuClient } from './sdk';

type FeishuReceiveIdType = 'chat_id' | 'open_id' | 'user_id' | 'union_id' | 'email';

export const sendFeishuMarkdownMessage = async ({
  appConfig,
  receiveId,
  receiveIdType = 'chat_id',
  markdown,
  replyToMessageId,
  senderMention
}: {
  appConfig: FeishuAppType;
  receiveId: string;
  receiveIdType?: FeishuReceiveIdType;
  markdown: string;
  replyToMessageId?: string;
  senderMention?: string;
}) => {
  const client = getFeishuClient(appConfig);
  const content = JSON.stringify({
    schema: '2.0',
    body: {
      elements: [
        ...(senderMention ? [{ tag: 'markdown', content: senderMention }] : []),
        { tag: 'markdown', content: markdown }
      ]
    }
  });

  if (replyToMessageId) {
    return client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: { msg_type: 'interactive', content }
    });
  }

  return client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: { receive_id: receiveId, msg_type: 'interactive', content }
  });
};

export const getFeishuUserName = async ({
  appConfig,
  openId,
  userId
}: {
  appConfig: FeishuAppType;
  openId?: string;
  userId?: string;
}) => {
  const userIdentity = openId || userId;
  if (!userIdentity) return '';
  const client = getFeishuClient(appConfig);
  const response = await client.contact.user.get({
    params: { user_id_type: openId ? 'open_id' : 'user_id' },
    path: { user_id: userIdentity }
  });
  // const response = await client.contact.user.batch({
  //   params: {
  //     user_ids: [userIdentity],
  //     user_id_type: openId ? 'open_id' : 'user_id',
  //     department_id_type: 'department_id'
  //   }
  // });

  return response.data?.user?.name?.trim() || response.data?.user?.nickname?.trim() || '';
};
