import type { Attachment, ChildPage, Page } from './client';
import type ConfluenceClient from './client';

export const getSpaceAllPagesRecursive = async (
  client: ConfluenceClient,
  spaceId: string
): Promise<Page[]> => {
  const allPages: Page[] = [];
  try {
    const recursivePage = async (cursor: string | null) => {
      const response = await client.getPagesInSpace(spaceId, cursor);
      allPages.push(...response.results);
      const next = response._links.next;
      if (next) {
        const nextCursor = getCursor(next);
        if (nextCursor) {
          return recursivePage(nextCursor);
        }
      }
    };
    await recursivePage(null);
    return allPages;
  } catch (error) {
    console.error('Error fetching all pages in space:', error);
    throw error;
  }
};

const MAX_CONCURRENT_REQUESTS = 10; //最多同时请求10个页面

export const getAllChildPagesByPageId = async (
  client: ConfluenceClient,
  pageId: string
): Promise<ChildPage[]> => {
  const allChildren: ChildPage[] = [];
  const queue: { pageId: string; cursor: string | null }[] = [{ pageId, cursor: null }];

  while (queue.length > 0) {
    const batch = queue.splice(0, MAX_CONCURRENT_REQUESTS);
    const responses = await Promise.all(
      batch.map(async ({ pageId: currentId, cursor }) => {
        return await client.getChildren(currentId, cursor);
      })
    );

    for (const [index, response] of responses.entries()) {
      allChildren.push(...response.results);

      if (response._links.next) {
        const nextCursor = getCursor(response._links.next);
        queue.push({ pageId: batch[index].pageId, cursor: nextCursor });
      }

      for (const child of response.results) {
        queue.push({ pageId: child.id, cursor: null });
      }
    }
  }

  return allChildren;
};

// 获取指定 pageId 下的所有页面详细内容，包括pageId
export const getAllPagesByPageId = async (
  client: ConfluenceClient,
  pageId: string,
  syncSubPages: boolean = false
): Promise<Page[]> => {
  const allPageIds: string[] = [];
  const pages: Page[] = [];
  allPageIds.push(pageId);
  if (syncSubPages) {
    const childPages = await getAllChildPagesByPageId(client, pageId);
    allPageIds.push(...childPages.map((child) => child.id));
  }
  // 每250个pageId 分批处理
  for (let i = 0; i < allPageIds.length; i += 250) {
    const chunk = allPageIds.slice(i, i + 250);
    const PageResponse = await client.getPagesByIds(chunk);
    pages.push(...PageResponse.results);
  }
  return pages;
};
const getCursor = (url: string) => {
  // 创建一个 URL 对象
  const urlObj = new URL(url, 'http://example.com');

  // 获取 `cursor` 参数的值
  return urlObj.searchParams.get('cursor');
};

// 获取指定pageId下的所有附件
export const getAllAttachmentsByPageId = async (
  client: ConfluenceClient,
  pageId: string
): Promise<Attachment[]> => {
  const allAttachments: Attachment[] = [];
  const recursiveAttachments = async (cursor: string | null) => {
    const attachmentsResponse = await client.getAttachments(pageId, cursor);
    allAttachments.push(...attachmentsResponse.results);
    const next = attachmentsResponse._links.next;
    if (next) {
      const nextCursor = getCursor(next);
      if (nextCursor) {
        return recursiveAttachments(nextCursor);
      }
    }
  };
  await recursiveAttachments(null);
  return allAttachments;
};
