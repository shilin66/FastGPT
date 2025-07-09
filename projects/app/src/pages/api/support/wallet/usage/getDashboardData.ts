import { NextAPI } from '@/service/middleware/entry';
import type { GetUsageDashboardProps } from '@fastgpt/global/support/wallet/usage/api';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { getUsageDashboardData } from '@fastgpt/service/support/wallet/usage/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamReadPermissionVal } from '@fastgpt/global/support/permission/user/constant';

async function handler(req: ApiRequestProps<GetUsageDashboardProps>, _res: ApiResponseType<any>) {
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

  return await getUsageDashboardData(req.body, teamId);
}

export default NextAPI(handler);
