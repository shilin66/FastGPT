import { S3PrivateBucket } from '../../buckets/private';
import { S3Sources } from '../../type';
import {
  type CheckChatFileKeys,
  type DelChatFileByPrefixParams,
  ChatFileUploadSchema,
  DelChatFileByPrefixSchema,
  UploadChatFileSchema,
  type UploadFileParams
} from './type';
import { differenceInHours } from 'date-fns';
import { S3Buckets } from '../../constants';
import path from 'path';
import { getFileS3Key } from '../../utils';

export class S3ChatSource extends S3PrivateBucket {
  constructor() {
    super();
  }

  static parseChatUrl(url: string | URL) {
    try {
      let pathname: string;

      if (typeof url === 'string') {
        // 处理代理 URL 格式：/api/common/s3/proxy/{bucket}/{encoded_key}
        if (url.startsWith('/api/common/s3/proxy/')) {
          const withoutProxy = url.replace('/api/common/s3/proxy', '');
          // 提取 bucket 后的部分（跳过 bucket 名称）
          const slashIndex = withoutProxy.indexOf('/');
          if (slashIndex === -1) {
            return {
              filename: '',
              extension: '',
              imageParsePrefix: ''
            };
          }
          // const encodedKey = withoutProxy.substring(slashIndex + 1);
          // 解码 URL 编码的 key
          pathname = decodeURIComponent(withoutProxy);
        } else {
          // 尝试作为完整 URL 解析
          const urlObj = new URL(url);
          pathname = decodeURIComponent(urlObj.pathname);
        }
      } else {
        // 已经是 URL 对象
        pathname = decodeURIComponent(url.pathname);
      }
      // 非 S3 key
      if (!pathname.startsWith(`/${S3Buckets.private}/${S3Sources.chat}/`)) {
        return {
          filename: '',
          extension: '',
          imageParsePrefix: ''
        };
      }

      const filename = pathname.split('/').pop() || 'file';
      const extension = path.extname(filename);
      // 去掉下划线及其后面的部分，保留原始扩展名
      const cleaned = filename.replace(/_[^_]+(?=\.[^.]+$)/, '');
      return {
        filename: cleaned,
        extension: extension.replace('.', ''),
        imageParsePrefix: `${pathname.replace(`/${S3Buckets.private}/`, '').replace(extension, '')}-parsed`
      };
    } catch (error) {
      return {
        filename: '',
        extension: '',
        imageParsePrefix: ''
      };
    }
  }

  async createGetChatFileURL(params: { key: string; expiredHours?: number; external: boolean }) {
    const { key, expiredHours = 1, external = false } = params; // 默认一个小时

    if (external) {
      return await this.createExternalUrl({ key, expiredHours });
    }
    return await this.createPreviewUrl({ key, expiredHours });
  }

  async createUploadChatFileURL(params: CheckChatFileKeys) {
    const { appId, chatId, uId, filename, expiredTime, maxFileSize } =
      ChatFileUploadSchema.parse(params);
    const { fileKey } = getFileS3Key.chat({ appId, chatId, uId, filename });
    return await this.createPresignedPutUrl(
      { rawKey: fileKey, filename },
      {
        expiredHours: expiredTime ? differenceInHours(expiredTime, new Date()) : 1,
        maxFileSize
      }
    );
  }

  async deleteChatFilesByPrefix(params: DelChatFileByPrefixParams) {
    const { appId, chatId, uId } = DelChatFileByPrefixSchema.parse(params);

    const prefix = [S3Sources.chat, appId, uId, chatId].filter(Boolean).join('/');
    const publicBucket = global.s3BucketMap[S3Buckets.public];

    await this.addDeleteJob({ prefix });
    await publicBucket.addDeleteJob({ prefix });

    return prefix;
  }

  deleteChatFileByKey(key: string) {
    this.addDeleteJob({ key });
    return key;
  }

  async uploadChatFile(params: UploadFileParams) {
    const { appId, chatId, uId, filename, body, contentType, expiredTime } =
      UploadChatFileSchema.parse(params);
    const { fileKey } = getFileS3Key.chat({
      appId,
      chatId,
      uId,
      filename
    });

    return this.uploadFileByBody({
      key: fileKey,
      filename,
      body,
      contentType,
      expiredTime
    });
  }

  getToolFilePrefix(params: { appId: string; chatId: string; uId: string }) {
    const { appId, chatId, uId } = params;
    return [S3Sources.chat, appId, uId, chatId].filter(Boolean).join('/');
  }
}

export function getS3ChatSource() {
  if (global.chatBucket) {
    return global.chatBucket;
  }
  global.chatBucket = new S3ChatSource();
  return global.chatBucket;
}

declare global {
  var chatBucket: S3ChatSource;
}
