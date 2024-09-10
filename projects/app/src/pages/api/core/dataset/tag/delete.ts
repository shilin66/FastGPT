import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { type UpdateDatasetCollectionTagParams } from '@fastgpt/global/core/dataset/api';
import { NextAPI } from '@/service/middleware/entry';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';

async function handler(req: ApiRequestProps) {
  const { id, datasetId } = req.query as { id: string; datasetId: string };
  await authDataset({ req, datasetId, authToken: true, per: WritePermissionVal });
  await MongoDatasetCollection.updateMany(
    {
      datasetId,
      tags: id
    },
    {
      $pull: {
        tags: id
      }
    }
  );

  await MongoDatasetCollectionTags.deleteOne({
    datasetId,
    _id: id
  });
}

export default NextAPI(handler);
