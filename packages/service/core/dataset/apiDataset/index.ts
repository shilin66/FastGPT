import { useApiDatasetRequest } from './custom/api';
import { useYuqueDatasetRequest } from './yuqueDataset/api';
import { useFeishuDatasetRequest } from './feishuDataset/api';
import type { ApiDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';
import { useConfluenceDatasetRequest } from './confluenceDataset/api';

export const getApiDatasetRequest = async (apiDatasetServer?: ApiDatasetServerType) => {
  const { apiServer, yuqueServer, feishuServer, confluenceServer } = apiDatasetServer || {};

  if (apiServer) {
    return useApiDatasetRequest({ apiServer });
  }
  if (yuqueServer) {
    return useYuqueDatasetRequest({ yuqueServer });
  }
  if (feishuServer) {
    return useFeishuDatasetRequest({ feishuServer });
  }
  if (confluenceServer) {
    return useConfluenceDatasetRequest({ confluenceServer });
  }

  return Promise.reject('Can not find api dataset server');
};
