import { NextAPI } from '@/service/middleware/entry';
import type { PaginationProps } from '@fastgpt/web/common/fetch/type';
import type { GetUsageProps } from '@fastgpt/global/support/wallet/usage/api';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { getUsages } from '@fastgpt/service/support/wallet/usage/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamReadPermissionVal } from '@fastgpt/global/support/permission/user/constant';

async function handler(
  req: ApiRequestProps<PaginationProps<GetUsageProps>>,
  _res: ApiResponseType<any>
) {
  const { offset, pageSize } = parsePaginationRequest(req);
  const { tmbId, isRoot, teamId, permission } = await authUserPer({
    req,
    authToken: true,
    per: TeamReadPermissionVal
  });
  if (!tmbId) {
    throw new Error('user not found');
  }
  if (!permission.hasManagePer) {
    req.body.teamMemberIds = [tmbId];
  }

  return await getUsages(req.body, teamId, offset, pageSize);
}

export default NextAPI(handler);
