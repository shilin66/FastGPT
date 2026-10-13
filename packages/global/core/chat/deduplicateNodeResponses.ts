import type { ChatHistoryItemResType } from './type';

export const deduplicateNodeResponses = (
  responses: ChatHistoryItemResType[]
): ChatHistoryItemResType[] => {
  const responseIds = new Set<string>();
  return responses.filter((item) => {
    if (!item.id) return true;
    if (responseIds.has(item.id)) return false;
    responseIds.add(item.id);
    return true;
  });
};
