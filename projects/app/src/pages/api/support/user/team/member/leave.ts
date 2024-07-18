import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { NextApiRequest } from 'next';
import { leaveTeam } from '@fastgpt/service/support/user/team/controller';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const teamId = req.query.teamId as string;
  const { userId } = await parseHeaderCert({ req, authToken: true });
  return await leaveTeam(teamId, userId);
}

export default NextAPI(handler);
