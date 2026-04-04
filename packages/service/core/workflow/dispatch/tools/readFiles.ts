import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { axios } from '../../../../common/api/axios';
import { serverRequestBaseUrl } from '../../../../common/api/serverRequest';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { detectFileEncoding } from '@fastgpt/global/common/file/tools';
import { parseUrlToFileType } from '../../utils/context';
import { readFileContentByBuffer } from '../../../../common/file/read/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { type ChatItemType } from '@fastgpt/global/core/chat/type';
import { addDays } from 'date-fns';
import { getNodeErrResponse } from '../utils';
import { isInternalAddress, PRIVATE_URL_TEXT } from '../../../../common/system/utils';
import { replaceS3KeyToPreviewUrl } from '../../../dataset/utils';
import { getFileS3Key } from '../../../../common/s3/utils';
import { S3ChatSource } from '../../../../common/s3/sources/chat';
import path from 'node:path';
import { S3Buckets } from '../../../../common/s3/constants';
import { S3Sources } from '../../../../common/s3/type';
import { getS3RawTextSource } from '../../../../common/s3/sources/rawText';
import { getLogger, LogCategories } from '../../../../common/logger';
import metadata from 'next/dist/server/typescript/rules/metadata';

const logger = getLogger(LogCategories.MODULE.WORKFLOW.TOOLS);

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.fileUrlList]: string[];
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.text]: string;
  [NodeOutputKeyEnum.rawResponse]: ReturnType<typeof formatResponseObject>[];
}>;

const formatResponseObject = ({
  filename,
  metadata,
  url,
  content
}: {
  filename: string;
  metadata?: string;
  url: string;
  content: string;
}) => ({
  filename,
  url,
  text: `  <File>
    <Metadata>
${metadata}
    </Metadata>
    <Content>
${content}
    </Content>
  </File>`,
  nodeResponsePreviewText: `File: ${filename}
<Content>
${content.slice(0, 100)}${content.length > 100 ? '......' : ''}
</Content>`
});

export const dispatchReadFiles = async (props: Props): Promise<Response> => {
  const {
    requestOrigin,
    runningUserInfo: { teamId, tmbId },
    histories,
    chatConfig,
    node: { version },
    params: { fileUrlList = [] },
    usageId
  } = props;
  const maxFiles = chatConfig?.fileSelectConfig?.maxFiles || 20;
  const customPdfParse = chatConfig?.fileSelectConfig?.customPdfParse;

  // Get files from histories
  const filesFromHistories = version !== '489' ? [] : getHistoryFileLinks(histories);

  try {
    const { text, readFilesResult } = await getFileContentFromLinks({
      // Concat fileUrlList and filesFromHistories; remove not supported files
      urls: [...fileUrlList, ...filesFromHistories],
      requestOrigin,
      maxFiles,
      teamId,
      tmbId,
      customPdfParse,
      usageId
    });

    return {
      data: {
        [NodeOutputKeyEnum.text]: text,
        [NodeOutputKeyEnum.rawResponse]: readFilesResult
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        readFiles: readFilesResult.map((item) => ({
          name: item?.filename || '',
          url: item?.url || ''
        })),
        readFilesResult: readFilesResult
          .map((item) => item?.nodeResponsePreviewText ?? '')
          .join('\n******\n')
      },
      [DispatchNodeResponseKeyEnum.toolResponses]: {
        fileContent: text
      }
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};

export const getHistoryFileLinks = (histories: ChatItemType[]) => {
  return histories
    .filter((item) => {
      if (item.obj === ChatRoleEnum.Human) {
        return item.value.some((value) => value.file);
      }
      return false;
    })
    .flatMap((item) => {
      if (item.obj === ChatRoleEnum.Human) {
        return item.value.map((value) => value.file?.url).filter(Boolean) as string[];
      }
      return [];
    });
};

export const getFileContentFromLinks = async ({
  urls,
  requestOrigin,
  maxFiles,
  teamId,
  tmbId,
  customPdfParse,
  usageId
}: {
  urls: string[];
  requestOrigin?: string;
  maxFiles: number;
  teamId: string;
  tmbId: string;
  customPdfParse?: string;
  usageId?: string;
}) => {
  const results = await Promise.all(
    urls.map(async (url) => {
      const fileType = await parseUrlToFileType(url);
      return { url, fileType };
    })
  );

  const parseUrlList = results
    .filter((item) => {
      // 基础校验 + 仅保留文件类型
      if (typeof item.url !== 'string') return false;
      const validPrefixList = ['/', 'http', 'ws'];
      const isValidPrefix = validPrefixList.some((p) => item.url.startsWith(p));

      return isValidPrefix && item.fileType?.type === 'file';
    })
    .map((item) => {
      let url = item.url;
      try {
        const parsedURL = new URL(url, 'http://localhost:3000');
        if (requestOrigin && parsedURL.origin === requestOrigin) {
          url = url.replace(requestOrigin, '');
        }
        return url;
      } catch (error) {
        logger.warn('Failed to parse file URL', { url, error });
        return '';
      }
    })
    .filter(Boolean)
    .slice(0, maxFiles);

  const readFilesResult = await Promise.all(
    parseUrlList
      .map(async (url, index) => {
        // Get from buffer
        const rawTextBuffer = await getS3RawTextSource().getRawTextBuffer({
          sourceId: url,
          customPdfParse
        });
        const fullUrl = url.startsWith('/')
          ? `${process.env.FE_DOMAIN || process.env.FILE_DOMAIN || ''}${process.env.NEXT_PUBLIC_BASE_URL || ''}${url}`
          : url;
        if (rawTextBuffer) {
          const metadata = `index:${index + 1}
filename: ${rawTextBuffer.filename || url}
uploadTime: ${rawTextBuffer.originFileUploadTime || ''}
url:${fullUrl}
`;
          return formatResponseObject({
            filename: rawTextBuffer.filename || url,
            metadata,
            url,
            content: rawTextBuffer.text
          });
        }
        try {
          if (await isInternalAddress(url)) {
            return Promise.reject(PRIVATE_URL_TEXT);
          }

          // Get file buffer data
          const response = await axios.get(url, {
            baseURL: serverRequestBaseUrl,
            responseType: 'arraybuffer'
          });

          const buffer = Buffer.from(response.data, 'binary');

          const urlObj = new URL(url, 'http://localhost:3000');
          const isChatExternalUrl = !urlObj.pathname.includes(
            `/${S3Buckets.private}/${S3Sources.chat}`
          );

          // Get file name
          const { filename, extension, imageParsePrefix } = (() => {
            if (isChatExternalUrl) {
              const contentDisposition = response.headers['content-disposition'] || '';

              // Priority: filename* (RFC 5987, UTF-8 encoded) > filename (traditional)
              const extractFilename = (contentDisposition: string): string => {
                // Try RFC 5987 filename* first (e.g., filename*=UTF-8''encoded-name)
                const filenameStarRegex = /filename\*=([^']*)'([^']*)'([^;\n]*)/i;
                const starMatches = filenameStarRegex.exec(contentDisposition);
                if (starMatches && starMatches[3]) {
                  const charset = starMatches[1].toLowerCase();
                  const encodedFilename = starMatches[3];
                  // Decode percent-encoded UTF-8 filename
                  try {
                    return decodeURIComponent(encodedFilename);
                  } catch (error) {
                    logger.warn('Failed to decode filename*', { encodedFilename, error });
                  }
                }

                // Fallback to traditional filename parameter
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i;
                const matches = filenameRegex.exec(contentDisposition);
                if (matches && matches[1]) {
                  return matches[1].replace(/['"]/g, '');
                }

                return '';
              };

              const matchFilename = extractFilename(contentDisposition);
              const filename = matchFilename || urlObj.pathname.split('/').pop() || 'file';
              const extension = path.extname(filename).replace('.', '');

              return {
                filename,
                extension,
                imageParsePrefix: getFileS3Key.temp({ teamId, filename: '' }).fileParsedPrefix
              };
            }

            return S3ChatSource.parseChatUrl(url);
          })();

          // Get encoding
          const encoding = (() => {
            const contentType = response.headers['content-type'];
            if (contentType) {
              const charsetRegex = /charset=([^;]*)/;
              const matches = charsetRegex.exec(contentType);
              if (matches != null && matches[1]) {
                return matches[1];
              }
            }

            return detectFileEncoding(buffer);
          })();
          // Get actual file upload time from headers or S3 metadata
          const getActualUploadTime = async (): Promise<string> => {
            if (isChatExternalUrl) {
              // For external URLs, try to get Last-Modified header
              const lastModified = response.headers['last-modified'];
              if (lastModified) {
                return new Date(lastModified).toISOString();
              }
            } else {
              // For S3 chat files, get metadata from S3
              try {
                const urlObj = new URL(url, 'http://localhost:3000');
                // Remove proxy prefix and decode to get the actual S3 key
                const pathnameWithoutProxy = urlObj.pathname.replace('/api/common/s3/proxy/', '');
                // Split by '/' to get bucket name and object key
                const pathSegments = pathnameWithoutProxy.split('/');
                // Skip the first segment (bucket name) and join the rest as the object key
                const s3Key = decodeURIComponent(pathSegments.slice(1).join('/'));
                const s3ChatSource = new S3ChatSource();
                const metadata = await s3ChatSource.getFileMetadata(s3Key);
                if (metadata?.uploadTime) {
                  return metadata.uploadTime;
                }
              } catch (error) {
                logger.warn('Failed to get S3 file metadata', { url, error });
              }
            }
            // Fallback to current time
            return new Date().toISOString();
          };

          const actualUploadTime = await getActualUploadTime();
          const { rawText } = await readFileContentByBuffer({
            extension,
            teamId,
            tmbId,
            buffer,
            encoding,
            customPdfParse,
            getFormatText: true,
            imageKeyOptions: imageParsePrefix
              ? {
                  prefix: imageParsePrefix,
                  // 聊天对话里面上传的外部链接，解析出来的图片过期时间设置为1天，而且是存储在临时文件夹的
                  expiredTime: isChatExternalUrl ? addDays(new Date(), 1) : undefined
                }
              : undefined,
            usageId
          });

          const replacedText = replaceS3KeyToPreviewUrl(rawText, addDays(new Date(), 90));

          // Add to buffer
          getS3RawTextSource().addRawTextBuffer({
            sourceId: url,
            sourceName: filename,
            text: replacedText,
            customPdfParse,
            originFileUploadTime: actualUploadTime
          });
          const metadata = `index:${index + 1}
filename: ${filename}
uploadTime: ${actualUploadTime}
url:${fullUrl}`;
          return formatResponseObject({ filename, metadata, url, content: replacedText });
        } catch (error) {
          return formatResponseObject({
            filename: '',
            url,
            metadata: '',
            content: getErrText(error, 'Load file error')
          });
        }
      })
      .filter(Boolean)
  );
  // Sort by upload time in ascending order
  const sortedReadFilesResult = readFilesResult.sort((a, b) => {
    const extractUploadTime = (text: string): string => {
      const uploadTimeMatch = text.match(/uploadTime:\s*(.+?)(?:,|\n)/);
      return uploadTimeMatch ? uploadTimeMatch[1].trim() : '';
    };

    const timeA = extractUploadTime(a.text);
    const timeB = extractUploadTime(b.text);

    if (!timeA && !timeB) return 0;
    if (!timeA) return 1;
    if (!timeB) return -1;

    return new Date(timeA).getTime() - new Date(timeB).getTime();
  });

  const finalReadFilesResult = sortedReadFilesResult.map((item, index) => {
    const newIndex = index + 1;
    const updatedText = item.text.replace(/index:\s*\d+/, `index:${newIndex}`);
    return {
      ...item,
      text: updatedText,
      nodeResponsePreviewText: item.nodeResponsePreviewText
    };
  });

  const text = finalReadFilesResult.map((item) => item?.text ?? '').join('\n******\n');
  return {
    text,
    readFilesResult: finalReadFilesResult
  };
};
