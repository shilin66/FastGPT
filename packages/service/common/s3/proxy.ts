import { EndpointUrl } from '@fastgpt/global/common/file/constants';
import { S3Buckets } from './constants';

/**
 * 是否启用 S3 代理
 * 当启用时，所有 S3 URL 将通过后端 API 代理，而不是直接访问 MinIO
 */
export const isS3ProxyEnabled = () => {
  return process.env.S3_PROXY_ENABLED === 'true' || process.env.S3_PROXY_ENABLED === '1';
};

/**
 * 获取 S3 代理的基础 URL
 */
export const getS3ProxyBaseUrl = () => {
  return `${EndpointUrl}/api/common/s3/proxy`;
};

/**
 * 编码文件名以支持包含中文等特殊字符的 Content-Disposition 头部
 * @param filename - 原始文件名
 * @returns 符合 RFC 5987 标准的 Content-Disposition 头部值
 */
export const encodeContentDisposition = (filename: string): string => {
  // 对文件名进行 URI 编码
  const encodedFilename = encodeURIComponent(filename);

  // 返回符合 RFC 5987 标准的 Content-Disposition 头部
  // 同时提供 fallback 以兼容不支持 filename* 的旧浏览器
  return `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`;
};

/**
 * 将 MinIO presigned URL 转换为代理 URL
 * @param minioUrl - MinIO 生成的 presigned URL
 * @param key - S3 object key
 * @param bucket - bucket 类型 (private/chat/dataset)
 * @param action - 操作类型 (upload/download)
 * @param metadata - 元数据（仅用于上传）
 */
export const convertToProxyUrl = (params: {
  minioUrl: string;
  key: string;
  bucket: string;
  action: 'upload' | 'download';
  metadata?: Record<string, string>;
}): { url: string } => {
  const { key, bucket, action, metadata } = params;

  if (!isS3ProxyEnabled()) {
    return { url: params.minioUrl };
  }

  const proxyBaseUrl = getS3ProxyBaseUrl();
  const encodedKey = encodeURIComponent(key);

  // 构建基础 URL
  let proxyUrl = `${proxyBaseUrl}/${action}?key=${encodedKey}&bucket=${bucket}`;

  // 如果是上传操作且有元数据，将元数据编码到 URL 中
  if (action === 'download') {
    proxyUrl = `${proxyBaseUrl}/${bucket}/${encodedKey}`;
  } else if (action === 'upload' && metadata) {
    const metadataStr = encodeURIComponent(JSON.stringify(metadata));
    proxyUrl += `&metadata=${metadataStr}`;
  }

  return { url: proxyUrl };
};

export const parseBucketNameFromMinioUrl = (minioUrl: string): string => {
  try {
    const url = new URL(minioUrl);
    const hostname = url.hostname;
    const pathname = url.pathname;

    // 如果是路径风格的 URL (例如 http://minio:9000/bucket-name/key)，从路径中提取 bucket
    const pathSegments = pathname.split('/').filter((segment) => segment.length > 0);
    if (pathSegments.length > 0) {
      return pathSegments[0]; // 第一个段是 bucket 名称
    } else {
      return S3Buckets.public;
    }
  } catch (error) {
    console.error('Error parsing bucket name from MinIO URL:', error);
    // 如果解析失败，返回一个默认的 bucket 名称或抛出错误
    throw new Error('Could not extract bucket name from MinIO URL');
  }
};

export const parseMinioUrlInfo = (
  minioUrl: string
): { bucketName: string; metadata: Record<string, string> } => {
  try {
    const url = new URL(minioUrl);
    const pathname = url.pathname;

    // 从路径中提取 bucket 名称
    const pathSegments = pathname.split('/').filter((segment) => segment.length > 0);
    const bucketName = pathSegments.length > 0 ? pathSegments[0] : '';

    // 从 URL 查询参数中提取 metadata
    const metadata: Record<string, string> = {};

    // 遍历 URL 参数
    for (const [key, value] of url.searchParams.entries()) {
      // 检查是否是 x-amz-meta- 前缀的参数（MinIO 的自定义元数据）
      if (key.toLowerCase().startsWith('x-amz-meta-')) {
        const metaKey = key.substring('x-amz-meta-'.length);
        metadata[metaKey] = value;
      }
      // 检查其他可能的元数据相关参数
      else if (key === 'x-amz-meta-content-disposition') {
        metadata.contentDisposition = value;
      } else if (key === 'x-amz-meta-original-filename' || key === 'x-amz-meta-origin-filename') {
        metadata.originFilename = value;
      } else if (key === 'x-amz-meta-upload-time') {
        metadata.uploadTime = value;
      }
    }

    return { bucketName, metadata };
  } catch (error) {
    console.error('Error parsing bucket name and metadata from MinIO URL:', error);
    throw new Error('Could not extract bucket name and metadata from MinIO URL');
  }
};
