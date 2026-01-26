import type { NextApiRequest, NextApiResponse } from 'next';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { S3PublicBucket } from '@fastgpt/service/common/s3/buckets/public';
import { S3Buckets } from '@fastgpt/service/common/s3/constants';
import { addLog } from '@fastgpt/service/common/system/log';

/**
 * S3 Public Read Proxy API
 * 代理对公开 S3 对象的读取请求
 *
 * Path:
 * - /api/common/s3/proxy/{bucket}/{key...}
 *
 * Example:
 * - /api/common/s3/proxy/fastgpt-public/avatar/6839527df305ee43baa5249c/1_pPPTY9.jpg
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { key = [] } = req.query as { key: string[] };

    if (!key || key.length < 2) {
      return res
        .status(400)
        .json({
          error: 'Invalid key format. Expected: /api/common/s3/proxy/read/{bucket}/{path...}'
        });
    }

    // 从路径中提取 bucket 和对象 key
    const bucketName = key[0];
    const objectKey = key.slice(1).join('/');

    // 根据 bucket 名称选择适当的客户端
    let bucketClient;
    if (bucketName === S3Buckets.public) {
      bucketClient = new S3PublicBucket();
    } else {
      bucketClient = new S3PrivateBucket();
    }

    // 获取文件流
    const fileStream = await bucketClient.getFileStream(objectKey);
    if (!fileStream) {
      return res.status(404).json({ error: 'File not found' });
    }

    // 获取文件元数据
    const metadata = await bucketClient.getFileMetadata(objectKey);

    // 设置响应头
    res.setHeader('Content-Type', metadata?.contentType || 'application/octet-stream');
    if (metadata?.contentLength) {
      res.setHeader('Content-Length', metadata.contentLength);
    }

    // 对于 HEAD 请求，只返回头部信息
    if (req.method === 'HEAD') {
      res.status(200).end();
      return;
    }

    // 将文件流直接传输给客户端
    fileStream.pipe(res);
  } catch (error: any) {
    addLog.error('S3 public read proxy error', error);
    return res.status(500).json({
      error: 'Read failed',
      message: error?.message || 'Unknown error'
    });
  }
}

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false // 禁用响应大小限制，允许流式传输大文件
  }
};
