import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { CreateDatasetCollectionTagParams } from '@fastgpt/global/core/dataset/api';
import { NextAPI } from '@/service/middleware/entry';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';

async function handler(req: ApiRequestProps) {
  const body = req.body as CreateDatasetCollectionTagParams;
  const { teamId } = await authDataset({
    req,
    datasetId: body.datasetId,
    authToken: true,
    per: WritePermissionVal
  });
  await MongoDatasetCollectionTags.create({
    ...body,
    teamId
  });
}

export default NextAPI(handler);
