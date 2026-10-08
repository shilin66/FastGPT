import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SandboxFilePanelProvider,
  useSandboxFilePanel
} from '@/pageComponents/chat/SandboxEditor/PanelContext';

const mocks = vi.hoisted(() => ({
  enabled: true,
  shared: false,
  anonymous: false,
  emptyAuth: false,
  open: vi.fn(),
  mounts: 0
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: (selector: (state: unknown) => unknown) =>
    selector({ feConfigs: { show_agent_sandbox: true, show_agent_sandbox_editor: mocks.enabled } })
}));
vi.mock('@/pageComponents/chat/SandboxEditor/api', () => ({ openSandboxEditor: mocks.open }));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: (selector: (state: unknown) => unknown) =>
    selector({ userInfo: mocks.anonymous ? null : { _id: 'account' } })
}));
vi.mock('@/pageComponents/chat/SandboxEditor/Editor', () => ({
  default: () => React.createElement('textarea', { 'aria-label': 'File draft' })
}));
vi.mock('@/components/SandboxIDE', () => ({
  default: ({
    entryUrl,
    toolbar,
    actions
  }: {
    entryUrl: string;
    toolbar?: React.ReactNode;
    actions?: React.ReactNode;
  }) => {
    React.useEffect(() => {
      mocks.mounts++;
    }, []);
    return React.createElement(
      React.Fragment,
      null,
      toolbar,
      actions,
      React.createElement('iframe', { title: 'Agent workspace editor', src: entryUrl })
    );
  }
}));
import SandboxFilePanel from '@/pageComponents/chat/SandboxEditor/Panel';

const Harness = () => {
  const panel = useSandboxFilePanel();
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'button',
      {
        onClick: () =>
          panel?.open({
            appId: 'app',
            chatId: 'chat',
            ...(mocks.shared
              ? { outLinkAuthData: { outLinkUid: 'shared' } }
              : mocks.emptyAuth
                ? { outLinkAuthData: {} }
                : {})
          })
      },
      'Open'
    ),
    React.createElement('output', { 'data-testid': 'refresh' }, panel?.refreshVersion),
    React.createElement(SandboxFilePanel)
  );
};
const ready = {
  sandboxId: 'sandbox',
  editorGeneration: 'gen',
  directory: '/workspace/sessions/chat',
  entryUrl: '/api/core/sandbox/proxyAuth?sandboxId=ed-gen&port=8090',
  persistence: 'persistent'
};

describe('chat workspace IDE', () => {
  let root: Root;
  let container: HTMLDivElement;
  const button = (text: string) =>
    [...container.querySelectorAll('button')].find((item) => item.textContent === text)!;
  const click = async (text: string) => act(async () => button(text).click());
  const render = async (scopeKey = 'app:chat') =>
    act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(SandboxFilePanelProvider, { scopeKey }, React.createElement(Harness))
        )
      )
    );
  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.enabled = true;
    mocks.shared = false;
    mocks.anonymous = false;
    mocks.emptyAuth = false;
    mocks.mounts = 0;
    mocks.open.mockReset().mockResolvedValue(ready);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await render();
    await click('Open');
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('starts lazily and keeps the IDE and file draft mounted across tabs', async () => {
    expect(mocks.open).not.toHaveBeenCalled();
    const draft = container.querySelector('textarea')!;
    draft.value = 'unsaved';
    await click('chat:sandbox_ide');
    const iframe = container.querySelector('iframe')!;
    expect(mocks.open).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(ready.directory);
    const before = Number(container.querySelector('[data-testid="refresh"]')?.textContent);
    await click('chat:sandbox_files');
    expect(Number(container.querySelector('[data-testid="refresh"]')?.textContent)).toBe(
      before + 1
    );
    await click('chat:sandbox_ide');
    expect(mocks.open).toHaveBeenCalledTimes(1);
    expect(mocks.mounts).toBe(1);
    expect(container.querySelector('iframe')).toBe(iframe);
    expect(container.querySelector('textarea')).toBe(draft);
    expect(draft.value).toBe('unsaved');
  });
  it('switches tabs with arrow keys and retains the connected frame', async () => {
    const files = button('chat:sandbox_files');
    const ide = button('chat:sandbox_ide');
    files.focus();
    await act(async () =>
      files.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    );
    expect(ide.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(ide);
    expect(files.tabIndex).toBe(-1);
    const iframe = container.querySelector('iframe');
    await act(async () =>
      ide.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    );
    expect(files.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(files);
    expect(container.querySelector('iframe')).toBe(iframe);
    expect(mocks.open).toHaveBeenCalledOnce();
  });
  it('requires save confirmation before disconnecting or closing the connected IDE', async () => {
    await click('chat:sandbox_ide');
    vi.mocked(window.confirm).mockReturnValue(false);
    await click('chat:sandbox_ide_disconnect');
    expect(container.querySelector('iframe')).not.toBeNull();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[aria-label="common:Close"]')!.click()
    );
    expect(container.querySelector('iframe')).not.toBeNull();
    vi.mocked(window.confirm).mockReturnValue(true);
    await click('chat:sandbox_ide_disconnect');
    expect(container.querySelector('iframe')).toBeNull();
    await click('chat:sandbox_ide_connect');
    expect(mocks.open).toHaveBeenCalledTimes(2);
  });
  it.each(['close', 'scope'])('ignores a late startup result after %s', async (kind) => {
    let resolve!: (value: typeof ready) => void;
    mocks.open.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    await click('chat:sandbox_ide');
    await click('chat:sandbox_ide');
    expect(mocks.open).toHaveBeenCalledTimes(1);
    if (kind === 'close')
      await act(async () =>
        container.querySelector<HTMLButtonElement>('button[aria-label="common:Close"]')!.click()
      );
    else await render('app:other-chat');
    await act(async () => resolve(ready));
    expect(container.querySelector('iframe')).toBeNull();
  });
  it.each(['disabled', 'sharing', 'anonymous'])('hides the IDE for %s', async (kind) => {
    mocks.enabled = kind !== 'disabled';
    mocks.shared = kind === 'sharing';
    mocks.anonymous = kind === 'anonymous';
    await render();
    await click('Open');
    expect(button('chat:sandbox_ide')).toBeUndefined();
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it('allows the empty sharing object used by ordinary logged-in chat', async () => {
    mocks.emptyAuth = true;
    await click('Open');
    await click('chat:sandbox_ide');
    expect(mocks.open).toHaveBeenCalledOnce();
  });
  it('shows a specific error and only retries after a user action', async () => {
    mocks.open.mockRejectedValue({ message: 'sandbox_editor_not_found' });
    await click('chat:sandbox_ide');
    expect(container.textContent).toContain('chat:sandbox_ide_not_found');
    expect(container.querySelector('iframe')).toBeNull();
    mocks.open.mockResolvedValue(ready);
    await click('chat:sandbox_ide_connect');
    expect(container.querySelector('iframe')).not.toBeNull();
  });
});
