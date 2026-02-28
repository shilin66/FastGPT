import type { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { UpdateAppCollaboratorBody } from '@fastgpt/global/core/app/collaborator';
import { updateAppCollaborators } from '@fastgpt/service/support/permission/app/controller';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const body = req.body as UpdateAppCollaboratorBody;

  await authApp({ req, authToken: true, appId: body.appId, per: ManagePermissionVal });

  await updateAppCollaborators(body);
}

export default NextAPI(handler);
