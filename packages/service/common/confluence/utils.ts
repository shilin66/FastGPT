import ConfluenceClient, { Attachment, ChildPage, Page } from './client';

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

// 递归获取指定 pageId 下的所有 childPage
export const getAllChildPagesByPageId = async (
  client: ConfluenceClient,
  pageId: string
): Promise<ChildPage[]> => {
  const allChildren: ChildPage[] = [];

  const fetchChildren = async (pageId: string, cursor: string | null = null) => {
    const response = await client.getChildren(pageId, cursor);
    allChildren.push(...response.results);

    if (response._links.next) {
      const nextCursor = getCursor(response._links.next);
      await fetchChildren(pageId, nextCursor);
    }

    // 递归获取每个子页面的子页面
    for (const child of response.results) {
      await fetchChildren(child.id);
    }
  };

  await fetchChildren(pageId);
  return allChildren;
};

// 获取指定 pageId 下的所有页面详细内容，包括pageId
export const getAllPagesByPageId = async (
  client: ConfluenceClient,
  pageId: string,
  syncSubPages: boolean = false
): Promise<Page[]> => {
  const allPageIds: string[] = [];
  allPageIds.push(pageId);
  if (syncSubPages) {
    const childPages = await getAllChildPagesByPageId(client, pageId);
    allPageIds.push(...childPages.map((child) => child.id));
  }

  const PageResponse = await client.getPagesByIds(allPageIds);
  return PageResponse.results;
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
