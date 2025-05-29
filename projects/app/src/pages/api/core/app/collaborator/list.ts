import type { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { listAppCollaborator } from '@fastgpt/service/support/permission/app/controller';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const appId = req.query.appId as string;

  await authApp({ req, authToken: true, appId, per: ReadPermissionVal });

  return listAppCollaborator(appId);
}

export default NextAPI(handler);
