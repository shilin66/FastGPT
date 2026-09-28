import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  sandboxEndpointUrl: '/api/core/sandbox/proxyAuth?sandboxId=logical-sandbox&port=8090'
}));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_context: unknown, selector: (value: typeof state) => unknown) =>
    selector(state)
}));
vi.mock('@/pageComponents/dashboard/skill/detail/context', () => ({ SkillDetailContext: {} }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  Flex: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  Text: ({ children }: { children: React.ReactNode }) =>
    React.createElement('span', null, children),
  Button: ({
    children,
    onClick,
    isDisabled,
    as,
    href
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    isDisabled?: boolean;
    as?: string;
    href?: string;
  }) => React.createElement(as ?? 'button', { onClick, disabled: isDisabled, href }, children)
}));
import SandboxIframe from '@/pageComponents/dashboard/skill/detail/config/SandboxIframe';

describe('Skill editor lossless session renewal', () => {
  let root: Root;
  let container: HTMLDivElement;
  const editor = () =>
    container.querySelector<HTMLIFrameElement>('iframe[title="Skill workspace editor"]')!;
  const renewal = () =>
    container.querySelector<HTMLIFrameElement>('iframe[title="Skill workspace authentication"]')!;
  const acknowledge = (changes: Partial<MessageEventInit> = {}) => {
    const frame = renewal();
    const url = new URL(frame.src);
    window.dispatchEvent(
      new MessageEvent('message', {
        source: frame.contentWindow,
        origin: 'http://8090--logical-sandbox.localhost:3000',
        data: {
          type: 'fastgpt:sandbox-session',
          requestId: url.searchParams.get('requestId'),
          expiresAt: Date.now() + 900_000
        },
        ...changes
      })
    );
  };
  const loadEditor = async () => {
    await act(async () => editor().dispatchEvent(new Event('load')));
  };
  beforeEach(async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(React.createElement(SandboxIframe)));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reauthenticates in a separate frame and renews before expiry without replacing the editor', async () => {
    const original = editor();
    const originalSrc = original.src;
    await loadEditor();
    expect(new URL(renewal().src).searchParams.get('mode')).toBe('renew');
    await act(async () => acknowledge());
    expect(container.textContent).toContain('skill:sandbox_session_active');
    expect(renewal()).toBeNull();
    await act(async () => vi.advanceTimersByTime(780_000));
    expect(renewal()).not.toBeNull();
    expect(editor()).toBe(original);
    expect(editor().src).toBe(originalSrc);
  });

  it('renews on HTTP without randomUUID and accepts only the matching same-origin frame', async () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('secure context only');
    });
    await loadEditor();
    expect(new URL(renewal().src).searchParams.get('requestId')).toMatch(/^[a-f0-9]{48}$/);
    await act(async () => acknowledge({ origin: window.location.origin, source: window }));
    expect(renewal()).not.toBeNull();
    await act(async () => acknowledge({ origin: window.location.origin }));
    expect(container.textContent).toContain('skill:sandbox_session_active');
    expect(renewal()).toBeNull();
  });

  it.each(['source', 'origin', 'nonce', 'expiry'])(
    'ignores forged %s acknowledgements',
    async (kind) => {
      await loadEditor();
      await act(async () => {
        if (kind === 'source') acknowledge({ source: window });
        if (kind === 'origin') acknowledge({ origin: 'https://8090--other-sandbox.example.com' });
        if (kind === 'nonce')
          acknowledge({
            data: {
              type: 'fastgpt:sandbox-session',
              requestId: 'wrong',
              expiresAt: Date.now() + 900_000
            }
          });
        if (kind === 'expiry')
          acknowledge({
            data: {
              type: 'fastgpt:sandbox-session',
              requestId: new URL(renewal().src).searchParams.get('requestId'),
              expiresAt: Date.now() + 86_400_000
            }
          });
        vi.advanceTimersByTime(20_000);
      });
      expect(container.textContent).toContain('skill:sandbox_session_failed');
    }
  );

  it('preserves the editor on failure and manual retry; old replies cannot complete a new request', async () => {
    const original = editor();
    await loadEditor();
    const oldFrame = renewal();
    const oldId = new URL(oldFrame.src).searchParams.get('requestId');
    await act(async () => vi.advanceTimersByTime(20_000));
    expect(container.textContent).toContain('skill:sandbox_session_failed');
    const retry = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'skill:sandbox_session_renew'
    )!;
    await act(async () => retry.click());
    await act(async () =>
      acknowledge({
        data: { type: 'fastgpt:sandbox-session', requestId: oldId, expiresAt: Date.now() + 900_000 }
      })
    );
    expect(renewal()).not.toBeNull();
    await act(async () => acknowledge());
    expect(container.textContent).toContain('skill:sandbox_session_active');
    expect(editor()).toBe(original);
  });

  it('cancels pending renewals and timers when the editor unmounts', async () => {
    await loadEditor();
    await act(async () => root.render(null));
    await act(async () => vi.advanceTimersByTime(900_000));
    expect(container.children).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not renew on every focus, but retries a failed request when returning to the page', async () => {
    await loadEditor();
    await act(async () => acknowledge());
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(renewal()).toBeNull();
    await act(async () => vi.advanceTimersByTime(800_000));
    expect(container.textContent).toContain('skill:sandbox_session_failed');
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(renewal()).not.toBeNull();
  });

  it('retries a failed manual authentication on focus even before the old session expiry', async () => {
    await loadEditor();
    await act(async () => acknowledge());
    const button = [...container.querySelectorAll('button')].find(
      (item) => item.textContent === 'skill:sandbox_session_renew'
    )!;
    await act(async () => button.click());
    await act(async () => vi.advanceTimersByTime(20_000));
    expect(container.textContent).toContain('skill:sandbox_session_failed');
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(renewal()).not.toBeNull();
  });
});
