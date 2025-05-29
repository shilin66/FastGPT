import type { AxiosInstance, AxiosResponse, AxiosRequestConfig } from 'axios';
import axios from 'axios';
import { getFileContentTypeFromHeader, guessBase64ImageType } from '../file/utils';

// 定义接口
interface Link {
  [key: string]: string;
}

interface Version {
  createdAt: string;
  message: string;
  number: number;
  minorEdit: boolean;
  authorId: string;
  createdBy: string;
}

interface Body {
  storage: {};
  atlas_doc_format: any;
  view?: {};
}

export interface Attachment {
  id: string;
  status: string;
  title: string;
  createdAt: string;
  pageId?: string;
  blogPostId?: string;
  customContentId?: string;
  mediaType: string;
  mediaTypeDescription: string;
  comment: string;
  fileId: string;
  fileSize: number;
  webuiLink: string;
  downloadLink: string;
  version: Version;
  _links: Link;
}

export interface AttachmentsResponse {
  results: Attachment[];
  _links: Link;
}

export interface Page {
  id: string;
  status: string;
  title: string;
  spaceId: string;
  parentId: string;
  parentType: string;
  position: number;
  authorId: string;
  ownerId: string;
  lastOwnerId: string;
  createdAt: string;
  version: Version;
  body: Body;
  labels?: Labels;
  properties?: Properties;
  operations?: Operations;
  likes?: Likes;
  versions?: Versions;
  isFavoritedByCurrentUser?: boolean;
  _links: Link;
}

export interface ChildPage {
  id: string;
  status: string;
  title: string;
  spaceId: string;
  childPosition: number;
}

interface Labels {
  results: Label[];
  meta: Meta;
  _links: Link;
}

interface Label {
  id: string;
  name: string;
  prefix: string;
}

interface Properties {
  results: Property[];
  meta: Meta;
  _links: Link;
}

interface Operations {
  results: Operation[];
  meta: Meta;
  _links: Link;
}

interface Operation {
  operation: string;
  targetType: string;
}

interface Likes {
  results: Like[];
  meta: Meta;
  _links: Link;
}

interface Like {
  accountId: string;
}

interface Versions {
  results: Version[];
  meta: Meta;
  _links: Link;
}

interface Meta {
  hasMore: boolean;
  cursor: string;
}

export interface PagesResponse {
  results: Page[];
  _links: {
    next?: string;
    base: string;
  };
}

export interface ChildPagesResponse {
  results: ChildPage[];
  _links: {
    next?: string;
    base: string;
  };
}

interface Description {
  plain: {};
  view: {};
}

interface Icon {
  path: string;
  apiDownloadLink: string;
}

interface Space {
  id: string;
  key: string;
  name: string;
  type: string;
  status: string;
  authorId: string;
  createdAt: string;
  homepageId: string;
  description: Description;
  icon: Icon;
  _links: Link;
  labels?: Labels;
  properties?: Properties;
  operations?: Operations;
  permissions?: Permissions;
}

interface Labels {
  results: Label[];
  meta: Meta;
  _links: Link;
}

interface Label {
  id: string;
  name: string;
  prefix: string;
}

interface Properties {
  results: Property[];
  meta: Meta;
  _links: Link;
}

interface Property {
  id: string;
  key: string;
  createdAt: string;
  createdBy: string;
  version: Version;
}

interface Operations {
  results: Operation[];
  meta: Meta;
  _links: Link;
}

interface Operation {
  operation: string;
  targetType: string;
}

interface Permissions {
  results: Permission[];
  meta: Meta;
  _links: Link;
}

interface Permission {
  id: string;
  principal: Principal;
  operation: OperationDetail;
}

interface Principal {
  type: string;
  id: string;
}

interface OperationDetail {
  key: string;
  targetType: string;
}

interface Meta {
  hasMore: boolean;
  cursor: string;
}

interface SpacesResponse {
  results: Space[];
  _links: {
    next?: string;
    base: string;
  };
}

interface SpaceResponse {
  id: string;
  key: string;
  name: string;
  type: string;
  status: string;
  authorId: string;
  createdAt: string;
  homepageId: string;
  description: Description;
  icon: Icon;
  labels: Labels;
  properties: Properties;
  operations: Operations;
  permissions: Permissions;
  _links: Link;
}

class ConfluenceClient {
  private readonly baseURL: string;
  private readonly account: string;
  private readonly apiToken: string;
  private readonly client: AxiosInstance;

  constructor(baseURL: string, username: string, token: string) {
    this.baseURL = baseURL;
    this.account = username;
    this.apiToken = token;
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${this.account}:${this.apiToken}`).toString('base64')}`
      }
    });
  }

  async getCurrentUser(): Promise<any> {
    try {
      const response: AxiosResponse<any> = await this.client.get('/rest/api/user/current');
      return response.data;
    } catch (error) {
      console.error('Error fetching current user data:', error);
      throw new Error(`Failed to fetch current user data: ${error}`);
    }
  }

  // 获取指定空间的信息
  async getSpaceById(spaceId: string): Promise<SpaceResponse> {
    try {
      const response: AxiosResponse<SpaceResponse> = await this.client.get(
        `/api/v2/spaces/${spaceId}`
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching space data:', error);
      throw new Error(`Failed to fetch space data: ${error}`);
    }
  }

  // 获取指定页面的信息
  async getPageById(pageId: string, bodyFormat: string = 'storage'): Promise<Page> {
    try {
      const response: AxiosResponse<Page> = await this.client.get(`/api/v2/pages/${pageId}`, {
        params: { 'body-format': bodyFormat }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching page data:', error);
      throw new Error(`Failed to fetch page data: ${error}`);
    }
  }

  // 根据空间 key 获取空间信息
  async getSpacesByKeys(spaceKeys: string): Promise<SpacesResponse> {
    try {
      const response: AxiosResponse<SpacesResponse> = await this.client.get('/api/v2/spaces', {
        params: { keys: spaceKeys }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching spaces by keys:', error);
      throw new Error(`Failed to fetch spaces by keys: ${error}`);
    }
  }

  // 获取指定空间下的所有页面
  async getPagesInSpace(spaceId: string, cursor: string | null = null): Promise<PagesResponse> {
    try {
      const params: AxiosRequestConfig['params'] = {
        cursor: cursor || undefined,
        'body-format': 'atlas_doc_format',
        limit: 250
      };
      const response: AxiosResponse<PagesResponse> = await this.client.get(
        `/api/v2/spaces/${spaceId}/pages`,
        {
          params
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching pages in space:', error);
      throw new Error(`Failed to fetch pages in space: ${error}`);
    }
  }

  //
  async getPagesByIds(pageIds: string[], cursor: string | null = null): Promise<PagesResponse> {
    try {
      const params: AxiosRequestConfig['params'] = {
        id: pageIds.join(','),
        cursor: cursor || undefined,
        'body-format': 'atlas_doc_format',
        limit: 250
      };
      const response: AxiosResponse<PagesResponse> = await this.client.get(`/api/v2/pages/`, {
        params
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching pages by ids:', error);
      throw new Error(`Failed to fetch pages by ids: ${error}`);
    }
  }

  // 获取指定页面的子页面
  async getChildren(pageId: string, cursor: string | null = null): Promise<ChildPagesResponse> {
    try {
      const params: AxiosRequestConfig['params'] = {
        cursor: cursor || undefined,
        limit: 250
      };
      const response: AxiosResponse<ChildPagesResponse> = await this.client.get(
        `/api/v2/pages/${pageId}/children`,
        {
          params
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching children pages:', error);
      throw new Error(`Failed to fetch children pages: ${error}`);
    }
  }

  async getAttachments(pageId: string, cursor: string | null = null): Promise<AttachmentsResponse> {
    try {
      const params: AxiosRequestConfig['params'] = {
        cursor: cursor || undefined,
        limit: 250
      };
      const response: AxiosResponse<AttachmentsResponse> = await this.client.get(
        `/api/v2/pages/${pageId}/attachments`,
        { params }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching attachments:', error);
      throw new Error(`Failed to fetch attachments: ${error}`);
    }
  }

  // fetch head from link /download/attachments/12033720325/image-20240401-004622.png?version=1&modificationDate=1711932385542&cacheVersion=1&api=v2"
  async downloadAttachmentToBase64(link: string, mediaType: string | undefined): Promise<string> {
    try {
      const response: AxiosResponse<any> = await this.client.get(link, {
        responseType: 'arraybuffer' // 确保接收的是二进制数据
      });
      // 将数据转为 Base64
      const base64 = Buffer.from(response.data, 'binary').toString('base64');

      const imageType =
        mediaType ||
        getFileContentTypeFromHeader(response.headers['content-type']) ||
        guessBase64ImageType(base64);

      // 构造 Base64 URL
      return `data:${imageType};base64,${base64}`;
    } catch (error) {
      console.error('Error fetching download url:', error);
      throw new Error(`Failed to fetch download url: ${error}`);
    }
  }
}

export default ConfluenceClient;
