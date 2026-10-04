import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listFiles: vi.fn(),
  tree: [] as import('@/pageComponents/chat/SandboxEditor/components/FileTree').TreeNode[]
}));

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('ahooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ahooks')>()),
  useSize: () => ({ width: 360, height: 800 })
}));
vi.mock('@/pageComponents/chat/SandboxEditor/api', () => ({
  listSandboxFiles: mocks.listFiles,
  getSandboxFile: vi.fn(),
  writeSandboxFile: vi.fn(),
  downloadSandbox: vi.fn()
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/SandboxEditor/components/EditorContent', () => ({
  default: () => null
}));
vi.mock('@/pageComponents/chat/SandboxEditor/components/FileTree', async (importOriginal) => {
  const { default: FileTree } =
    await importOriginal<
      typeof import('@/pageComponents/chat/SandboxEditor/components/FileTree')
    >();
  return {
    default: (props: React.ComponentProps<typeof FileTree>) => {
      mocks.tree = props.filteredTree;
      return React.createElement(FileTree, props);
    }
  };
});

import SandboxEditor from '@/pageComponents/chat/SandboxEditor/Editor';

describe('sandbox directory loading', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.listFiles.mockReset();
    mocks.tree = [];
    mocks.listFiles.mockImplementation(async ({ path }: { path: string }) => ({
      sandboxId: 'sandbox-a',
      workspaceGeneration: 'generation-a',
      files:
        path === '.'
          ? [
              { name: 'first', path: '/workspace/first', type: 'directory' },
              { name: 'second', path: '/workspace/second', type: 'directory' }
            ]
          : [{ name: 'child.txt', path: `${path}/child.txt`, type: 'file' }]
    }));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows exhausted busy requests in the panel without reporting a runtime error', async () => {
    const reportError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.listFiles.mockRejectedValue(new Error('chat:sandbox_busy'));
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(SandboxEditor, { appId: 'app-a', chatId: 'chat-a', panelMode: true })
        )
      )
    );
    expect(container.textContent).toContain('chat:sandbox_busy');
    expect(container.textContent).toContain('chat:sandbox_refresh');
    expect(reportError).not.toHaveBeenCalled();
  });

  it('finishes both folder loads when two folders are opened before either request returns', async () => {
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(SandboxEditor, { appId: 'app-a', chatId: 'chat-a', panelMode: true })
        )
      )
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[title="/workspace/first"]')!.click();
      container.querySelector<HTMLButtonElement>('button[title="/workspace/second"]')!.click();
    });

    expect(container.querySelector('button[title="/workspace/first/child.txt"]')).not.toBeNull();
    expect(container.querySelector('button[title="/workspace/second/child.txt"]')).not.toBeNull();
    expect(container.querySelector('button[title="/workspace/first"]')?.textContent).not.toContain(
      'Loading...'
    );
    expect(container.querySelector('button[title="/workspace/second"]')?.textContent).not.toContain(
      'Loading...'
    );
  });

  it('stops the folder spinner and keeps the tree usable when a folder is busy', async () => {
    const reportError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(SandboxEditor, { appId: 'app-a', chatId: 'chat-a', panelMode: true })
        )
      )
    );
    mocks.listFiles.mockRejectedValueOnce(new Error('chat:sandbox_busy'));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[title="/workspace/first"]')!.click();
    });
    expect(container.textContent).toContain('chat:sandbox_busy');
    expect(container.querySelector('button[title="/workspace/first"]')?.textContent).not.toContain(
      'Loading...'
    );
    expect(reportError).not.toHaveBeenCalled();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[title="/workspace/first"]')!.click();
    });
    expect(container.querySelector('button[title="/workspace/first/child.txt"]')).not.toBeNull();
    expect(container.textContent).not.toContain('chat:sandbox_busy');
  });

  it('opens a second directory while the first directory request is still pending', async () => {
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(SandboxEditor, { appId: 'app-a', chatId: 'chat-a', panelMode: true })
        )
      )
    );
    let finishFirst!: (response: { files: unknown[] }) => void;
    mocks.listFiles.mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[title="/workspace/first"]')!.click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[title="/workspace/second"]')!.click();
    });
    expect(container.querySelector('button[title="/workspace/second/child.txt"]')).not.toBeNull();
    expect(container.querySelector('button[title="/workspace/first"]')?.textContent).toContain(
      'Loading...'
    );
    await act(async () => finishFirst({ files: [] }));
    expect(container.textContent).not.toContain('Loading...');
  });

  it('stops adding folder requests when a newer refresh replaces the current refresh', async () => {
    const render = (refreshVersion: number) =>
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
    await act(async () => render(0));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[title="/workspace/first"]')!.click();
    });
    mocks.listFiles.mockClear();
    let finishRoot!: (response: { files: unknown[] }) => void;
    mocks.listFiles.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRoot = resolve;
        })
    );
    await act(async () => render(1));
    await act(async () => render(2));
    await act(async () => finishRoot({ files: [] }));

    expect(mocks.listFiles.mock.calls.map(([request]) => request.path)).toEqual([
      '.',
      '.',
      '/workspace/first'
    ]);
    expect(container.textContent).not.toContain('chat:sandbox_refreshing');
    expect(container.querySelector('button[title="/workspace/first/child.txt"]')).not.toBeNull();
  });

  it('keeps nested rows indented by tree depth after refreshing absolute workspace paths', async () => {
    const workspace = '/workspace/sessions/chat-a';
    const project = `${workspace}/multi_agent_framework`;
    const examples = `${project}/examples`;
    mocks.listFiles.mockImplementation(async ({ path }: { path: string }) => ({
      sandboxId: 'sandbox-a',
      files:
        path === '.'
          ? [{ name: 'multi_agent_framework', path: project, type: 'directory' }]
          : path === project
            ? [
                { name: 'README.md', path: `${project}/README.md`, type: 'file' },
                { name: 'examples', path: examples, type: 'directory' }
              ]
            : [{ name: 'demo.py', path: `${examples}/demo.py`, type: 'file' }]
    }));
    const render = (refreshVersion: number) =>
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
    const getRow = (path: string) =>
      container.querySelector<HTMLButtonElement>(`button[title="${path}"]`)!;
    const expectTreeIndentation = () => {
      const projectNode = mocks.tree[0];
      const readmeNode = projectNode.children!.find((node) => node.name === 'README.md')!;
      const examplesNode = projectNode.children!.find((node) => node.name === 'examples')!;
      expect(projectNode.level).toBe(0);
      expect(readmeNode.level).toBe(1);
      expect(examplesNode.level).toBe(1);
      expect(examplesNode.children![0].level).toBe(2);
      expect(getRow(`${examples}/demo.py`)).not.toBeNull();
    };

    await act(async () => render(0));
    await act(async () => getRow(project).click());
    await act(async () => getRow(examples).click());
    expectTreeIndentation();

    await act(async () => render(1));
    expectTreeIndentation();
    await act(async () => render(2));
    expectTreeIndentation();
  });
});
