import { MongoUser } from '@fastgpt/service/support/user/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { UserUpdateParams } from '@/types/user';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';

/* update user info */
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import ConfluenceClient from '@fastgpt/service/common/confluence/client';
export type UserAccountUpdateQuery = {};
export type UserAccountUpdateBody = UserUpdateParams;
export type UserAccountUpdateResponse = {};
async function handler(
  req: ApiRequestProps<UserAccountUpdateBody, UserAccountUpdateQuery>,
  _res: ApiResponseType<any>
): Promise<UserAccountUpdateResponse> {
  const { avatar, timezone, confluenceAccount } = req.body;

  const { tmbId } = await authCert({ req, authToken: true });
  const tmb = await MongoTeamMember.findById(tmbId);
  if (!tmb) {
    throw new Error('can not find it');
  }
  const userId = tmb.userId;

  if (confluenceAccount?.apiToken) {
    console.log('auth user confluence apiToken');
    const baseURL = global.feConfigs.confluenceUrl;
    if (!baseURL) {
      return Promise.reject('The Confluence base URL is not configured');
    }
    const confluenceClient = new ConfluenceClient(
      baseURL,
      confluenceAccount.account,
      confluenceAccount.apiToken
    );
    try {
      await confluenceClient.getCurrentUser();
    } catch (e) {
      console.log('confluence auth error', e);
      return Promise.reject('Confluence API Token is invalid');
    }
  }

  // 更新对应的记录
  await MongoUser.updateOne(
    {
      _id: userId
    },
    {
      ...(avatar && { avatar }),
      ...(timezone && { timezone }),
      confluenceAccount:
        confluenceAccount?.apiToken && confluenceAccount?.account ? confluenceAccount : null
    }
  );

  return {};
}
export default NextAPI(handler);
