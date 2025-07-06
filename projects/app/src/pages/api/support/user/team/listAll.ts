import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { listAllTeam } from '@fastgpt/service/support/user/team/controller';
import type { NextApiRequest } from 'next';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const { pageSize = 10, offset } = parsePaginationRequest(req);
  const { userId, isRoot } = await parseHeaderCert({ req, authToken: true });
  if (!userId) {
    throw new Error('user not found');
  }
  if (!isRoot) {
    return Promise.reject('permission denied');
  }
  return await listAllTeam(offset, pageSize);
}

export default NextAPI(handler);
