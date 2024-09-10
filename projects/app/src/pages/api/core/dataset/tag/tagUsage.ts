import { NextAPI } from '@/service/middleware/entry';
import { NextApiRequest } from 'next';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';

export type TagUsageType = {
  tagId: string;
  collections: string[];
};

async function handler(req: NextApiRequest) {
  const datasetId = req.query.datasetId as string;
  await authDataset({ req, datasetId, authToken: true, per: ReadPermissionVal });
  const collections = (await MongoDatasetCollection.find({ datasetId })) as {
    _id: string;
    tags: string[];
  }[];
  const tagUsageMap = collections.reduce(
    (acc, collection) => {
      collection.tags.forEach((tag) => {
        if (!acc[tag]) {
          acc[tag] = [];
        }
        acc[tag].push(collection._id);
      });
      return acc;
    },
    {} as { [key: string]: string[] }
  );

  const tagUsageList: TagUsageType[] = Object.keys(tagUsageMap).map((tag) => ({
    tagId: tag,
    collections: tagUsageMap[tag]
  }));

  return tagUsageList;
}

export default NextAPI(handler);
