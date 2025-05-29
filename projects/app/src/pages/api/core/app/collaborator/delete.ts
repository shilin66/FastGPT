import type { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { deleteAppCollaborators } from '@fastgpt/service/support/permission/app/controller';
import { authApp } from '@fastgpt/service/support/permission/app/auth';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const appId = req.query.appId as string;
  const tmbId = req.query.tmbId as string;
  const groupId = req.query.groupId as string;

  await authApp({ req, authToken: true, appId, per: ManagePermissionVal });

  await deleteAppCollaborators(appId, tmbId, groupId);
}

export default NextAPI(handler);
