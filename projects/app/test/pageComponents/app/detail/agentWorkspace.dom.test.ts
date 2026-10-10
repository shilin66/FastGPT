import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  width: 2288,
  isOpen: false,
  isExpanded: false,
  isAutoOpened: false
}));
vi.mock('ahooks', () => ({ useSize: () => ({ width: state.width, height: 900 }) }));
vi.mock('@/pageComponents/chat/SandboxEditor/PanelContext', () => ({
  useSandboxFilePanel: () => ({ ...state, restore: vi.fn(), markManuallyResized: vi.fn() })
}));
vi.mock('@/pageComponents/chat/SandboxEditor/Panel', () => ({ default: () => null }));

import AgentWorkspace from '@/pageComponents/app/detail/Edit/ChatAgent/AgentWorkspace';

let root: Root;
let container: HTMLDivElement;
const render = () =>
  act(async () =>
    root.render(
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(AgentWorkspace, {
          config: 'Configuration',
          chat: 'Preview',
          showConfig: true
        })
      )
    )
  );
const configPane = () => {
  const divider = container.querySelector('[aria-label="调整配置区域宽度"]');
  if (!divider?.previousElementSibling) throw new Error('Missing configuration pane');
  return divider.previousElementSibling;
};
const configWidth = () => parseFloat(getComputedStyle(configPane()).width);

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(state, { width: 2288, isOpen: false, isExpanded: false, isAutoOpened: false });
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('Agent workspace pane allocation', () => {
  it('allocates a wider configuration pane on first open and adapts to viewport changes', async () => {
    await render();
    expect(configWidth()).toBe(960);
    state.width = 1200;
    await render();
    expect(configWidth()).toBe(760);
    state.width = 1040;
    await render();
    expect(configWidth()).toBe(652);
    expect(state.width - configWidth() - 8).toBeGreaterThanOrEqual(380);
  });

  it('respects a saved width, prevents a collapsed form, and persists keyboard resizing', async () => {
    localStorage.setItem('agent_config_pane_width', '720');
    await render();
    expect(configWidth()).toBe(720);
    const divider = container.querySelector('[aria-label="调整配置区域宽度"]');
    await act(async () =>
      divider?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    );
    expect(configWidth()).toBe(744);
    expect(localStorage.getItem('agent_config_pane_width')).toBe('744');
    localStorage.setItem('agent_config_pane_width', '300');
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    expect(configWidth()).toBe(520);
  });

  it('keeps all three panes within the available width at a compact desktop size', async () => {
    Object.assign(state, { width: 1040, isOpen: true });
    await render();
    const fileDivider = container.querySelector('[aria-label="调整文件区域宽度"]');
    if (!fileDivider?.nextElementSibling) throw new Error('Missing file pane');
    const fileWidth = parseFloat(getComputedStyle(fileDivider.nextElementSibling).width);
    expect(fileWidth).toBeGreaterThanOrEqual(248);
    expect(configWidth() + fileWidth + 16 + 380).toBeLessThanOrEqual(state.width);
    state.isExpanded = true;
    await render();
    const expandedFileWidth = parseFloat(getComputedStyle(fileDivider.nextElementSibling).width);
    expect(configWidth() + expandedFileWidth + 16 + 380).toBeLessThanOrEqual(state.width);
  });
});
