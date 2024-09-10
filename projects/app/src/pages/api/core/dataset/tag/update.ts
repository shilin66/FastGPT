import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { type UpdateDatasetCollectionTagParams } from '@fastgpt/global/core/dataset/api';
import { NextAPI } from '@/service/middleware/entry';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';

async function handler(req: ApiRequestProps) {
  const { datasetId, tag, tagId } = req.body as UpdateDatasetCollectionTagParams;
  await authDataset({ req, datasetId, authToken: true, per: WritePermissionVal });
  await MongoDatasetCollectionTags.updateOne(
    {
      datasetId,
      _id: tagId
    },
    {
      tag
    }
  );
}

export default NextAPI(handler);
