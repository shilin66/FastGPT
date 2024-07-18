import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { listUserTeam } from '@fastgpt/service/support/user/team/controller';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { NextApiRequest } from 'next';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const status = req.query.status as string;
  const { userId } = await authUserPer({ req, authToken: true, per: ReadPermissionVal });
  if (!userId) {
    throw new Error('user not found');
  }
  return await listUserTeam(status, userId);
}

export default NextAPI(handler);
