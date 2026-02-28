import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { NextApiRequest } from 'next';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getTeamMembers } from '@fastgpt/service/support/user/team/controller';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { TeamReadPermissionVal } from '@fastgpt/global/support/permission/user/constant';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const { pageSize = 20, offset } = parsePaginationRequest(req);
  const { status, withPermission, withOrgs, searchKey, orgId, groupId } = req.body;
  const { teamId } = await authUserPer({ req, authToken: true, per: TeamReadPermissionVal });
  return await getTeamMembers(
    teamId,
    pageSize,
    offset,
    status,
    withPermission,
    withOrgs,
    searchKey,
    orgId,
    groupId
  );
}

export default NextAPI(handler);
