import type { AssistantMessage } from '@mariozechner/pi-ai';
import { customNanoid } from '@fastgpt/global/common/string/tools';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { saveLLMRequestRecord } from '../../../../../ai/record/controller';
import type { DispatchNodeResponseType } from '@fastgpt/global/core/workflow/runtime/type';
import {
  ChatCompletionMessageParamSchema,
  type ChatCompletionMessageParam
} from '@fastgpt/global/core/ai/llm/type';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { piMessagesToGPT } from './context';

const finishReasons = {
  stop: 'stop',
  length: 'length',
  toolUse: 'tool_calls',
  error: 'error',
  aborted: 'error'
} as const;

export const createPiRequestTracker = (useVision = false) => {
  const requestIds: string[] = [];
  const responseData: DispatchNodeResponseType = {
    llmRequestIds: requestIds,
    inputTokens: 0,
    outputTokens: 0
  };
  let pendingRequest: { readonly requestId: string; readonly body: object } | undefined;
  let requestMessages: ChatCompletionMessageParam[] = [];

  const updateHistory = (messages: ChatCompletionMessageParam[]) => {
    responseData.contextTotalLen = messages.length;
    responseData.historyPreview = getHistoryPreview(
      GPTMessages2Chats({ messages, reserveTool: false }),
      10000,
      useVision
    );
  };

  const saveResponse = async (response: Record<string, unknown>) => {
    if (!pendingRequest) return;
    const request = pendingRequest;
    pendingRequest = undefined;
    await saveLLMRequestRecord({ ...request, response });
  };

  return {
    requestIds,
    responseData,
    capturePayload: (payload: object) => {
      const requestId = customNanoid(
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890_-',
        16
      );
      pendingRequest = { requestId, body: structuredClone(payload) };
      requestIds.push(requestId);
      if ('messages' in payload) {
        const messages = ChatCompletionMessageParamSchema.array().safeParse(payload.messages);
        if (messages.success) {
          requestMessages = messages.data;
          updateHistory(requestMessages);
        }
      }
      if ('temperature' in payload && typeof payload.temperature === 'number') {
        responseData.temperature = payload.temperature;
      }
      if ('max_completion_tokens' in payload && typeof payload.max_completion_tokens === 'number') {
        responseData.maxToken = payload.max_completion_tokens;
      } else if ('max_tokens' in payload && typeof payload.max_tokens === 'number') {
        responseData.maxToken = payload.max_tokens;
      }
    },
    saveMessage: (message: AssistantMessage) => {
      const answerText = message.content
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('');
      const reasoningText = message.content
        .filter((part) => part.type === 'thinking')
        .map((part) => part.thinking)
        .join('');
      const inputTokens = message.usage.input + message.usage.cacheRead + message.usage.cacheWrite;
      responseData.inputTokens = (responseData.inputTokens ?? 0) + inputTokens;
      responseData.outputTokens = (responseData.outputTokens ?? 0) + message.usage.output;
      responseData.reasoningText = [responseData.reasoningText, reasoningText]
        .filter(Boolean)
        .join('\n\n');
      responseData.textOutput = (responseData.textOutput ?? '') + answerText;
      responseData.finishReason = finishReasons[message.stopReason];
      updateHistory([...requestMessages, ...piMessagesToGPT([message])]);
      return saveResponse({
        answerText,
        reasoningText,
        toolCalls: message.content
          .filter((part) => part.type === 'toolCall')
          .map((part) => ({
            id: part.id,
            type: 'function',
            function: { name: part.name, arguments: JSON.stringify(part.arguments) }
          })),
        finish_reason: finishReasons[message.stopReason],
        usage: {
          inputTokens,
          outputTokens: message.usage.output
        },
        ...(message.responseId && { responseId: message.responseId }),
        ...(message.errorMessage && { error: message.errorMessage })
      });
    },
    saveError: (error: unknown) => {
      responseData.finishReason = 'error';
      return saveResponse({ error: getErrText(error), finish_reason: 'error' });
    }
  };
};
