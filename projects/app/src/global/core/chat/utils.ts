import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type {
  ChatHistoryItemResType,
  ChatItemMiniType,
  ToolCiteLinksType,
  ErrorTextItemType
} from '@fastgpt/global/core/chat/type';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getFlatAppResponses } from '@fastgpt/global/core/chat/utils';
import {
  SANDBOX_TOOL_NAME,
  SANDBOX_GET_FILE_URL_TOOL_NAME
} from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxToolIds } from '@fastgpt/global/core/workflow/node/agent/skillTools';

const sandboxToolNames = new Set<string>([
  SANDBOX_TOOL_NAME,
  SANDBOX_GET_FILE_URL_TOOL_NAME,
  ...Object.values(SandboxToolIds)
]);

export const isLLMNode = (item: ChatHistoryItemResType) =>
  item.moduleType === FlowNodeTypeEnum.chatNode || item.moduleType === FlowNodeTypeEnum.toolCall;

export function transformPreviewHistories(
  histories: ChatItemMiniType[],
  responseDetail: boolean
): ChatItemMiniType[] {
  return histories.map((item) => {
    return {
      ...addStatisticalDataToHistoryItem(item),
      responseData: undefined,
      ...(responseDetail ? {} : { totalQuoteList: undefined })
    };
  });
}

const extractCitationIdsFromText = (text: string): string[] => {
  if (!text) return [];

  // Match [24-bit hexadecimal ID](CITE) format
  const citeRegex = /\[([a-f0-9]{24})\]\(CITE\)/gi;
  const matches = text.match(citeRegex);

  if (!matches) return [];

  // Extract ID part (24-bit hexadecimal in brackets)
  const ids = matches
    .map((match) => {
      const idMatch = match.match(/\[([a-f0-9]{24})\]/);
      return idMatch ? idMatch[1] : null;
    })
    .filter((id): id is string => id !== null);

  // Deduplicate
  return Array.from(new Set(ids));
};

export function addStatisticalDataToHistoryItem(historyItem: ChatItemMiniType) {
  if (historyItem.obj !== ChatRoleEnum.AI) return historyItem;
  const flatResData = getFlatAppResponses(historyItem.responseData || []);
  const sandboxEvent = historyItem.value.findLast(
    ({ sandboxEvent }) => sandboxEvent?.status === 'ready' || sandboxEvent?.status === 'referenced'
  )?.sandboxEvent;
  const useAgentSandbox =
    historyItem.useAgentSandbox === true ||
    !!sandboxEvent ||
    historyItem.value.some((value) =>
      [...(value.tools ?? []), ...(value.tool ? [value.tool] : [])].some(
        (tool) => tool.response != null && sandboxToolNames.has(tool.functionName)
      )
    ) ||
    flatResData.some(
      (item) => item.moduleType === FlowNodeTypeEnum.tool && sandboxToolNames.has(item.toolId ?? '')
    );
  if (useAgentSandbox) {
    historyItem = {
      ...historyItem,
      useAgentSandbox: true,
      ...(sandboxEvent?.sandboxId ? { sandboxId: sandboxEvent.sandboxId } : {})
    };
  }
  if (historyItem.totalQuoteList !== undefined || historyItem.toolCiteLinks !== undefined)
    return historyItem;
  if (!historyItem.responseData) return historyItem;

  // get llm module account and history preview length and total quote list and external link list and error text
  const { llmModuleAccount, historyPreviewLength, totalQuoteList, toolCiteLinks, errorText } =
    flatResData.reduce(
      (acc, item) => {
        // LLM
        if (isLLMNode(item)) {
          acc.llmModuleAccount = acc.llmModuleAccount + 1;
          if (acc.historyPreviewLength === undefined) {
            acc.historyPreviewLength = item.historyPreview?.length;
          }
        }

        // Dataset search result
        if (item.moduleType === FlowNodeTypeEnum.datasetSearchNode && item.quoteList) {
          acc.totalQuoteList.push(...item.quoteList.filter(Boolean));
        }

        // Tool call
        if (item.moduleType === FlowNodeTypeEnum.tool) {
          const citeLinks = item?.toolRes?.citeLinks;
          if (citeLinks && Array.isArray(citeLinks)) {
            citeLinks.forEach(({ name = '', url = '' }: ToolCiteLinksType) => {
              if (url) {
                const key = `${name}::${url}`;
                if (!acc.linkDedupe.has(key)) {
                  acc.linkDedupe.add(key);
                  acc.toolCiteLinks.push({ name, url });
                }
              }
            });
          }
        }

        if (item.errorText && !acc.errorText) {
          acc.errorText = {
            moduleName: item.moduleName,
            errorText: item.errorText
          };
        }

        return acc;
      },
      {
        totalQuoteList: [] as SearchDataResponseItemType[],
        toolCiteLinks: [] as ToolCiteLinksType[],
        linkDedupe: new Set<string>(),
        errorText: undefined as ErrorTextItemType | undefined,
        llmModuleAccount: 0,
        historyPreviewLength: undefined as number | undefined
      }
    );

  // Filter quote list to only include citations actually referenced in the response text
  const responseText = historyItem.value.map((v) => v.text?.content || '').join('');
  const citedIds = extractCitationIdsFromText(responseText);
  const filteredQuoteList = totalQuoteList.filter((quote) => citedIds.includes(quote.id));

  return {
    ...historyItem,
    totalQuoteList: filteredQuoteList,
    ...(toolCiteLinks.length ? { toolCiteLinks } : {}),
    ...(errorText ? { errorText } : {}),

    /** @deprecated */
    llmModuleAccount,
    /** @deprecated */
    historyPreviewLength
  };
}
