import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readFile: vi.fn(), listFiles: vi.fn() }));

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('ahooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ahooks')>()),
  useSize: () => ({ width: 1000, height: 800 })
}));
vi.mock('@/pageComponents/chat/SandboxEditor/api', () => ({
  listSandboxFiles: mocks.listFiles,
  getSandboxFile: mocks.readFile,
  writeSandboxFile: vi.fn(),
  downloadSandbox: vi.fn()
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/SandboxEditor/components/EditorContent', () => ({
  default: ({ activeFile }: { activeFile?: { content: string } }) =>
    React.createElement('output', { 'data-testid': 'file-content' }, activeFile?.content)
}));

import SandboxEditor from '@/pageComponents/chat/SandboxEditor/Editor';

const fileResponse = (content: string) => ({
  headers: new Headers({ 'X-Sandbox-Workspace-Generation': 'generation-a' }),
  arrayBuffer: async () => new TextEncoder().encode(content).buffer
});

describe('sandbox concurrent file reads', () => {
  let root: Root;
  let container: HTMLDivElement;
  const render = (refreshVersion = 0) =>
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
    );
  const clickFile = (path: string) =>
    container.querySelector<HTMLButtonElement>(`button[title="${path}"]`)!.click();

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.readFile.mockReset();
    mocks.readFile.mockImplementation(async ({ path }: { path: string }) => fileResponse(path));
    mocks.listFiles.mockReset();
    mocks.listFiles.mockImplementation(async ({ path }: { path: string }) => ({
      sandboxId: 'sandbox-a',
      workspaceGeneration: 'generation-a',
      files:
        path === '.'
          ? [
              ...['first.txt', 'second.txt'].map((name) => ({ name, path: name, type: 'file' })),
              { name: 'folder', path: 'folder', type: 'directory' }
            ]
          : [{ name: 'nested.txt', path: 'folder/nested.txt', type: 'file' }]
    }));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('finishes directory refresh when another file is opened during its content refresh', async () => {
    await act(async () => render());
    await act(async () => clickFile('first.txt'));
    let finishRefresh!: (response: ReturnType<typeof fileResponse>) => void;
    mocks.readFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        })
    );
    await act(async () => render(1));
    expect(container.textContent).toContain('chat:sandbox_refreshing');
    await act(async () => clickFile('second.txt'));
    expect(container.querySelector('[data-testid="file-content"]')?.textContent).toBe('second.txt');
    expect(container.textContent).not.toContain('Loading...');
    await act(async () => finishRefresh(fileResponse('updated first')));

    expect(container.querySelector('[data-testid="file-content"]')?.textContent).toBe('second.txt');
    expect(container.textContent).not.toContain('chat:sandbox_refreshing');
    expect(container.querySelector('[data-testid="sandbox-file-opening"]')).toBeNull();
    expect(container.textContent).not.toContain('Loading...');
  });

  it('shows the last selected file and finishes loading after two overlapping opens', async () => {
    await act(async () => render());
    let finishFirst!: (response: ReturnType<typeof fileResponse>) => void;
    mocks.readFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        })
    );
    await act(async () => clickFile('first.txt'));
    await act(async () => clickFile('second.txt'));
    expect(container.querySelector('[data-testid="file-content"]')?.textContent).toBe('second.txt');
    expect(container.textContent).not.toContain('Loading...');
    await act(async () => finishFirst(fileResponse('first.txt')));

    expect(container.querySelector('[data-testid="file-content"]')?.textContent).toBe('second.txt');
    expect(container.querySelector('[data-testid="sandbox-file-opening"]')).toBeNull();
    expect(container.textContent).not.toContain('Loading...');
  });

  it('refreshes the active file before expanded directories finish loading', async () => {
    await act(async () => render());
    await act(async () => clickFile('first.txt'));
    await act(async () => clickFile('folder'));
    const list = mocks.listFiles.getMockImplementation()!;
    let finishFolder!: (response: unknown) => void;
    mocks.listFiles.mockImplementation(({ path }: { path: string }) =>
      path === '.' ? list({ path }) : new Promise((resolve) => (finishFolder = resolve))
    );
    mocks.readFile.mockResolvedValue(fileResponse('updated first'));
    await act(async () => render(1));
    expect(container.querySelector('[data-testid="file-content"]')?.textContent).toBe(
      'updated first'
    );
    expect(container.textContent).toContain('chat:sandbox_refreshing');
    await act(async () => finishFolder({ files: [] }));
    expect(container.textContent).not.toContain('chat:sandbox_refreshing');
  });

  it('does not replace newer file content with a late response from an older refresh', async () => {
    await act(async () => render());
    await act(async () => clickFile('first.txt'));
    let finishOld!: (response: ReturnType<typeof fileResponse>) => void;
    mocks.readFile.mockImplementationOnce(() => new Promise((resolve) => (finishOld = resolve)));
    await act(async () => render(1));
    mocks.readFile.mockResolvedValueOnce(fileResponse('newest content'));
    await act(async () => render(2));
    expect(container.querySelector('[data-testid="file-content"]')?.textContent).toBe(
      'newest content'
    );
    expect(container.textContent).not.toContain('Loading...');
    await act(async () => finishOld(fileResponse('outdated content')));
    expect(container.querySelector('[data-testid="file-content"]')?.textContent).toBe(
      'newest content'
    );
  });
});
