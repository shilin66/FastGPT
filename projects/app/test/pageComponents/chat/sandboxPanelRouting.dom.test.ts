import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import type { ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { SandboxToolIds } from '@fastgpt/global/core/workflow/node/agent/skillTools';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/pageComponents/chat/SandboxEditor/modal', () => ({
  default: ({ sandboxId }: { sandboxId?: string }) =>
    React.createElement('div', { 'data-testid': 'legacy-modal' }, sandboxId)
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));

import {
  SandboxFilePanelProvider,
  useSandboxFilePanel
} from '@/pageComponents/chat/SandboxEditor/PanelContext';
import {
  useAutoOpenSandboxFiles,
  useSandboxEditor
} from '@/pageComponents/chat/SandboxEditor/hook';

const OpenFiles = () => {
  const panel = useSandboxFilePanel();
  const { onOpenSandboxModal, SandboxEditorModal } = useSandboxEditor({
    appId: 'app-a',
    chatId: 'chat-a',
    sandboxId: 'sandbox-a'
  });
  return React.createElement(
    React.Fragment,
    null,
    React.createElement('button', { onClick: onOpenSandboxModal }, 'Open files'),
    React.createElement(
      'output',
      { 'data-testid': 'panel-state' },
      panel?.isOpen ? panel.scope?.sandboxId : 'closed'
    ),
    React.createElement(SandboxEditorModal)
  );
};

const AutoOpenFiles = () => {
  useAutoOpenSandboxFiles({ appId: 'app-a', chatId: 'chat-a' });
  const panel = useSandboxFilePanel();
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'output',
      { 'data-testid': 'auto-panel-state' },
      panel?.isOpen ? 'open' : 'closed'
    ),
    React.createElement(
      'output',
      { 'data-testid': 'auto-panel-width-mode' },
      panel?.isAutoOpened ? 'compact' : 'saved'
    ),
    React.createElement('output', { 'data-testid': 'auto-refresh-version' }, panel?.refreshVersion),
    React.createElement(
      'output',
      { 'data-testid': 'auto-allow-start-version' },
      panel?.allowStartVersion
    ),
    React.createElement('button', { onClick: panel?.close }, 'Close files')
  );
};

const makeToolRecord = (
  dataId: string,
  status: ChatStatusEnum,
  options: {
    functionName?: string;
    response?: string;
    sandboxPhase?: 'connecting' | 'ready' | 'failed';
  } = {}
): ChatSiteItemType => ({
  id: dataId,
  dataId,
  status,
  sandboxPhase: options.sandboxPhase ?? 'ready',
  obj: ChatRoleEnum.AI,
  value: [
    {
      tools: [
        {
          id: `tool-${dataId}`,
          toolName: '写入文件',
          toolAvatar: 'core/workflow/template/readFiles',
          functionName: options.functionName ?? SandboxToolIds.writeFile,
          params: '{"path":"report.txt"}',
          response: options.response
        }
      ]
    }
  ]
});

describe('sandbox file entry routing', () => {
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

  it('opens the right pane and clears the old scope when the conversation changes', async () => {
    const render = async (scopeKey: string) =>
      act(async () =>
        root.render(
          React.createElement(
            SandboxFilePanelProvider,
            { scopeKey },
            React.createElement(OpenFiles)
          )
        )
      );
    await render('app-a:chat-a');
    await act(async () => container.querySelector('button')!.click());
    expect(container.querySelector('[data-testid="panel-state"]')?.textContent).toBe('sandbox-a');
    expect(container.querySelector('[data-testid="legacy-modal"]')).toBeNull();
    await render('app-a:chat-b');
    expect(container.querySelector('[data-testid="panel-state"]')?.textContent).toBe('closed');
  });

  it('retains the original modal when no page-level file pane exists', async () => {
    await act(async () => root.render(React.createElement(OpenFiles)));
    await act(async () => container.querySelector('button')!.click());
    expect(container.querySelector('[data-testid="legacy-modal"]')?.textContent).toBe('sandbox-a');
  });

  it('opens on the first new file tool call and respects a later manual close', async () => {
    const render = async (chatRecords: ChatSiteItemType[]) =>
      act(async () =>
        root.render(
          React.createElement(
            ChatRecordContext.Provider,
            {
              value: {
                isLoadingRecords: false,
                chatRecords,
                setChatRecords: vi.fn(),
                isChatRecordsLoaded: true,
                totalRecordsCount: chatRecords.length,
                ScrollData: ({ children }) => React.createElement('div', null, children),
                itemRefs: { current: new Map() }
              }
            },
            React.createElement(
              SandboxFilePanelProvider,
              { scopeKey: 'app-a:chat-a' },
              React.createElement(AutoOpenFiles)
            )
          )
        )
      );

    await render([]);
    expect(container.querySelector('[data-testid="auto-panel-state"]')?.textContent).toBe('closed');
    await render([
      makeToolRecord('new-file', ChatStatusEnum.running, { sandboxPhase: 'connecting' })
    ]);
    expect(container.querySelector('[data-testid="auto-panel-state"]')?.textContent).toBe('closed');
    await render([
      makeToolRecord('new-file', ChatStatusEnum.running, {
        response: 'ok',
        sandboxPhase: 'connecting'
      })
    ]);
    expect(container.querySelector('[data-testid="auto-panel-state"]')?.textContent).toBe('closed');
    await render([makeToolRecord('new-file', ChatStatusEnum.running, { response: 'ok' })]);
    expect(container.querySelector('[data-testid="auto-panel-state"]')?.textContent).toBe('open');
    expect(container.querySelector('[data-testid="auto-panel-width-mode"]')?.textContent).toBe(
      'compact'
    );
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
    await render([
      makeToolRecord('new-file', ChatStatusEnum.finish),
      makeToolRecord('another-file', ChatStatusEnum.running, { response: 'ok' })
    ]);
    expect(container.querySelector('[data-testid="auto-panel-state"]')?.textContent).toBe('closed');
  });

  it('does not open a file panel just because historical file tools were loaded', async () => {
    const historical = makeToolRecord('historical-file', ChatStatusEnum.finish);
    const value = {
      isLoadingRecords: false,
      chatRecords: [historical],
      setChatRecords: vi.fn(),
      isChatRecordsLoaded: true,
      totalRecordsCount: 1,
      ScrollData: ({ children }: { children: React.ReactNode }) =>
        React.createElement('div', null, children),
      itemRefs: { current: new Map() }
    };
    await act(async () =>
      root.render(
        React.createElement(
          ChatRecordContext.Provider,
          { value },
          React.createElement(
            SandboxFilePanelProvider,
            { scopeKey: 'app-a:chat-a' },
            React.createElement(AutoOpenFiles)
          )
        )
      )
    );
    expect(container.querySelector('[data-testid="auto-panel-state"]')?.textContent).toBe('closed');
  });

  it('waits for a successful sandbox run after an initial sandbox failure', async () => {
    const render = async (chatRecords: ChatSiteItemType[]) =>
      act(async () =>
        root.render(
          React.createElement(
            ChatRecordContext.Provider,
            {
              value: {
                isLoadingRecords: false,
                chatRecords,
                setChatRecords: vi.fn(),
                isChatRecordsLoaded: true,
                totalRecordsCount: chatRecords.length,
                ScrollData: ({ children }) => React.createElement('div', null, children),
                itemRefs: { current: new Map() }
              }
            },
            React.createElement(
              SandboxFilePanelProvider,
              { scopeKey: 'app-a:chat-a' },
              React.createElement(AutoOpenFiles)
            )
          )
        )
      );

    await render([]);
    await render([
      makeToolRecord('failed-file', ChatStatusEnum.running, {
        response: 'sandbox_unavailable',
        sandboxPhase: 'failed'
      })
    ]);
    expect(container.querySelector('[data-testid="auto-panel-state"]')?.textContent).toBe('closed');
    await render([
      makeToolRecord('failed-file', ChatStatusEnum.finish, {
        response: 'sandbox_unavailable',
        sandboxPhase: 'failed'
      }),
      makeToolRecord('recovered-file', ChatStatusEnum.running, { response: 'ok' })
    ]);
    expect(container.querySelector('[data-testid="auto-panel-state"]')?.textContent).toBe('open');
  });

  it('refreshes an open file panel when a later file tool is used', async () => {
    const render = async (chatRecords: ChatSiteItemType[]) =>
      act(async () =>
        root.render(
          React.createElement(
            ChatRecordContext.Provider,
            {
              value: {
                isLoadingRecords: false,
                chatRecords,
                setChatRecords: vi.fn(),
                isChatRecordsLoaded: true,
                totalRecordsCount: chatRecords.length,
                ScrollData: ({ children }) => React.createElement('div', null, children),
                itemRefs: { current: new Map() }
              }
            },
            React.createElement(
              SandboxFilePanelProvider,
              { scopeKey: 'app-a:chat-a' },
              React.createElement(AutoOpenFiles)
            )
          )
        )
      );

    await render([]);
    await render([makeToolRecord('first-file', ChatStatusEnum.running, { response: 'ok' })]);
    expect(container.querySelector('[data-testid="auto-refresh-version"]')?.textContent).toBe('1');
    await render([
      makeToolRecord('first-file', ChatStatusEnum.finish, { response: 'ok' }),
      makeToolRecord('second-file', ChatStatusEnum.running)
    ]);
    expect(container.querySelector('[data-testid="auto-panel-state"]')?.textContent).toBe('open');
    expect(container.querySelector('[data-testid="auto-refresh-version"]')?.textContent).toBe('2');
  });

  it('refreshes the open file panel after an Agent turn finishes', async () => {
    const render = async (chatRecords: ChatSiteItemType[]) =>
      act(async () =>
        root.render(
          React.createElement(
            ChatRecordContext.Provider,
            {
              value: {
                isLoadingRecords: false,
                chatRecords,
                setChatRecords: vi.fn(),
                isChatRecordsLoaded: true,
                totalRecordsCount: chatRecords.length,
                ScrollData: ({ children }) => React.createElement('div', null, children),
                itemRefs: { current: new Map() }
              }
            },
            React.createElement(
              SandboxFilePanelProvider,
              { scopeKey: 'app-a:chat-a' },
              React.createElement(AutoOpenFiles)
            )
          )
        )
      );

    await render([]);
    await render([makeToolRecord('first-file', ChatStatusEnum.running, { response: 'ok' })]);
    expect(container.querySelector('[data-testid="auto-refresh-version"]')?.textContent).toBe('1');
    await render([makeToolRecord('first-file', ChatStatusEnum.finish, { response: 'ok' })]);
    expect(container.querySelector('[data-testid="auto-refresh-version"]')?.textContent).toBe('2');
  });

  it('refreshes on file and shell tool completion before the Agent turn ends', async () => {
    const render = async (chatRecords: ChatSiteItemType[]) =>
      act(async () =>
        root.render(
          React.createElement(
            ChatRecordContext.Provider,
            {
              value: {
                isLoadingRecords: false,
                chatRecords,
                setChatRecords: vi.fn(),
                isChatRecordsLoaded: true,
                totalRecordsCount: chatRecords.length,
                ScrollData: ({ children }) => React.createElement('div', null, children),
                itemRefs: { current: new Map() }
              }
            },
            React.createElement(
              SandboxFilePanelProvider,
              { scopeKey: 'app-a:chat-a' },
              React.createElement(AutoOpenFiles)
            )
          )
        )
      );
    await render([]);
    await render([makeToolRecord('file', ChatStatusEnum.running)]);
    expect(container.querySelector('[data-testid="auto-panel-state"]')?.textContent).toBe('closed');
    await render([makeToolRecord('file', ChatStatusEnum.running, { response: 'ok' })]);
    expect(container.querySelector('[data-testid="auto-refresh-version"]')?.textContent).toBe('1');
    expect(container.querySelector('[data-testid="auto-allow-start-version"]')?.textContent).toBe(
      '1'
    );
    await render([
      makeToolRecord('file', ChatStatusEnum.running, { response: 'ok' }),
      makeToolRecord('shell', ChatStatusEnum.running, { functionName: SandboxToolIds.execute })
    ]);
    expect(container.querySelector('[data-testid="auto-refresh-version"]')?.textContent).toBe('1');
    await render([
      makeToolRecord('file', ChatStatusEnum.running, { response: 'ok' }),
      makeToolRecord('shell', ChatStatusEnum.running, {
        functionName: SandboxToolIds.execute,
        response: 'ok'
      })
    ]);
    expect(container.querySelector('[data-testid="auto-refresh-version"]')?.textContent).toBe('2');
  });

  it('does not open when an older history page introduces the first file tool', async () => {
    const render = async (chatRecords: ChatSiteItemType[]) =>
      act(async () =>
        root.render(
          React.createElement(
            ChatRecordContext.Provider,
            {
              value: {
                isLoadingRecords: false,
                chatRecords,
                setChatRecords: vi.fn(),
                isChatRecordsLoaded: true,
                totalRecordsCount: chatRecords.length,
                ScrollData: ({ children }: { children: React.ReactNode }) =>
                  React.createElement('div', null, children),
                itemRefs: { current: new Map() }
              }
            },
            React.createElement(
              SandboxFilePanelProvider,
              { scopeKey: 'app-a:chat-a' },
              React.createElement(AutoOpenFiles)
            )
          )
        )
      );

    await render([]);
    await render([makeToolRecord('older-file', ChatStatusEnum.finish)]);
    expect(container.querySelector('[data-testid="auto-panel-state"]')?.textContent).toBe('closed');
    await render([
      makeToolRecord('older-file', ChatStatusEnum.finish),
      makeToolRecord('new-file', ChatStatusEnum.running)
    ]);
    expect(container.querySelector('[data-testid="auto-panel-state"]')?.textContent).toBe('closed');
  });
});
