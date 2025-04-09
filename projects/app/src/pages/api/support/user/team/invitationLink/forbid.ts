import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoInvitationLink } from '@fastgpt/service/support/user/team/invitationLink/schema';

async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  const { linkId } = req.body;

  const { teamId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  await MongoInvitationLink.updateOne({ linkId, teamId }, { forbidden: true });
}

export default NextAPI(handler);
