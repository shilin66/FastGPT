import { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  ManagePermissionVal,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { listDatasetCollaborator } from '@fastgpt/service/support/permission/dataset/controller';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const datasetId = req.query.datasetId as string;

  await authDataset({ req, authToken: true, datasetId, per: ReadPermissionVal });

  return listDatasetCollaborator(datasetId);
}

export default NextAPI(handler);
