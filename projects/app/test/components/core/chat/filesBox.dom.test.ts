import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, ChakraProvider } from '@chakra-ui/react';
import { describe, expect, it, vi } from 'vitest';
import { theme } from '@fastgpt/web/styles/theme';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { UserInputFileItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';

vi.mock('@/components/Markdown/img/Image', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({
  useSystem: () => ({ isPc: true })
}));
vi.mock('@fastgpt/web/hooks/useWidthVariable', () => ({
  useWidthVariable: () => '1fr'
}));

import FilesBlock from '@/components/core/chat/ChatContainer/ChatBox/components/FilesBox';

describe('FilesBlock', () => {
  it('renders a readable filename inside a white attachment card', async () => {
    const files: UserInputFileItemType[] = [
      {
        id: 'file-1',
        type: ChatFileTypeEnum.file,
        name: '参考文档.pdf',
        icon: 'file/fill/pdf',
        status: 1,
        url: 'https://example.com/reference.pdf'
      }
    ];

    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          { theme },
          React.createElement(Box, { color: 'white' }, React.createElement(FilesBlock, { files }))
        )
      );
    });

    const filename = Array.from(container.querySelectorAll('p')).find(
      (element) => element.textContent === '参考文档.pdf'
    );
    expect(filename).toBeDefined();
    expect(getComputedStyle(filename!).color).toBe('var(--chakra-colors-myGray-900)');

    await act(async () => root.unmount());
    container.remove();
  });
});
