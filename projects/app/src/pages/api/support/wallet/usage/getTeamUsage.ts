import { NextAPI } from '@/service/middleware/entry';
import type { PaginationProps } from '@fastgpt/web/common/fetch/type';
import type { GetTeamUsageProps } from '@fastgpt/global/support/wallet/usage/api';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { getTeamUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';

async function handler(
  req: ApiRequestProps<PaginationProps<GetTeamUsageProps>>,
  _res: ApiResponseType<any>
) {
  const { offset, pageSize } = parsePaginationRequest(req);
  const { userId, isRoot } = await parseHeaderCert({ req, authToken: true });
  if (!userId) {
    throw new Error('user not found');
  }
  if (!isRoot) {
    return Promise.reject('permission denied');
  }
  return await getTeamUsage(req.body, offset, pageSize);
}

export default NextAPI(handler);
