import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SkillPreview from '@/pageComponents/dashboard/skill/detail/preview/SkillPreview';
import { applyAgentModelParams } from '@fastgpt/global/core/ai/agent/modelParams';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type';

const state = vi.hoisted(() => ({
  skillId: 'skill-one',
  sandboxState: 'ready',
  currentTab: 'config',
  chatRunning: false,
  skillDetail: { workspace: { status: 'running' } },
  hook: vi.fn(),
  selector: vi.fn()
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_: unknown, selector: (value: typeof state) => unknown) => selector(state)
}));
vi.mock('@/pageComponents/dashboard/skill/detail/context', () => ({ SkillDetailContext: {} }));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({
    llmModelList: [
      { model: 'qwen', name: 'Qwen' },
      { model: 'other', name: 'Other' }
    ]
  })
}));
vi.mock('@/web/core/chat/context/chatItemContext', () => ({
  default: ({ children }: React.PropsWithChildren) => children
}));
vi.mock('@/web/core/chat/context/chatRecordContext', () => ({
  default: ({ children }: React.PropsWithChildren) => children
}));
vi.mock('@/web/core/skill/api', () => ({ getSkillDebugRecords: vi.fn() }));
vi.mock('@/pageComponents/dashboard/skill/detail/preview/useSkillChatTest', () => ({
  useSkillChatTest: (args: unknown) => {
    state.hook(args);
    return { ChatContainer: null, runStatus: 'idle' };
  }
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: React.PropsWithChildren) => children
}));
vi.mock('@/components/Select/AIModelSelector', () => ({
  default: ({
    value,
    onChange,
    isDisabled,
    ...layout
  }: {
    value: string;
    onChange: (value: string) => void;
    isDisabled: boolean;
    w?: string;
    h?: string;
    maxW?: string;
  }) => {
    state.selector(layout);
    return React.createElement(
      'select',
      {
        value,
        disabled: isDisabled,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)
      },
      ['qwen', 'other'].map((value) => React.createElement('option', { key: value, value }, value))
    );
  }
}));
vi.mock('@/components/core/ai/AISettingModal', () => ({
  default: ({
    onSuccess,
    onClose,
    defaultData
  }: {
    onSuccess: (data: SettingAIDataType) => void;
    onClose: () => void;
    defaultData: SettingAIDataType;
  }) =>
    React.createElement(
      'section',
      { role: 'dialog' },
      React.createElement('output', null, JSON.stringify(defaultData)),
      React.createElement(
        'button',
        {
          onClick: () =>
            onSuccess({
              ...defaultData,
              aiChatDefaultConfig: {
                temperature: 0.7,
                chat_template_kwargs: { enable_thinking: false }
              }
            })
        },
        'save'
      ),
      React.createElement(
        'button',
        { onClick: () => onSuccess({ ...defaultData, aiChatDefaultConfig: undefined }) },
        'clear'
      ),
      React.createElement('button', { onClick: onClose }, 'cancel')
    )
}));

describe('Skill model parameter controls', () => {
  let root: Root;
  let container: HTMLDivElement;
  const render = async () =>
    act(async () =>
      root.render(React.createElement(ChakraProvider, null, React.createElement(SkillPreview)))
    );
  const click = async (text: string) => {
    const button = [...container.querySelectorAll('button')].find(
      (element) => element.textContent === text || element.getAttribute('aria-label') === text
    );
    if (!button) throw new Error(`Missing ${text}`);
    await act(async () => button.click());
  };
  const select = async (value: string) =>
    act(async () => {
      const element = container.querySelector('select')!;
      element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    state.chatRunning = false;
    state.hook.mockClear();
    state.selector.mockClear();
    localStorage.clear();
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
  it('confirms, persists and restores separate parameters for each model', async () => {
    await render();
    await click('app:config_ai_model_params');
    await click('save');
    expect(state.hook.mock.lastCall?.[0].aiChatDefaultConfig).toMatchObject({ temperature: 0.7 });
    await select('other');
    expect(state.hook.mock.lastCall?.[0].aiChatDefaultConfig).toBeUndefined();
    await select('qwen');
    expect(state.hook.mock.lastCall?.[0].aiChatDefaultConfig).toMatchObject({ temperature: 0.7 });
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    await click('app:config_ai_model_params');
    expect(container.querySelector('output')?.textContent).toContain('enable_thinking');
    await click('cancel');
    expect(state.hook.mock.lastCall?.[0].aiChatDefaultConfig).toMatchObject({ temperature: 0.7 });
    await click('app:config_ai_model_params');
    await click('clear');
    expect(state.hook.mock.lastCall?.[0].aiChatDefaultConfig).toBeUndefined();
  });
  it('disables parameter editing while a chat is running', async () => {
    state.chatRunning = true;
    await render();
    expect(
      container
        .querySelector('button[aria-label="app:config_ai_model_params"]')
        ?.hasAttribute('disabled')
    ).toBe(true);
  });

  it('lets a flexible outer wrapper size the model selector without a second inner width limit', async () => {
    await render();
    expect(state.selector.mock.lastCall?.[0]).toMatchObject({ w: '100%', h: '32px' });
    expect(state.selector.mock.lastCall?.[0].maxW).toBeUndefined();
    const wrapper = container.querySelector('select')!.parentElement!;
    expect(getComputedStyle(wrapper).flexBasis).toBe('240px');
    expect(getComputedStyle(wrapper).minWidth).toBe('0px');
  });
});

describe('Agent provider parameter payload', () => {
  it('preserves native values, server-owned fields and context output limits', () => {
    const payload = { model: 'qwen', messages: [], tools: [], stream: true, max_tokens: 1024 };
    const merged = applyAgentModelParams(payload, {
      temperature: 0.7,
      max_tokens: 8192,
      chat_template_kwargs: { enable_thinking: false }
    });
    expect(merged).toEqual({
      ...payload,
      temperature: 0.7,
      chat_template_kwargs: { enable_thinking: false }
    });
    expect(applyAgentModelParams(payload, { max_completion_tokens: 500 }).max_tokens).toBe(500);
    expect(applyAgentModelParams({ max_completion_tokens: 1024 }, { max_tokens: 500 })).toEqual({
      max_completion_tokens: 500
    });
    expect(payload.max_tokens).toBe(1024);
    expect(applyAgentModelParams({ model: 'qwen' }, { max_tokens: 999999 }, 4096)).toEqual({
      model: 'qwen',
      max_tokens: 4096
    });
    expect(() => applyAgentModelParams(payload, { model: 'other' })).toThrow();
  });
});
