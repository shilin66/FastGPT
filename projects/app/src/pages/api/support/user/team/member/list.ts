import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { NextApiRequest } from 'next';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getTeamMembers } from '@fastgpt/service/support/user/team/controller';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const { pageSize = 20, offset } = parsePaginationRequest(req);
  const { teamId } = await authUserPer({ req, authToken: true, per: ReadPermissionVal });
  return await getTeamMembers(teamId, pageSize, offset);
}

export default NextAPI(handler);
