import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { listMemberClbs } from '@fastgpt/service/support/user/team/controller';
import type { NextApiRequest } from 'next';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const { teamId, tmbId } = await parseHeaderCert({ req, authToken: true });

  return await listMemberClbs(teamId, tmbId);
}

export default NextAPI(handler);
