import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/components/Markdown', () => ({
  default: ({ source }: { source: string }) => React.createElement('pre', null, source)
}));
vi.mock('@/components/core/chat/ChatContainer/ChatBox/Provider', () => ({ ChatBoxContext: {} }));
vi.mock('@/components/core/chat/ChatContainer/ChatBox/components/QuoteList', () => ({
  default: () => null
}));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));

import { WholeResponseContent } from '@/components/core/chat/components/WholeResponseModal';

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('displays Pi summary fields through the same detail component as the simple Agent', async () => {
  const onOpenRequestIdDetail = vi.fn();
  const activeModule: ChatHistoryItemResType = {
    id: 'pi-detail',
    nodeId: 'pi-node',
    moduleName: 'AgentV2',
    moduleType: FlowNodeTypeEnum.agent,
    model: 'Qwen-test',
    totalPoints: 0.25,
    query: 'task',
    inputTokens: 120,
    outputTokens: 20,
    temperature: 0.7,
    maxToken: 512,
    contextTotalLen: 3,
    finishReason: 'stop',
    reasoningText: 'reasoning',
    textOutput: 'done',
    llmRequestIds: ['pi-request-1'],
    historyPreview: [
      { obj: ChatRoleEnum.System, value: 'system' },
      { obj: ChatRoleEnum.Human, value: 'task' },
      { obj: ChatRoleEnum.AI, value: 'done' }
    ]
  };

  await act(async () =>
    root.render(
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(WholeResponseContent, { activeModule, onOpenRequestIdDetail })
      )
    )
  );

  for (const label of [
    'chat:completion_finish_reason',
    'common:core.chat.response.module model',
    'chat:llm_tokens',
    'common:core.chat.response.module query',
    'common:core.chat.response.context total length',
    'common:core.chat.response.module temperature',
    'common:core.chat.response.module maxToken',
    'chat:reasoning_content',
    'common:core.chat.response.module historyPreview'
  ]) {
    expect(container.textContent).toContain(label);
  }
  expect(container.textContent).toContain('Qwen-test');
  expect(container.textContent).toContain('Input/Output = 120/20');
  expect(container.textContent).toContain('reasoning');
  expect(container.textContent).toContain('System');
  expect(container.textContent).toContain('Human');
  expect(container.textContent).toContain('AI');
  const request = container.querySelector<HTMLElement>('[title="common:Click_to_expand"]');
  expect(request).not.toBeNull();
  await act(async () => request?.click());
  expect(onOpenRequestIdDetail).toHaveBeenCalledWith('pi-request-1');
});
