import { NextAPI } from '@/service/middleware/entry';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import type { PaginationProps } from '@fastgpt/web/common/fetch/type';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';

async function handler(
  req: ApiRequestProps<
    {},
    PaginationProps<{
      datasetId: string;
      searchText?: string;
    }>
  >
) {
  const { datasetId, searchText } = req.body as PaginationProps<{
    datasetId: string;
    searchText?: string;
  }>;
  const { offset, pageSize } = parsePaginationRequest(req);
  await authDataset({ req, datasetId, authToken: true, per: ReadPermissionVal });
  const params = {
    datasetId,
    ...(searchText && { tag: { $regex: new RegExp(searchText, 'i') } })
  };
  const [result, total] = await Promise.all([
    MongoDatasetCollectionTags.find(params, { _id: 1, tag: 1 })
      .sort({ _id: -1 })
      .skip(offset)
      .limit(pageSize),
    MongoDatasetCollectionTags.countDocuments(params)
  ]);
  return {
    list: result,
    total
  };
}

export default NextAPI(handler);
