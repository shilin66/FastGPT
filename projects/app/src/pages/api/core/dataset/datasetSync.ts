import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import type { PostDatasetSyncParams } from '@fastgpt/global/core/dataset/api';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { apiDatasetSync } from '@fastgpt/service/core/dataset/training/controller';

async function handler(
  req: ApiRequestProps<PostDatasetSyncParams>,
  _res: ApiResponseType<any>
): Promise<any> {
  const { datasetId } = req.body;
  const { dataset, tmbId, teamId } = await authDataset({
    req,
    authToken: true,
    datasetId,
    per: ManagePermissionVal
  });
  await apiDatasetSync(dataset);
  return 'success';
}

export default NextAPI(handler);
