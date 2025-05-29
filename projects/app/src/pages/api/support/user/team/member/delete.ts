import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { deleteTeamMember } from '@fastgpt/service/support/user/team/controller';
import type { NextApiRequest } from 'next';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const tmbId = req.query.tmbId as string;

  await authUserPer({ req, authToken: true, per: TeamManagePermissionVal });

  await deleteTeamMember(tmbId);
}

export default NextAPI(handler);
