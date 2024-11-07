import { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { changeAppOwner } from '@fastgpt/service/support/permission/app/controller';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { AppChangeOwnerBody } from '@/global/core/app/api';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const { appId, ownerId } = req.body as AppChangeOwnerBody;

  await authApp({ req, authToken: true, appId, per: OwnerPermissionVal });

  return changeAppOwner(appId, ownerId);
}

export default NextAPI(handler);
