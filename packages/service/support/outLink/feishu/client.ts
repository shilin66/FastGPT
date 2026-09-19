import type { FeishuAppType } from '@fastgpt/global/support/outLink/type';
import { getFeishuClient } from './sdk';

type FeishuReceiveIdType = 'chat_id' | 'open_id' | 'user_id' | 'union_id' | 'email';

export const sendFeishuMarkdownMessage = async ({
  appConfig,
  receiveId,
  receiveIdType = 'chat_id',
  markdown
}: {
  appConfig: FeishuAppType;
  receiveId: string;
  receiveIdType?: FeishuReceiveIdType;
  markdown: string;
}) => {
  const client = getFeishuClient(appConfig);

  return client.im.message.create({
    params: {
      receive_id_type: receiveIdType
    },
    data: {
      receive_id: receiveId,
      msg_type: 'interactive',
      content: JSON.stringify({
        schema: '2.0',
        body: {
          elements: [
            {
              tag: 'markdown',
              content: markdown
            }
          ]
        }
      })
    }
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
