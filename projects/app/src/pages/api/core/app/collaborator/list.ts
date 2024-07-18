import { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { listAppCollaborator } from '@fastgpt/service/support/permission/app/controller';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const appId = req.query.appId as string;

  await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  return listAppCollaborator(appId);
}

export default NextAPI(handler);
