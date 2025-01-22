import { MongoUser } from '@fastgpt/service/support/user/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { UserUpdateParams } from '@/types/user';

/* update user info */
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import ConfluenceClient from '@fastgpt/service/common/confluence/client';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { refreshSourceAvatar } from '@fastgpt/service/common/file/image/controller';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';

export type UserAccountUpdateQuery = {};
export type UserAccountUpdateBody = UserUpdateParams;
export type UserAccountUpdateResponse = {};

async function handler(
  req: ApiRequestProps<UserAccountUpdateBody, UserAccountUpdateQuery>,
  _res: ApiResponseType<any>
): Promise<UserAccountUpdateResponse> {
  const { avatar, timezone, confluenceAccount } = req.body;

  const { tmbId } = await authCert({ req, authToken: true });
  // const user = await getUserDetail({ tmbId });

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
  await mongoSessionRun(async (session) => {
    const tmb = await MongoTeamMember.findById(tmbId).session(session);
    if (timezone || confluenceAccount) {
      await MongoUser.updateOne(
        {
          _id: tmb?.userId
        },
        {
          timezone,
          confluenceAccount:
            confluenceAccount?.apiToken && confluenceAccount?.account ? confluenceAccount : null
        }
      ).session(session);
    }

    // if avatar, update team member avatar
    if (avatar) {
      await MongoTeamMember.updateOne(
        {
          _id: tmbId
        },
        {
          avatar
        }
      ).session(session);
      await refreshSourceAvatar(avatar, tmb?.avatar, session);
    }
  });

  return {};
}
export default NextAPI(handler);
