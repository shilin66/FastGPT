import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  width: 1008,
  panel: {
    isOpen: true,
    isExpanded: false,
    isAutoOpened: false,
    scope: undefined,
    refreshVersion: 0,
    open: vi.fn(),
    close: vi.fn(),
    refresh: vi.fn(),
    restore: vi.fn(),
    markManuallyResized: vi.fn()
  },
  listFiles: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn()
}));

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('ahooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ahooks')>()),
  useSize: () => ({ width: mocks.width, height: 800 })
}));
vi.mock('@/pageComponents/chat/SandboxEditor/PanelContext', () => ({
  useSandboxFilePanel: () => mocks.panel
}));
vi.mock('@/pageComponents/chat/SandboxEditor/Panel', () => ({
  default: () =>
    React.createElement('textarea', { 'aria-label': 'files', defaultValue: 'Files draft' })
}));
vi.mock('@/pageComponents/chat/SandboxEditor/api', () => ({
  listSandboxFiles: mocks.listFiles,
  getSandboxFile: mocks.readFile,
  writeSandboxFile: mocks.writeFile,
  downloadSandbox: vi.fn()
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (fn: (...args: unknown[]) => unknown) => ({
    runAsync: (...args: unknown[]) => Promise.resolve(fn(...args)),
    run: (...args: unknown[]) => fn(...args),
    loading: false
  })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/SandboxEditor/components/EditorContent', () => ({
  default: ({
    activeFile,
    setOpenedFiles,
    saveFile,
    fileStatus
  }: {
    activeFile?: { name: string; content: string; path: string; remoteChanged?: boolean };
    setOpenedFiles: (
      update: (files: { path: string; content: string; isDirty: boolean }[]) => unknown
    ) => void;
    saveFile: () => void;
    fileStatus?: string;
  }) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement(
        'div',
        { 'data-testid': 'preview' },
        `${activeFile?.name}:${activeFile?.content}`
      ),
      React.createElement(
        'output',
        { 'data-testid': 'file-status' },
        fileStatus || (activeFile?.remoteChanged ? 'changed' : '')
      ),
      React.createElement(
        'button',
        {
          'data-testid': 'edit-draft',
          onClick: () =>
            setOpenedFiles((files) =>
              files.map((file) =>
                file.path === activeFile?.path ? { ...file, content: 'draft', isDirty: true } : file
              )
            )
        },
        'Edit draft'
      ),
      React.createElement(
        'button',
        { 'data-testid': 'save-draft', onClick: () => saveFile() },
        'Save draft'
      )
    )
}));

import AgentWorkspace from '@/pageComponents/app/detail/Edit/ChatAgent/AgentWorkspace';
import SandboxEditor from '@/pageComponents/chat/SandboxEditor/Editor';
import FileTree from '@/pageComponents/chat/SandboxEditor/components/FileTree';

describe('Agent sandbox file workspace', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.clear();
    mocks.width = 1008;
    mocks.panel.isOpen = true;
    mocks.panel.isExpanded = false;
    mocks.panel.isAutoOpened = false;
    mocks.listFiles.mockReset();
    mocks.readFile.mockReset();
    mocks.writeFile.mockReset();
    mocks.listFiles.mockResolvedValue({
      sandboxId: 'sandbox-a',
      workspaceGeneration: 'legacy',
      files: [{ name: 'report.txt', path: 'report.txt', type: 'file' }]
    });
    mocks.readFile.mockResolvedValue({
      arrayBuffer: async () => new TextEncoder().encode('hello').buffer,
      headers: new Headers({ 'X-Sandbox-Content-Hash': 'hello-hash' })
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('keeps three panes usable at a 1280px desktop and preserves drafts when side panes collapse', async () => {
    const render = async (showConfig: boolean) =>
      act(async () =>
        root.render(
          React.createElement(
            ChakraProvider,
            null,
            React.createElement(AgentWorkspace, {
              config: React.createElement('textarea', {
                'aria-label': 'configuration',
                defaultValue: 'Config draft'
              }),
              chat: React.createElement('textarea', {
                'aria-label': 'conversation',
                defaultValue: 'Chat draft'
              }),
              showConfig
            })
          )
        )
      );
    await render(true);
    const config = container.querySelector<HTMLTextAreaElement>('[aria-label="configuration"]')!;
    const chat = container.querySelector<HTMLTextAreaElement>('[aria-label="conversation"]')!;
    expect(parseFloat(getComputedStyle(config.parentElement!).width)).toBeGreaterThanOrEqual(300);
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(2);

    await render(false);
    expect(container.querySelector('[aria-label="configuration"]')).toBe(config);
    expect(container.querySelector('[aria-label="conversation"]')).toBe(chat);
    expect(config.value).toBe('Config draft');
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(1);

    mocks.panel.isOpen = false;
    await render(true);
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(1);
    expect(container.querySelector('[aria-label="configuration"]')).toBe(config);
  });

  it('switches a narrow file pane between directory and preview without losing selection', async () => {
    mocks.width = 360;
    const onRequestExpand = vi.fn();
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(SandboxEditor, {
            appId: 'app-a',
            chatId: 'chat-a',
            panelMode: true,
            onRequestExpand
          })
        )
      )
    );
    const entry = container.querySelector<HTMLButtonElement>('button[title="report.txt"]')!;
    expect(entry).not.toBeNull();
    await act(async () => entry.click());
    expect(onRequestExpand).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="preview"]')?.textContent).toBe(
      'report.txt:hello'
    );
    expect(
      getComputedStyle(container.querySelector('[data-testid="sandbox-file-tree"]')!).display
    ).toBe('none');

    const back = container.querySelector<HTMLButtonElement>(
      'button[aria-label="chat:sandbox_back_to_files"]'
    )!;
    await act(async () => back.click());
    expect(
      getComputedStyle(container.querySelector('[data-testid="sandbox-file-tree"]')!).display
    ).not.toBe('none');
    expect(
      container.querySelector('button[title="report.txt"]')?.getAttribute('aria-current')
    ).toBe('true');
  });

  it('shows file loading immediately while the read request is pending', async () => {
    mocks.width = 360;
    let resolveRead!: (value: unknown) => void;
    mocks.readFile.mockImplementationOnce(() => new Promise((resolve) => (resolveRead = resolve)));
    const onRequestExpand = vi.fn();
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(SandboxEditor, {
            appId: 'app-a',
            chatId: 'chat-a',
            panelMode: true,
            onRequestExpand
          })
        )
      )
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[title="report.txt"]')!.click()
    );
    expect(onRequestExpand).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="sandbox-file-opening"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sandbox-file-opening"]')?.textContent).toContain(
      'report.txt'
    );
    expect(
      getComputedStyle(container.querySelector('[data-testid="sandbox-file-preview"]')!).display
    ).not.toBe('none');

    await act(async () =>
      resolveRead({
        arrayBuffer: async () => new TextEncoder().encode('hello').buffer,
        headers: new Headers({ 'X-Sandbox-Content-Hash': 'hello-hash' })
      })
    );
    expect(container.querySelector('[data-testid="sandbox-file-opening"]')).toBeNull();
    expect(container.querySelector('[data-testid="preview"]')?.textContent).toBe(
      'report.txt:hello'
    );
  });

  it('resizes the configuration and file boundaries independently with the keyboard', async () => {
    mocks.width = 1600;
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(AgentWorkspace, {
            config: React.createElement('textarea', { 'aria-label': 'configuration' }),
            chat: React.createElement('textarea', { 'aria-label': 'conversation' }),
            showConfig: true
          })
        )
      )
    );
    const dividers = container.querySelectorAll<HTMLElement>('[role="separator"]');
    const config = container.querySelector<HTMLTextAreaElement>('[aria-label="configuration"]')!;
    const files = container.querySelector<HTMLTextAreaElement>('[aria-label="files"]')!;
    const configWidth = parseFloat(getComputedStyle(config.parentElement!).width);
    const fileWidth = parseFloat(getComputedStyle(files.parentElement!).width);
    await act(async () =>
      dividers[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    );
    await act(async () =>
      dividers[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    );
    expect(parseFloat(getComputedStyle(config.parentElement!).width)).toBe(configWidth + 24);
    expect(parseFloat(getComputedStyle(files.parentElement!).width)).toBe(fileWidth + 24);
    expect(localStorage.getItem('agent_config_pane_width')).toBe(String(configWidth + 24));
    expect(localStorage.getItem('agent_file_pane_width_v2')).toBe(String(fileWidth + 24));

    await act(async () =>
      dividers[0].dispatchEvent(new MouseEvent('mousedown', { clientX: 600, bubbles: true }))
    );
    await act(async () =>
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 630, bubbles: true }))
    );
    await act(async () =>
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 630, bubbles: true }))
    );
    expect(parseFloat(getComputedStyle(config.parentElement!).width)).toBe(configWidth + 54);
  });

  it('shrinks the configuration pane as the file pane grows at desktop widths', async () => {
    mocks.width = 1328;
    localStorage.setItem('agent_file_pane_width_v2', '460');
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(AgentWorkspace, {
            config: React.createElement('textarea', { 'aria-label': 'configuration' }),
            chat: React.createElement('textarea', { 'aria-label': 'conversation' }),
            showConfig: true
          })
        )
      )
    );
    const config = container.querySelector<HTMLTextAreaElement>('[aria-label="configuration"]')!;
    const files = container.querySelector<HTMLTextAreaElement>('[aria-label="files"]')!;
    expect(parseFloat(getComputedStyle(files.parentElement!).width)).toBe(460);
    expect(parseFloat(getComputedStyle(config.parentElement!).width)).toBe(472);
    const fileDivider = container.querySelectorAll<HTMLElement>('[role="separator"]')[1];
    await act(async () =>
      fileDivider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    );
    expect(parseFloat(getComputedStyle(files.parentElement!).width)).toBe(484);
    expect(parseFloat(getComputedStyle(config.parentElement!).width)).toBe(448);
  });

  it('opens automatically at list width even when a wider manual width was saved', async () => {
    mocks.width = 1328;
    mocks.panel.isAutoOpened = true;
    localStorage.setItem('agent_file_pane_width_v2', '600');
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(AgentWorkspace, {
            config: React.createElement('textarea', { 'aria-label': 'configuration' }),
            chat: React.createElement('textarea', { 'aria-label': 'conversation' }),
            showConfig: true
          })
        )
      )
    );
    const files = container.querySelector<HTMLTextAreaElement>('[aria-label="files"]')!;
    expect(parseFloat(getComputedStyle(files.parentElement!).width)).toBe(248);

    mocks.panel.isExpanded = true;
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(AgentWorkspace, {
            config: React.createElement('textarea', { 'aria-label': 'configuration' }),
            chat: React.createElement('textarea', { 'aria-label': 'conversation' }),
            showConfig: true
          })
        )
      )
    );
    expect(parseFloat(getComputedStyle(files.parentElement!).width)).toBeGreaterThan(248);
  });

  it('keeps deep directory names readable through horizontal scrolling', async () => {
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(FileTree, {
            filteredTree: [
              {
                name: 'a-very-long-directory-name-under-several-levels',
                path: '.runtime/commands/session/a-very-long-directory-name-under-several-levels',
                type: 'directory',
                level: 6
              }
            ],
            searchQuery: '',
            setSearchQuery: vi.fn(),
            expandedDirs: new Set(),
            loadingDirs: new Set(),
            activeFilePath: '',
            openFile: vi.fn(),
            toggleDirectory: vi.fn(),
            downloadingWorkspace: false,
            downloadWorkspace: vi.fn(),
            fullWidth: true
          })
        )
      )
    );
    const entry = container.querySelector<HTMLButtonElement>('button[title*="a-very-long"]')!;
    expect(getComputedStyle(entry.querySelector('p')!).whiteSpace).toBe('nowrap');
    expect(
      getComputedStyle(container.querySelector('[data-testid="sandbox-file-tree-scroll"]')!)
        .overflow
    ).toBe('auto');
  });

  it('uses the full pane for browsing and lets the directory column grow beside a preview', async () => {
    mocks.width = 760;
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(SandboxEditor, {
            appId: 'app-a',
            chatId: 'chat-a',
            panelMode: true
          })
        )
      )
    );
    const tree = container.querySelector<HTMLElement>('[data-testid="sandbox-file-tree"]')!;
    const preview = container.querySelector<HTMLElement>('[data-testid="sandbox-file-preview"]')!;
    expect(getComputedStyle(tree).width).toBe('var(--chakra-sizes-full)');
    expect(getComputedStyle(preview).display).toBe('none');

    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[title="report.txt"]')!.click()
    );
    expect(getComputedStyle(tree).width).toBe('224px');
    expect(getComputedStyle(preview).display).toBe('flex');
    const divider = container.querySelector<HTMLElement>('[aria-label="调整目录宽度"]')!;
    await act(async () =>
      divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    );
    expect(getComputedStyle(tree).width).toBe('248px');
    expect(localStorage.getItem('sandbox_file_tree_width')).toBe('248');
  });

  it('grows the file pane within the three-column layout when a file is opened', async () => {
    mocks.width = 1328;
    const render = async () =>
      act(async () =>
        root.render(
          React.createElement(
            ChakraProvider,
            null,
            React.createElement(AgentWorkspace, {
              config: React.createElement('textarea', { 'aria-label': 'configuration' }),
              chat: React.createElement('textarea', { 'aria-label': 'conversation' }),
              showConfig: true
            })
          )
        )
      );
    await render();
    const config = container.querySelector<HTMLTextAreaElement>('[aria-label="configuration"]')!;
    const files = container.querySelector<HTMLTextAreaElement>('[aria-label="files"]')!;
    expect(parseFloat(getComputedStyle(files.parentElement!).width)).toBe(280);

    mocks.panel.isExpanded = true;
    await render();
    expect(parseFloat(getComputedStyle(files.parentElement!).width)).toBe(632);
    expect(parseFloat(getComputedStyle(config.parentElement!).width)).toBe(300);
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(2);
  });

  it.each([
    ['1280', 1008],
    ['1366', 1094],
    ['1440', 1168],
    ['1600', 1328],
    ['1920', 1648]
  ])('keeps the center conversation at least 380px at %s desktop width', async (_label, width) => {
    mocks.width = width;
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(AgentWorkspace, {
            config: React.createElement('textarea', { 'aria-label': 'configuration' }),
            chat: React.createElement('textarea', { 'aria-label': 'conversation' }),
            showConfig: true
          })
        )
      )
    );
    const config = container.querySelector<HTMLTextAreaElement>('[aria-label="configuration"]')!;
    const files = container.querySelector<HTMLTextAreaElement>('[aria-label="files"]')!;
    const sideWidths =
      parseFloat(getComputedStyle(config.parentElement!).width) +
      parseFloat(getComputedStyle(files.parentElement!).width);
    expect(sideWidths + 380 + 16).toBeLessThanOrEqual(width);
  });

  it('refreshes a selected file and reports only paths added after the first load', async () => {
    mocks.width = 360;
    const onNewFiles = vi.fn();
    const render = async (refreshVersion: number) =>
      act(async () =>
        root.render(
          React.createElement(
            ChakraProvider,
            null,
            React.createElement(SandboxEditor, {
              appId: 'app-a',
              chatId: 'chat-a',
              panelMode: true,
              refreshVersion,
              onNewFiles
            })
          )
        )
      );
    await render(0);
    expect(onNewFiles).not.toHaveBeenCalled();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[title="report.txt"]')!.click()
    );
    expect(container.querySelector('[data-testid="preview"]')?.textContent).toBe(
      'report.txt:hello'
    );
    mocks.readFile.mockResolvedValue({
      arrayBuffer: async () => new TextEncoder().encode('updated').buffer,
      headers: new Headers({ 'X-Sandbox-Content-Hash': 'updated-hash' })
    });
    mocks.listFiles.mockResolvedValue({
      sandboxId: 'sandbox-a',
      files: [
        { name: 'report.txt', path: 'report.txt', type: 'file' },
        { name: 'new.txt', path: 'new.txt', type: 'file' }
      ]
    });
    await render(1);
    expect(container.querySelector('[data-testid="preview"]')?.textContent).toBe(
      'report.txt:updated'
    );
    expect(onNewFiles).toHaveBeenCalledWith(1);
  });

  it('keeps the local draft when the sandbox rejects a stale file version', async () => {
    mocks.width = 360;
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(SandboxEditor, {
            appId: 'app-a',
            chatId: 'chat-a',
            panelMode: true
          })
        )
      )
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[title="report.txt"]')!.click()
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="edit-draft"]')!.click()
    );
    mocks.writeFile.mockRejectedValueOnce({ message: 'sandbox_file_changed' });
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="save-draft"]')!.click()
    );
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'draft',
        expectedHash: 'hello-hash',
        expectedWorkspaceGeneration: 'legacy'
      })
    );
    expect(container.querySelector('[data-testid="preview"]')?.textContent).toBe(
      'report.txt:draft'
    );
    expect(container.querySelector('[data-testid="file-status"]')?.textContent).toBe(
      'chat:sandbox_file_changed'
    );
  });

  it('does not replace a dirty draft when a refresh sees a new remote version', async () => {
    mocks.width = 360;
    const render = async (refreshVersion: number) =>
      act(async () =>
        root.render(
          React.createElement(
            ChakraProvider,
            null,
            React.createElement(SandboxEditor, {
              appId: 'app-a',
              chatId: 'chat-a',
              panelMode: true,
              refreshVersion
            })
          )
        )
      );
    await render(0);
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[title="report.txt"]')!.click()
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="edit-draft"]')!.click()
    );
    mocks.readFile.mockResolvedValue({
      arrayBuffer: async () => new TextEncoder().encode('remote change').buffer,
      headers: new Headers({ 'X-Sandbox-Content-Hash': 'remote-hash' })
    });
    await render(1);
    expect(container.querySelector('[data-testid="preview"]')?.textContent).toBe(
      'report.txt:draft'
    );
    expect(container.querySelector('[data-testid="file-status"]')?.textContent).toBe('changed');
  });

  it('loads the root and a folder after transient sandbox lease conflicts', async () => {
    vi.useFakeTimers();
    try {
      mocks.listFiles
        .mockRejectedValueOnce({
          message: 'operation_conflict: Sandbox is busy before execution'
        })
        .mockResolvedValueOnce({
          sandboxId: 'sandbox-a',
          files: [{ name: '.runtime', path: '.runtime', type: 'directory' }]
        })
        .mockRejectedValueOnce({
          message: 'operation_conflict: Sandbox is busy before execution'
        })
        .mockResolvedValueOnce({
          sandboxId: 'sandbox-a',
          files: [{ name: 'config.json', path: '.runtime/config.json', type: 'file' }]
        });

      await act(async () => {
        root.render(
          React.createElement(
            ChakraProvider,
            null,
            React.createElement(SandboxEditor, {
              appId: 'app-a',
              chatId: 'chat-a',
              panelMode: true
            })
          )
        );
      });
      await act(async () => vi.runAllTimersAsync());
      const folder = container.querySelector<HTMLButtonElement>('button[title=".runtime"]');
      expect(folder).not.toBeNull();

      await act(async () => {
        folder?.click();
      });
      await act(async () => vi.runAllTimersAsync());
      expect(container.querySelector('button[title=".runtime/config.json"]')).not.toBeNull();
      expect(mocks.listFiles).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });
});
