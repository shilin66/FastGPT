import { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { UpdateDatasetCollaboratorBody } from '@fastgpt/global/core/dataset/collaborator';
import { updateDatasetCollaborators } from '@fastgpt/service/support/permission/dataset/controller';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const body = req.body as UpdateDatasetCollaboratorBody;

  await authDataset({ req, authToken: true, datasetId: body.datasetId, per: ManagePermissionVal });

  await updateDatasetCollaborators(body);
}

export default NextAPI(handler);
