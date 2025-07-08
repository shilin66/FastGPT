import { NextAPI } from '@/service/middleware/entry';
import type { PaginationProps } from '@fastgpt/web/common/fetch/type';
import type { GetUsageProps } from '@fastgpt/global/support/wallet/usage/api';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { getUsages } from '@fastgpt/service/support/wallet/usage/controller';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';

async function handler(
  req: ApiRequestProps<PaginationProps<GetUsageProps>>,
  _res: ApiResponseType<any>
) {
  const { offset, pageSize } = parsePaginationRequest(req);
  const { userId, isRoot, teamId } = await parseHeaderCert({ req, authToken: true });
  if (!userId) {
    throw new Error('user not found');
  }
  return await getUsages(req.body, teamId, offset, pageSize);
}

export default NextAPI(handler);
