import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { type AddTagsToCollectionsParams } from '@fastgpt/global/core/dataset/api';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';

async function handler(req: ApiRequestProps) {
  const {
    tag: tagId,
    datasetId,
    collectionIds,
    originCollectionIds
  } = req.body as AddTagsToCollectionsParams;
  await authDataset({ req, datasetId, authToken: true, per: WritePermissionVal });
  const { added, removed } = findDifferences(collectionIds, originCollectionIds);
  await Promise.all([
    added.map(async (collectionId) => {
      await MongoDatasetCollection.findByIdAndUpdate(collectionId, {
        $addToSet: { tags: tagId }
      });
    }),
    removed.map(async (collectionId) => {
      await MongoDatasetCollection.findByIdAndUpdate(collectionId, {
        $pull: { tags: tagId }
      });
    })
  ]);
}

const findDifferences = (collectionIds: string[], originCollectionIds: string[]) => {
  const setCollectionIds = new Set(collectionIds);
  const setOriginCollectionIds = new Set(originCollectionIds);

  const added = Array.from(setCollectionIds).filter((id) => !setOriginCollectionIds.has(id));
  const removed = Array.from(setOriginCollectionIds).filter((id) => !setCollectionIds.has(id));

  return { added, removed };
};

export default NextAPI(handler);
