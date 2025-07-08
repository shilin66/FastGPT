import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { usageStats } from '@fastgpt/service/support/wallet/usage/controller';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';

async function handler(
  req: ApiRequestProps<{
    dateStart: string;
    dateEnd: string;
  }>,
  _res: ApiResponseType<any>
) {
  const { userId, isRoot } = await parseHeaderCert({ req, authToken: true });
  if (!userId) {
    throw new Error('user not found');
  }
  if (!isRoot) {
    return Promise.reject('permission denied');
  }
  return await usageStats(req.body);
}

export default NextAPI(handler);
