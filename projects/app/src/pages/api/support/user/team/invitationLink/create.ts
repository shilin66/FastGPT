import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { InvitationLinkCreateType } from '@fastgpt/service/support/user/team/invitationLink/type';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoInvitationLink } from '@fastgpt/service/support/user/team/invitationLink/schema';
import { TeamManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';

async function handler(req: ApiRequestProps<InvitationLinkCreateType>, res: ApiResponseType<any>) {
  const { description, expires, usedTimesLimit } = req.body;

  const { teamId } = await authUserPer({ req, authToken: true, per: TeamManagePermissionVal });

  // expires 为 '30m' | '7d' | '1y'
  const expiresDate =
    expires === '30m'
      ? new Date(Date.now() + 30 * 60 * 1000)
      : expires === '7d'
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        : expires === '1y'
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          : new Date();
  const invitationLink = await MongoInvitationLink.create({
    teamId,
    description,
    expires: expiresDate,
    usedTimesLimit,
    forbidden: false,
    members: []
  });

  const domain = req.headers.host;
  return `https://${domain}/account/team?invitelinkid=${invitationLink.linkId}`;
}

export default NextAPI(handler);
