import {
  Client,
  type RemoveOptions,
  type CopyConditions,
  S3Error,
  InvalidObjectNameError,
  InvalidXMLError
} from 'minio';
import {
  type CreatePostPresignedUrlOptions,
  type CreatePostPresignedUrlParams,
  type createPreviewUrlParams,
  CreateGetPresignedUrlParamsSchema,
  CreatePostPresignedUrlOptionsSchema,
  type CreatePostPresignedUrlResult
} from '../contracts/type';
import { storageDownloadMode, getSystemMaxFileSize } from '../config/constants';
import { S3ErrEnum } from '@fastgpt/global/common/error/code/s3';
import { createUploadConstraints } from '../utils/uploadConstraints';
import path from 'node:path';
import { MongoS3TTL } from '../models/ttl';
import { addHours, addMinutes, differenceInSeconds } from 'date-fns';
import { getLogger, LogCategories } from '../../logger';
import { addS3DelJob } from '../queue/delete';
import { type UploadFileByBufferParams, UploadFileByBodySchema } from '../contracts/type';
import type { createStorage } from '@fastgpt-sdk/storage';
import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';
import { getContentDisposition } from '@fastgpt/global/common/file/tools';
import { jwtSignS3DownloadToken, jwtSignS3UploadToken } from '../security/token';
import { convertToProxyUrl } from '../proxy';

const logger = getLogger(LogCategories.INFRA.S3);

type IStorage = ReturnType<typeof createStorage>;

/**
 * Encode filename for use in HTTP headers
 * Uses base64 encoding to safely handle Chinese and other special characters
 * This prevents ERR_INVALID_CHAR errors when setting HTTP headers
 */
const encodeFilenameForHeader = (filename: string): string => {
  // Check if filename contains non-ASCII characters
  if (/^[\x00-\x7F]*$/.test(filename)) {
    // ASCII only, safe to use as-is
    return filename;
  }

  // Contains non-ASCII characters, use base64 encoding
  // Format: =?UTF-8?B?base64data?= (RFC 2047 style)
  const base64 = Buffer.from(filename, 'utf-8').toString('base64');
  return `=?UTF-8?B?${base64}?=`;
};

/**
 * Decode filename from HTTP header encoding
 * Handles both plain ASCII and RFC 2047 base64 encoded filenames
 */
const decodeFilenameFromHeader = (encoded: string): string => {
  // Check if it's RFC 2047 encoded
  const rfc2047Match = encoded.match(/^=\?UTF-8\?B\?(.+)\?=$/);
  if (rfc2047Match) {
    return Buffer.from(rfc2047Match[1], 'base64').toString('utf-8');
  }

  // Otherwise, return as-is (already decoded or plain ASCII)
  return encoded;
};

// Check if the error is a "file not found" type error, which should be treated as success
export const isFileNotFoundError = (error: any): boolean => {
  if (error instanceof S3Error) {
    // Handle various "not found" error codes
    return (
      error.code === 'NoSuchKey' ||
      error.code === 'InvalidObjectName' ||
      error.message === 'Not Found' ||
      error.message ===
        'The request signature we calculated does not match the signature you provided. Check your key and signing method.' ||
      error.message.includes('Resource name contains bad components') ||
      error.message.includes('Object name contains unsupported characters.')
    );
  }
  if (error instanceof InvalidObjectNameError || error instanceof InvalidXMLError) {
    return true;
  }
  return false;
};

export class S3BaseBucket {
  constructor(
    private readonly _client: IStorage,
    private readonly _externalClient: IStorage | undefined
  ) {}

  get client(): IStorage {
    return this._client;
  }

  get externalClient(): IStorage {
    return this._externalClient ?? this._client;
  }

  get bucketName(): string {
    return this.client.bucketName;
  }

  async checkBucketHealth() {
    const key = `health-check/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
    const filename = 'health-check.txt';

    await this.client.uploadObject({
      key,
      body: 'ok',
      contentType: 'text/plain',
      metadata: {
        contentDisposition: getContentDisposition({ filename, type: 'attachment' }),
        originFilename: filename,
        uploadTime: new Date().toISOString()
      }
    });

    try {
      await Promise.all([
        this.client.getObjectMetadata({ key }),
        this._externalClient?.checkObjectExists({ key })
      ]);
    } finally {
      await this.client.deleteObject({ key }).catch((err) => {
        if (isFileNotFoundError(err)) {
          return Promise.resolve();
        }
        logger.warn('S3 health check cleanup failed', {
          key,
          code: err?.code,
          error: err
        });
      });
    }
  }

  async move({ from, to }: { from: string; to: string }): Promise<void> {
    await this.copy({ from, to, options: { temporary: false } });
    await this.removeObject(from);
  }

  async copy({
    from,
    to,
    options
  }: {
    from: string;
    to: string;
    options?: {
      temporary?: boolean;
    };
  }) {
    if (options?.temporary) {
      await MongoS3TTL.create({
        minioKey: to,
        bucketName: this.bucketName,
        expiredTime: addHours(new Date(), 24)
      });
    }
    return this.client.copyObjectInSelfBucket({ sourceKey: from, targetKey: to });
  }

  async removeObject(objectKey: string): Promise<void> {
    this.client.deleteObject({ key: objectKey }).catch((err) => {
      if (isFileNotFoundError(err)) {
        return Promise.resolve();
      }
      logger.error('S3 delete object failed', {
        key: objectKey,
        code: err?.code,
        error: err
      });
      throw err;
    });
  }

  addDeleteJob(params: Omit<Parameters<typeof addS3DelJob>[0], 'bucketName'>) {
    return addS3DelJob({ ...params, bucketName: this.bucketName });
  }

  async isObjectExists(key: string) {
    const { exists } = await this.client.checkObjectExists({ key });

    return exists ?? false;
  }

  async createPresignedPutUrl(
    params: CreatePostPresignedUrlParams,
    options: CreatePostPresignedUrlOptions = {}
  ): Promise<CreatePostPresignedUrlResult> {
    try {
      const {
        expiredHours,
        maxFileSize = getSystemMaxFileSize(),
        uploadConstraints
      } = CreatePostPresignedUrlOptionsSchema.parse(options);
      const formatMaxFileSize = maxFileSize * 1024 * 1024;
      const filename = params.filename;
      const resolvedUploadConstraints = createUploadConstraints({
        filename,
        uploadConstraints
      });
      const expiredSeconds = differenceInSeconds(addMinutes(new Date(), 10), new Date());

      // Encode filename for safe use in HTTP headers
      // encodeURIComponent(filename)
      const encodedFilename = encodeFilenameForHeader(filename);

      const { metadata, url } = await this.externalClient.generatePresignedPutUrl({
        key: params.rawKey,
        expiredSeconds,
        metadata: {
          contentDisposition: getContentDisposition({ filename, type: 'attachment' }),
          originFilename: encodedFilename,
          uploadTime: new Date().toISOString(),
          ...params.metadata
        }
      });

      if (expiredHours) {
        await MongoS3TTL.create({
          minioKey: params.rawKey,
          bucketName: this.bucketName,
          expiredTime: addHours(new Date(), expiredHours)
        });
      }

      // 如果启用了代理，将 MinIO URL 转换为代理 URL
      const proxyUrl = convertToProxyUrl({
        minioUrl: url,
        key: params.rawKey,
        bucket: this.bucketName,
        action: 'upload',
        metadata: {
          contentDisposition: `attachment; filename="${encodedFilename}"`,
          originFilename: encodedFilename,
          uploadTime: new Date().toISOString(),
          ...params.metadata
        }
      });

      return {
        url: proxyUrl.url,
        key: params.rawKey,
        headers: {
          'content-type': resolvedUploadConstraints.defaultContentType
        },
        maxSize: formatMaxFileSize
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (
        message === S3ErrEnum.invalidUploadFileType ||
        message === S3ErrEnum.uploadFileTypeMismatch
      ) {
        logger.info('Rejected S3 upload request', {
          key: params.rawKey,
          filename: params.filename,
          message
        });
        return Promise.reject(error);
      }

      logger.error('Failed to create S3 upload URL', {
        key: params.rawKey,
        filename: params.filename,
        error
      });

      return Promise.reject('Failed to create presigned put url');
    }
  }

  async createExternalUrl(params: createPreviewUrlParams) {
    const parsed = CreateGetPresignedUrlParamsSchema.parse(params);

    const { key, expiredHours, mode } = parsed;
    const expires = expiredHours ? expiredHours * 60 * 60 : 30 * 60; // expires 的单位是秒 默认 30 分钟

    const { url: minioUrl } = await this.externalClient.generatePresignedGetUrl({
      key,
      expiredSeconds: expires
    });

    // 如果启用了代理，将 MinIO URL 转换为代理 URL
    return convertToProxyUrl({
      minioUrl,
      key,
      bucket: this.bucketName,
      action: 'download'
    });
    // if ((mode || storageDownloadMode) === 'proxy') {
    //   return {
    //     bucket: this.bucketName,
    //     key,
    //     url: jwtSignS3DownloadToken({
    //       objectKey: key,
    //       bucketName: this.bucketName,
    //       expiredTime: addMinutes(new Date(), Math.ceil(expires / 60)),
    //       filename: path.basename(key)
    //     })
    //   };
    // }
    //
    // return await this.externalClient.generatePresignedGetUrl({ key, expiredSeconds: expires });
  }

  async createPreviewUrl(params: createPreviewUrlParams) {
    const parsed = CreateGetPresignedUrlParamsSchema.parse(params);

    const { key, expiredHours } = parsed;
    const expires = expiredHours ? expiredHours * 60 * 60 : 30 * 60; // expires 的单位是秒 默认 30 分钟

    const { url: minioUrl } = await this.client.generatePresignedGetUrl({
      key,
      expiredSeconds: expires
    });

    // 如果启用了代理，将 MinIO URL 转换为代理 URL
    return convertToProxyUrl({
      minioUrl,
      key,
      bucket: this.bucketName,
      action: 'download'
    });
  }

  async uploadFileByBody(params: UploadFileByBufferParams) {
    const {
      key,
      body,
      filename,
      contentType,
      expiredTime = addHours(new Date(), 1)
    } = UploadFileByBodySchema.parse(params);

    await MongoS3TTL.create({
      minioKey: key,
      bucketName: this.bucketName,
      expiredTime
    });

    await this.client.uploadObject({
      key,
      body,
      contentType: contentType || 'application/octet-stream',
      metadata: {
        contentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
        originFilename: encodeURIComponent(filename),
        uploadTime: new Date().toISOString()
      }
    });

    return {
      key,
      accessUrl: await this.createExternalUrl({
        key,
        expiredHours: 2
      })
    };
  }

  async getFileMetadata(key: string) {
    const metadataResponse = await this.client.getObjectMetadata({ key });
    if (!metadataResponse) return;

    const contentLength = metadataResponse.contentLength;
    // Decode filename from header encoding (handles both base64 and URL encoding)
    const rawFilename = metadataResponse.metadata.originFilename || '';
    const decodedFilename = decodeFilenameFromHeader(rawFilename);
    const filename: string = decodedFilename.startsWith('=?')
      ? decodedFilename
      : decodeURIComponent(decodedFilename);
    const extension = parseFileExtensionFromUrl(filename);
    const contentType: string = metadataResponse.contentType || 'application/octet-stream';
    const uploadTime: string = metadataResponse.metadata.uploadTime || '';
    const originFileUploadTime: string = metadataResponse.metadata.originFileUploadTime || '';

    return {
      filename,
      extension,
      contentType,
      contentLength,
      uploadTime,
      originFileUploadTime
    };
  }

  async getFileStream(key: string) {
    const downloadResponse = await this.client.downloadObject({ key });
    if (!downloadResponse) return;

    return downloadResponse.body;
  }
}
