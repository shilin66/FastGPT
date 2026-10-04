import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SandboxFilePanelProvider,
  useSandboxFilePanel
} from '@/pageComponents/chat/SandboxEditor/PanelContext';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/pageComponents/chat/SandboxEditor/Editor', () => ({
  default: ({ onRequestExpand }: { onRequestExpand: () => void }) =>
    React.createElement('button', { onClick: onRequestExpand }, 'Select file')
}));
import SandboxFilePanel from '@/pageComponents/chat/SandboxEditor/Panel';

const Harness = () => {
  const panel = useSandboxFilePanel();
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'button',
      { onClick: () => panel?.open({ appId: 'app-a', chatId: 'chat-a', sandboxId: 'sandbox-a' }) },
      'Open files'
    ),
    React.createElement('output', { 'data-testid': 'expanded' }, panel?.isExpanded ? 'yes' : 'no'),
    React.createElement('output', { 'data-testid': 'refresh-version' }, panel?.refreshVersion),
    React.createElement(
      'output',
      { 'data-testid': 'allow-start-version' },
      panel?.allowStartVersion
    ),
    React.createElement(SandboxFilePanel)
  );
};

describe('sandbox file panel controls', () => {
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

  it('shows icon controls and expands when a narrow file is selected', async () => {
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(
            SandboxFilePanelProvider,
            { scopeKey: 'app-a:chat-a' },
            React.createElement(Harness)
          )
        )
      )
    );
    await act(async () =>
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent === 'Open files')
        ?.click()
    );
    const refresh = container.querySelector<HTMLButtonElement>(
      'button[aria-label="chat:sandbox_refresh"]'
    );
    expect(refresh?.textContent).toBe('');
    await act(async () => refresh?.click());
    expect(container.querySelector('[data-testid="refresh-version"]')?.textContent).toBe('2');
    expect(container.querySelector('[data-testid="allow-start-version"]')?.textContent).toBe('2');

    await act(async () => window.dispatchEvent(new Event('online')));
    expect(container.querySelector('[data-testid="refresh-version"]')?.textContent).toBe('3');
    expect(container.querySelector('[data-testid="allow-start-version"]')?.textContent).toBe('2');

    await act(async () =>
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent === 'Select file')
        ?.click()
    );
    expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe('yes');
    expect(container.querySelector('button[aria-label="chat:sandbox_restore"]')).not.toBeNull();
    expect(container.querySelector('[style*="position: fixed"]')).toBeNull();

    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="chat:sandbox_restore"]')
        ?.click()
    );
    expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe('no');
    expect(container.querySelector('button[aria-label="chat:sandbox_expand"]')).not.toBeNull();
  });
});
