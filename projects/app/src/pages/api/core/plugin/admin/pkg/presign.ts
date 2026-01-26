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

  const result = await pluginClient.tool.upload.getUploadURL({
    query: {
      filename
    }
  });

  if (result.status !== 200) {
    return Promise.reject(result.body);
  }
  if (isS3ProxyEnabled()) {
    const minioUrl = result.body.postURL;
    const objectName = result.body.objectName;

    const { bucketName, metadata } = parseMinioUrlInfo(minioUrl);
    const proxyUrl = convertToProxyUrl({
      minioUrl: result.body.postURL,
      key: objectName,
      bucket: bucketName,
      action: 'upload',
      metadata
    });
    result.body.postURL = proxyUrl.url;
  }
  return result.body;
}

export default NextAPI(handler);
