import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { NextApiRequest } from 'next';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { TeamReadPermissionVal } from '@fastgpt/global/support/permission/user/constant';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const { teamId } = await authUserPer({ req, authToken: true, per: TeamReadPermissionVal });

  const count = await MongoTeamMember.countDocuments({
    teamId
  });

  return {
    count
  };
}

export default NextAPI(handler);
