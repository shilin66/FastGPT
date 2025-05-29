import type { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { deleteDatasetCollaborators } from '@fastgpt/service/support/permission/dataset/controller';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const datasetId = req.query.datasetId as string;
  const tmbId = req.query.tmbId as string;
  const groupId = req.query.groupId as string;

  await authDataset({ req, authToken: true, datasetId, per: ManagePermissionVal });

  await deleteDatasetCollaborators(datasetId, tmbId, groupId);
}

export default NextAPI(handler);
