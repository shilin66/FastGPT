import type { NextApiRequest, NextApiResponse } from 'next';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { S3PublicBucket } from '@fastgpt/service/common/s3/buckets/public';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.MODULE.DATASET.QUEUES);
/**
 * S3 Download Proxy API
 * 代理前端的文件下载/查看请求到 MinIO
 *
 * Query params:
 * - key: S3 object key (required)
 * - bucket: bucket type (private/chat/dataset, default: private)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { key, bucket = 'private' } = req.query as { key?: string; bucket?: string };

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

    // Get file metadata
    const metadata = await bucketClient.getFileMetadata(key);

    if (!metadata) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Get file stream
    const stream = await bucketClient.getFileStream(key);

    if (!stream) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Set response headers
    res.setHeader('Content-Type', metadata.contentType);

    if (metadata.contentLength !== undefined) {
      res.setHeader('Content-Length', metadata.contentLength);
    }

    if (metadata.filename) {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(metadata.filename)}"`
      );
    }

    // Pipe the stream to response
    stream.pipe(res);
  } catch (error: any) {
    logger.error('S3 download proxy error', error);

    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Download failed',
        message: error?.message || 'Unknown error'
      });
    }
  }
}
