import FormData from 'form-data';
import fs from 'fs';
import type { ReadFileResponse } from '../../../worker/readFile/type';
import { axios } from '../../api/axios';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { matchMdImg } from '@fastgpt/global/common/string/markdown';
import { createPdfParseUsage } from '../../../support/wallet/usage/controller';
import { useDoc2xServer } from '../../../thirdProvider/doc2x';
import { useTextinServer } from '../../../thirdProvider/textin';
import { readRawContentFromBuffer } from '../../../worker/function';
import { uploadImage2S3Bucket } from '../../s3/utils';
import { Mimes, S3Buckets } from '../../s3/constants';
import { Mimes } from '../../s3/constants';
import { getLogger, LogCategories } from '../../logger';

const logger = getLogger(LogCategories.MODULE.DATASET.FILE);

export type readRawTextByLocalFileParams = {
  teamId: string;
  tmbId: string;
  path: string;
  encoding: string;
  customPdfParse?: string;
  getFormatText?: boolean;
  fileParsedPrefix?: string;
  metadata?: Record<string, any>;
};
export const readRawTextByLocalFile = async (params: readRawTextByLocalFileParams) => {
  const { path } = params;

  const extension = path?.split('.')?.pop()?.toLowerCase() || '';

  const buffer = await fs.promises.readFile(path);

  return readFileContentByBuffer({
    extension,
    customPdfParse: params.customPdfParse,
    getFormatText: params.getFormatText,
    teamId: params.teamId,
    tmbId: params.tmbId,
    encoding: params.encoding,
    buffer,
    imageKeyOptions: params.fileParsedPrefix
      ? {
          prefix: params.fileParsedPrefix
        }
      : undefined
  });
};

export const readFileContentByBuffer = async ({
  teamId,
  tmbId,

  extension,
  buffer,
  encoding,
  customPdfParse,
  usageId,
  getFormatText = true,
  imageKeyOptions
}: {
  teamId: string;
  tmbId: string;

  extension: string;
  buffer: Buffer;
  encoding: string;

  customPdfParse?: string;
  usageId?: string;
  getFormatText?: boolean;
  imageKeyOptions?: {
    prefix: string;
    expiredTime?: Date;
  };
}): Promise<{
  rawText: string;
}> => {
  const systemParse = () =>
    readRawContentFromBuffer({
      extension,
      encoding,
      buffer
    });
  const parsePdfFromCustomService = async (parser: any): Promise<ReadFileResponse> => {
    const url = parser.url;
    const token = parser.key;
    if (!url) return systemParse();

    const start = Date.now();
    logger.info('Start parsing file via external service', { extension });

    const data = new FormData();
    data.append('file', buffer, {
      filename: `file.${extension}`
    });
    const { data: response } = await axios.post<{
      pages: number;
      markdown: string;
      error?: Object | string;
    }>(url, data, {
      timeout: 600000,
      headers: {
        ...data.getHeaders(),
        Authorization: token ? `Bearer ${token}` : undefined
      }
    });

    if (response.error) {
      return Promise.reject(response.error);
    }

    logger.info('External file parsing completed', {
      extension,
      durationMs: Date.now() - start
    });

    const rawText = response.markdown;
    const { text, imageList } = matchMdImg(rawText);

    createPdfParseUsage({
      teamId,
      tmbId,
      pages: response.pages,
      parserName: customPdfParse,
      usageId
    });

    return {
      rawText: text,
      formatText: text,
      imageList
    };
  };
  // Textin api
  const parsePdfFromTextin = async (parser: any): Promise<ReadFileResponse> => {
    const appId = parser.textinAppId;
    const secretCode = parser.textinSecretCode;
    if (!appId || !secretCode) return systemParse();

    const { pages, text, imageList } = await useTextinServer({
      appId,
      secretCode
    }).parsePDF(buffer);

    createPdfParseUsage({
      teamId,
      tmbId,
      pages,
      usageId
    });

    return {
      rawText: text,
      formatText: text,
      imageList
    };
  };
  // Doc2x api
  const parsePdfFromDoc2x = async (parser: any): Promise<ReadFileResponse> => {
    const doc2xKey = parser.doc2xKey;
    if (!doc2xKey) return systemParse();

    const { pages, text, imageList } = await useDoc2xServer({ apiKey: doc2xKey }).parsePDF(buffer);

    createPdfParseUsage({
      teamId,
      tmbId,
      pages,
      usageId,
      parserName: customPdfParse
    });

    return {
      rawText: text,
      formatText: text,
      imageList
    };
  };
  // Custom read file service
  const pdfParseFn = async (): Promise<ReadFileResponse> => {
    if (!customPdfParse) return systemParse();

    const parsers = global.systemEnv.customPdfParse || [];
    const selectedParser = parsers.find((parser) => parser.name === customPdfParse);

    if (!selectedParser) return systemParse();
    if (selectedParser.textinAppId) return parsePdfFromTextin(selectedParser);
    if (selectedParser.url) return parsePdfFromCustomService(selectedParser);
    if (selectedParser.doc2xKey) return parsePdfFromDoc2x(selectedParser);

    return systemParse();
  };

  const start = Date.now();
  logger.debug('Start parsing file', { extension });

  let { rawText, formatText, imageList } = await (async () => {
    // Check if any parser supports this extension
    const parsers = global.systemEnv.customPdfParse || [];
    const selectedParser = parsers.find((parser) => parser.name === customPdfParse);
    const ext = selectedParser?.extension?.split(',');

    if (ext?.includes(extension)) {
      return await pdfParseFn();
    }

    return await systemParse();
  })();

  logger.debug('File parsing completed', { extension, durationMs: Date.now() - start });

  // markdown data format
  if (imageList && imageList.length > 0) {
    logger.debug('Processing parsed document images', {
      extension,
      imageCount: imageList.length
    });

    await batchRun(imageList, async (item) => {
      const src = await (async () => {
        if (!imageKeyOptions) return '';
        try {
          const { prefix, expiredTime } = imageKeyOptions;
          const ext = `.${item.mime.split('/')[1].replace('x-', '')}`;

          return await uploadImage2S3Bucket('private', {
            base64Img: `data:${item.mime};base64,${item.base64}`,
            uploadKey: `${prefix}/${item.uuid}${ext}`,
            mimetype: Mimes[ext as keyof typeof Mimes],
            filename: `${item.uuid}${ext}`,
            expiredTime
          });
        } catch (error) {
          logger.warn('Failed to upload parsed image to S3', {
            extension,
            imageUuid: item.uuid,
            error
          });
          return `[Image Upload Failed: ${item.uuid}]`;
        }
      })();
      rawText = rawText.replace(item.uuid, `/api/common/s3/proxy/${S3Buckets.private}/${src}`);
      // rawText = rawText.replace(item.uuid, jwtSignS3ObjectKey(src, addDays(new Date(), 90)));
      if (formatText) {
        formatText = formatText.replace(item.uuid, src);
      }
    });
  }

  return {
    rawText: getFormatText ? formatText || rawText : rawText
  };
};
