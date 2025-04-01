import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { InvitationLinkCreateType } from '@fastgpt/service/support/user/team/invitationLink/type';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoInvitationLink } from '@fastgpt/service/support/user/team/invitationLink/schema';

async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  const { teamId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  // list all
  const linkList = await MongoInvitationLink.find({ teamId }).lean();
  // list member invitation link
  return linkList;
}

export default NextAPI(handler);
