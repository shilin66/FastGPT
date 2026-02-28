import type {
  ApiDatasetDetailResponse,
  APIFileItemType,
  ApiFileReadContentResponse,
  ConfluenceServer
} from '@fastgpt/global/core/dataset/apiDataset/type';
import type { Page } from './client';
import ConfluenceClient from './client';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { getAllAttachmentsByPageId, getAllPagesByPageId, getSpaceAllPagesRecursive } from './utils';
import { Converter } from './adf2md';
import adf2md = Converter.adf2md;
import parseADF = Converter.parseADF;
import { getFileS3Key, uploadImage2S3Bucket } from '../../../../common/s3/utils';
import { Mimes, S3Buckets } from '../../../../common/s3/constants';

export const useConfluenceDatasetRequest = ({
  confluenceServer
}: {
  confluenceServer: ConfluenceServer;
}) => {
  const confluenceBaseUrl = confluenceServer.baseUrl || feConfigs.confluenceUrl;
  if (!confluenceBaseUrl) {
    return Promise.reject('Confluence base URL is not provided');
  }
  const { spaceKey, pageId, account, token, syncSubPages } = confluenceServer;
  const client = new ConfluenceClient(confluenceBaseUrl, account, token);

  const listFiles = async ({
    parentId
  }: {
    parentId?: ParentIdType;
  }): Promise<APIFileItemType[]> => {
    const parent: Record<string, string> = {};
    if (parentId) {
      const allPages = await getAllPagesByPageId(client, String(parentId), true);
      return allPages.map((page) => ({
        id: page.id,
        rawId: page.id,
        parentId: page.parentId,
        name: page.title,
        type: parent[page.id] === 'folder' ? ('folder' as const) : ('file' as const),
        hasChild: parent[page.id] !== undefined,
        updateTime: new Date(page.version.createdAt),
        createTime: new Date(page.createdAt)
      }));
    }
    const spaces = await client.getSpacesByKeys(spaceKey);
    if (spaces.results.length === 0) return Promise.reject(`Space ${spaceKey} not found`);
    const spaceId = spaces.results[0].id;

    let allPages: Page[] = [];

    if (!pageId) {
      allPages = await getSpaceAllPagesRecursive(client, spaceId);
    } else {
      allPages = await getAllPagesByPageId(client, pageId, syncSubPages);
    }

    if (allPages.length === 0) {
      return Promise.reject('No pages found in the specified space or page');
    }

    allPages.forEach((page) => {
      if (page.parentId !== null) {
        parent[page.parentId] = page.parentType;
      }
    });
    return allPages.map((page) => ({
      id: page.id,
      rawId: page.id,
      parentId: page.parentId,
      name: page.title,
      type: 'file',
      hasChild: false,
      updateTime: new Date(page.version.createdAt),
      createTime: new Date(page.createdAt)
    }));
  };

  const getFileContent = async ({
    apiFileId,
    datasetId
  }: {
    apiFileId: string;
    datasetId: string;
  }): Promise<ApiFileReadContentResponse> => {
    const { title, body } = await client.getPageById(apiFileId, 'atlas_doc_format');
    const markdown = adf2md(parseADF(body.atlas_doc_format.value));
    const attachments = await getAllAttachmentsByPageId(client, apiFileId);
    const { fileParsedPrefix } = getFileS3Key.dataset({
      datasetId,
      filename: apiFileId
    });
    for (const attachment of attachments) {
      // "image/...",
      if (markdown.result.includes(attachment.fileId)) {
        if (attachment.mediaType.startsWith('image')) {
          const imgBase64 = await client.downloadAttachmentToBase64(
            attachment.downloadLink,
            attachment.mediaType
          );
          const mime = imgBase64.split(';')[0].split(':')[1];
          const ext = `.${mime.split('/')[1].replace('x-', '')}`;
          const src = await uploadImage2S3Bucket('private', {
            base64Img: `${imgBase64}`,
            uploadKey: `${fileParsedPrefix}/${attachment.fileId}${ext}`,
            mimetype: Mimes[ext as keyof typeof Mimes],
            filename: `${attachment.fileId}${ext}`
          });
          markdown.result = markdown.result.replaceAll(
            attachment.fileId,
            `/api/common/s3/proxy/${S3Buckets.private}/${src}`
          );
        } else {
          const webUI = global.feConfigs.confluenceUrl + attachment.webuiLink;
          markdown.result = markdown.result.replaceAll(
            `![](${attachment.fileId})`,
            `[${attachment.title}](${webUI})`
          );
        }
      }
    }
    return {
      title: title,
      rawText: markdown.result
    };
  };

  const getFileDetail = async ({
    apiFileId
  }: {
    apiFileId: string;
  }): Promise<ApiDatasetDetailResponse> => {
    const page = await client.getPageById(apiFileId, '');

    return {
      rawId: apiFileId,
      name: page?.title,
      parentId: null,
      id: apiFileId,
      type: 'file',
      hasChild: false,
      updateTime: new Date(page.version.createdAt),
      createTime: new Date(page.createdAt)
    };
  };

  const getFilePreviewUrl = async ({ apiFileId }: { apiFileId: string }) => {
    console.log('>>>>>>>>>>>>>', apiFileId);
    const page = await client.getPageById(apiFileId, '');
    const webui = page?._links.webui;

    return `${confluenceBaseUrl}${webui}`;
  };

  const getFileRawId = (fileId: string) => {
    return fileId;
  };

  return {
    getFileContent,
    listFiles,
    getFilePreviewUrl,
    getFileDetail,
    getFileRawId
  };
};
