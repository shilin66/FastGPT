import { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { deleteAppCollaborators } from '@fastgpt/service/support/permission/app/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const appId = req.query.appId as string;
  const tmbId = req.query.tmbId as string;

  await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  await deleteAppCollaborators(appId, tmbId);
}

export default NextAPI(handler);
