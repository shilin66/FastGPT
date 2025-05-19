import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoInvitationLink } from '@fastgpt/service/support/user/team/invitationLink/schema';
import { TeamManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';

async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  const { linkId } = req.body;

  const { teamId } = await authUserPer({ req, authToken: true, per: TeamManagePermissionVal });

  await MongoInvitationLink.updateOne({ linkId, teamId }, { forbidden: true });
}

export default NextAPI(handler);
