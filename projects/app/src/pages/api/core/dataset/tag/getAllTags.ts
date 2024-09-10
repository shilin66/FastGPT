import { NextAPI } from '@/service/middleware/entry';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { NextApiRequest } from 'next';
import { DatasetTagType } from '@fastgpt/global/core/dataset/type';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';

async function handler(req: NextApiRequest) {
  const datasetId = req.query.datasetId as string;
  await authDataset({ req, datasetId, authToken: true, per: ReadPermissionVal });
  return {
    list: (await MongoDatasetCollectionTags.find({ datasetId })) as DatasetTagType[]
  };
}

export default NextAPI(handler);
