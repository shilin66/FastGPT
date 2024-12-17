import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { PostConfluenceSyncParams } from '@fastgpt/global/core/dataset/api';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { trainConfluenceCollection } from '@fastgpt/service/core/dataset/training/controller';

export type ConfluenceSyncBody = PostConfluenceSyncParams;

async function handler(req: ApiRequestProps<ConfluenceSyncBody>) {
  const { datasetId } = req.body;

  // auth
  const { teamId, dataset } = await authDataset({
    req,
    authToken: true,
    datasetId,
    per: WritePermissionVal
  });

  try {
    return await trainConfluenceCollection({ dataset, teamId });
  } catch (e) {
    console.error(e);
    return Promise.reject(e);
  }
}

export default NextAPI(handler);
