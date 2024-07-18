import { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { deleteDatasetCollaborators } from '@fastgpt/service/support/permission/dataset/controller';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const datasetId = req.query.datasetId as string;
  const tmbId = req.query.tmbId as string;

  await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  await deleteDatasetCollaborators(datasetId, tmbId);
}

export default NextAPI(handler);
