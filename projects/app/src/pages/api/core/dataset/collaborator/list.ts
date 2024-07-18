import { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { listDatasetCollaborator } from '@fastgpt/service/support/permission/dataset/controller';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const datasetId = req.query.datasetId as string;

  await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  return listDatasetCollaborator(datasetId);
}

export default NextAPI(handler);
