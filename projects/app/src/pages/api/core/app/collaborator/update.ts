import { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { UpdateAppCollaboratorBody } from '@fastgpt/global/core/app/collaborator';
import { updateAppCollaborators } from '@fastgpt/service/support/permission/app/controller';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const body = req.body as UpdateAppCollaboratorBody;

  await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  await updateAppCollaborators(body);
}

export default NextAPI(handler);
