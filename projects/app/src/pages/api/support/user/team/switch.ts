import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { switchTeam } from '@fastgpt/service/support/user/team/controller';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { setCookie } from '@fastgpt/service/support/permission/controller';
import { NextApiRequest } from 'next';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const { teamId: newTeamId } = req.body as { teamId: string };
  const { userId, teamId: currentTeamId } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });
  if (!userId) {
    throw new Error('user not found');
  }
  const token = await switchTeam(newTeamId, userId, currentTeamId);
  setCookie(res, token);
}

export default NextAPI(handler);
