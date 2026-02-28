import type { NextApiRequest, NextApiResponse } from 'next';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { addLog } from '@fastgpt/service/common/system/log';
import { S3Buckets } from '@fastgpt/service/common/s3/constants';
import { S3PublicBucket } from '@fastgpt/service/common/s3/buckets/public';

/**
 * S3 Upload Proxy API
 * 代理前端的文件上传请求到 MinIO
 *
 * Query params:
 * - key: S3 object key (required)
 * - bucket: bucket type (private/chat/dataset, default: private)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      key,
      bucket = 'private',
      metadata: metadataParam
    } = req.query as {
      key?: string;
      bucket?: string;
      metadata?: string;
    };

    if (!key) {
      return res.status(400).json({ error: 'Missing key parameter' });
    }

    // Get the appropriate bucket client
    let bucketClient;
    switch (bucket) {
      case S3Buckets.public:
        bucketClient = new S3PublicBucket();
        break;
      default:
        bucketClient = new S3PrivateBucket();
        break;
    }

    // Get content type from headers
    const contentType = req.headers['content-type'] || 'application/octet-stream';

    // 优先从 URL 参数中获取元数据（代理模式）
    let metadata: Record<string, string> = {};

    if (metadataParam) {
      try {
        metadata = JSON.parse(decodeURIComponent(metadataParam));
        addLog.debug('S3 proxy upload - metadata from URL', { metadata });
      } catch (error) {
        addLog.warn('Failed to parse metadata from URL', { metadataParam, error });
      }
    }

    // 如果 URL 中没有元数据，尝试从 headers 中获取（兼容直连模式）
    if (Object.keys(metadata).length === 0) {
      Object.keys(req.headers).forEach((headerKey) => {
        const lowerKey = headerKey.toLowerCase();

        // 处理 x-amz-meta- 前缀的 headers
        if (lowerKey.startsWith('x-amz-meta-')) {
          const metaKey = lowerKey.replace('x-amz-meta-', '');
          const value = req.headers[headerKey];
          if (typeof value === 'string') {
            metadata[metaKey] = value;
          }
        }
        // 处理常见的元数据字段（兼容性处理）
        else if (lowerKey === 'originfilename' || lowerKey === 'origin-filename') {
          const value = req.headers[headerKey];
          if (typeof value === 'string') {
            metadata['originFilename'] = value;
          }
        } else if (lowerKey === 'contentdisposition' || lowerKey === 'content-disposition') {
          const value = req.headers[headerKey];
          if (typeof value === 'string') {
            metadata['contentDisposition'] = value;
          }
        } else if (lowerKey === 'uploadtime' || lowerKey === 'upload-time') {
          const value = req.headers[headerKey];
          if (typeof value === 'string') {
            metadata['uploadTime'] = value;
          }
        }
      });

      if (Object.keys(metadata).length > 0) {
        addLog.debug('S3 proxy upload - metadata from headers', { metadata });
      }
    }

    // 添加调试日志
    addLog.debug('S3 proxy upload', {
      key,
      bucket,
      contentType,
      metadata,
      metadataSource: metadataParam ? 'url' : 'headers'
    });

    // Read the request body as buffer
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Upload to S3
    await bucketClient.client.uploadObject({
      key,
      body: buffer,
      contentType,
      metadata
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    addLog.error('S3 upload proxy error', error);
    return res.status(500).json({
      error: 'Upload failed',
      message: error?.message || 'Unknown error'
    });
  }
}

// Disable body parsing, we need raw body
export const config = {
  api: {
    bodyParser: false
  }
};
