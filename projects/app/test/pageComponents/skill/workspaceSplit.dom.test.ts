import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceSplit from '@/pageComponents/dashboard/skill/detail/WorkspaceSplit';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('Skill conversation workspace split', () => {
  let root: Root;
  let container: HTMLDivElement;
  let width: number;
  let notifyResize: () => void;
  const separator = () => {
    const element = container.querySelector<HTMLElement>('[role="separator"]');
    if (!element) throw new Error('Missing workspace resize handle');
    return element;
  };
  const ratio = () => Number(separator().getAttribute('aria-valuenow'));
  const pointer = async (type: string, clientX: number) => {
    const event = new MouseEvent(type, { clientX, button: 0, bubbles: true });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    await act(async () => separator().dispatchEvent(event));
  };
  const key = async (key: string) =>
    act(async () =>
      separator().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    );
  const render = async (showConversation = true) =>
    act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(
            WorkspaceSplit,
            {
              conversation: showConversation
                ? React.createElement('textarea', { defaultValue: 'Draft prompt' })
                : undefined
            },
            React.createElement('textarea', { defaultValue: 'Draft file' })
          )
        )
      )
    );

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    width = 1600;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notifyResize = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      width,
      left: 80,
      right: 80 + width,
      top: 0,
      bottom: 900,
      height: 900,
      x: 80,
      y: 0,
      toJSON: () => ({})
    }));
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn()
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn()
    });
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('resizes both panels by dragging without remounting their drafts and persists the ratio', async () => {
    await render();
    const fields = [...container.querySelectorAll('textarea')];
    const initial = ratio();
    await pointer('pointerdown', 650);
    await pointer('pointermove', 850);
    await pointer('pointerup', 850);
    expect(ratio()).toBeGreaterThan(initial);
    expect([...container.querySelectorAll('textarea')]).toEqual(fields);
    expect(fields.map((field) => field.value)).toEqual(['Draft prompt', 'Draft file']);
    const resized = ratio();
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    expect(ratio()).toBe(resized);
  });

  it('supports keyboard resizing, enforces panel minimums, and resets on double click', async () => {
    await render();
    const initial = ratio();
    await key('ArrowRight');
    expect(ratio()).toBeGreaterThan(initial);
    await key('Home');
    expect(ratio()).toBe(Number(separator().getAttribute('aria-valuemin')));
    await pointer('pointerdown', 0);
    await pointer('pointermove', 9999);
    await pointer('pointerup', 9999);
    expect(ratio()).toBe(Number(separator().getAttribute('aria-valuemax')));
    await act(async () => separator().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(ratio()).toBe(initial);
  });

  it('clamps the layout after container resize and stops resizing on cancellation', async () => {
    await render();
    await key('End');
    width = 1100;
    await act(async () => notifyResize());
    expect(ratio()).toBeLessThanOrEqual(Number(separator().getAttribute('aria-valuemax')));
    await pointer('pointerdown', 600);
    await pointer('pointercancel', 600);
    const stopped = ratio();
    await pointer('pointermove', 850);
    expect(ratio()).toBe(stopped);
    expect(document.body.style.cursor).not.toBe('col-resize');
  });

  it('does not show a divider to read-only users', async () => {
    await render(false);
    expect(container.querySelector('[role="separator"]')).toBeNull();
    expect(container.querySelectorAll('textarea')).toHaveLength(1);
  });

  it('uses a flat workspace surface while keeping an accessible resize divider', async () => {
    await render();
    const workspace = separator().parentElement!;
    expect(getComputedStyle(workspace).borderRadius).toBe('0px');
    expect(getComputedStyle(workspace).borderTopWidth).toBe('0px');
    expect(separator().getAttribute('tabindex')).toBe('0');
  });

  it('releases the drag if editing permission disappears mid-drag', async () => {
    await render();
    await pointer('pointerdown', 650);
    expect(document.body.style.cursor).toBe('col-resize');
    await render(false);
    expect(document.body.style.cursor).not.toBe('col-resize');
    expect(container.querySelector('[role="separator"]')).toBeNull();
  });
});
