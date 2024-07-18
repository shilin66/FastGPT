import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { InviteMemberProps } from '@fastgpt/global/support/user/team/controller';
import { inviteTeamMember } from '@fastgpt/service/support/user/team/controller';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextApiRequest } from 'next';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const inviteMemberReq = req.body as InviteMemberProps;

  await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  return await inviteTeamMember(inviteMemberReq);
}

export default NextAPI(handler);
