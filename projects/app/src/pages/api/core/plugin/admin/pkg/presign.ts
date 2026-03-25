import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import type {
  GetPkgPluginUploadURLQueryType,
  GetPkgPluginUploadURLResponseType
} from '@fastgpt/global/openapi/core/plugin/admin/api';
import {
  convertToProxyUrl,
  isS3ProxyEnabled,
  parseMinioUrlInfo
} from '@fastgpt/service/common/s3/proxy';

export type GetUploadURLQuery = GetPkgPluginUploadURLQueryType;

export type GetUploadURLResponse = GetPkgPluginUploadURLResponseType;

async function handler(
  req: ApiRequestProps<{}, GetUploadURLQuery>,
  res: ApiResponseType<GetUploadURLResponse>
): Promise<GetUploadURLResponse> {
  await authSystemAdmin({ req });

  const { filename } = req.query;

  if (!filename) {
    return Promise.reject('Filename is required');
  }

  const result = await pluginClient.getToolUploadUrl(filename);

  if (!result) {
    return Promise.reject(result);
  }
  if (isS3ProxyEnabled()) {
    const minioUrl = result.postURL;
    const objectName = result.objectName;

    const { bucketName, metadata } = parseMinioUrlInfo(minioUrl);
    const proxyUrl = convertToProxyUrl({
      minioUrl: result.postURL,
      key: objectName,
      bucket: bucketName,
      action: 'upload',
      metadata
    });
    result.postURL = proxyUrl.url;
  }
  return result;
}

export default NextAPI(handler);
