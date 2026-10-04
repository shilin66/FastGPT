import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/components/Markdown', () => ({
  default: ({ source }: { source: string }) => React.createElement('pre', null, source)
}));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({
  default: ({ src, w, fill }: { src: string; w: string; fill?: string }) =>
    React.createElement('span', { 'data-avatar': src, 'data-width': w, 'data-fill': fill })
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));

import AIResponseBox from '@/components/core/chat/components/AIResponseBox';

describe('chat tool cards', () => {
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

  it('removes collapsed tool details and uses the same icon size as run details', async () => {
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(AIResponseBox, {
            chatItemDataId: 'answer-1',
            value: {
              tools: [
                {
                  id: 'write-1',
                  toolName: '写入文件',
                  toolAvatar: 'core/workflow/template/readFiles',
                  functionName: 'sandbox_write_file',
                  params: '{"path":"report.txt","content":"large-content"}',
                  response: 'done'
                },
                {
                  id: 'execute-1',
                  toolName: '执行命令',
                  toolAvatar: 'core/workflow/template/codeRun',
                  functionName: 'sandbox_execute',
                  params: '{"command":"python report.txt"}',
                  response: 'ok'
                }
              ]
            },
            isLastResponseValue: false,
            isLastChild: false,
            isChatting: false
          })
        )
      )
    );

    const buttons = container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]');
    expect(buttons).toHaveLength(2);
    expect(container.textContent).not.toContain('large-content');
    expect(
      container
        .querySelector('[data-avatar="core/workflow/template/readFiles"]')
        ?.getAttribute('data-width')
    ).toBe('26px');
    expect(
      container
        .querySelector('[data-avatar="core/workflow/template/readFiles"]')
        ?.getAttribute('data-fill')
    ).toBe('none');

    await act(async () => buttons[0].click());
    expect(container.textContent).toContain('large-content');
    await act(async () => buttons[0].click());
    expect(container.textContent).not.toContain('large-content');
  });
});
