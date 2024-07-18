import { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { UpdateDatasetCollaboratorBody } from '@fastgpt/global/core/dataset/collaborator';
import { updateDatasetCollaborators } from '@fastgpt/service/support/permission/dataset/controller';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const body = req.body as UpdateDatasetCollaboratorBody;

  await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  await updateDatasetCollaborators(body);
}

export default NextAPI(handler);
