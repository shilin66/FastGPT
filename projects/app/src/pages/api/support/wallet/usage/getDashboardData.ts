import { NextAPI } from '@/service/middleware/entry';
import type { GetUsageDashboardProps } from '@fastgpt/global/support/wallet/usage/api';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { getUsageDashboardData } from '@fastgpt/service/support/wallet/usage/controller';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';

async function handler(req: ApiRequestProps<GetUsageDashboardProps>, _res: ApiResponseType<any>) {
  const { userId, isRoot, teamId } = await parseHeaderCert({ req, authToken: true });
  if (!userId) {
    throw new Error('user not found');
  }
  return await getUsageDashboardData(req.body, teamId);
}

export default NextAPI(handler);
