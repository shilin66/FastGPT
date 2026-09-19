import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CreateSkillPage from '@/pageComponents/dashboard/skill/CreateSkillPage';

const mocks = vi.hoisted(() => ({ push: vi.fn(), query: { parentId: 'folder-one' } }));
vi.mock('next/router', () => ({ useRouter: () => ({ push: mocks.push, query: mocks.query }) }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@/pageComponents/dashboard/skill/CreateSkillModal', () => ({
  CreateSkillForm: ({
    parentId,
    onSuccess,
    onBusyChange
  }: {
    parentId?: string;
    onSuccess: (id: string) => void;
    onBusyChange: (busy: boolean) => void;
  }) =>
    React.createElement(
      'div',
      { 'data-parent': parentId },
      React.createElement('input', { name: 'draft-name', defaultValue: '' }),
      React.createElement('button', { onClick: () => onSuccess('new-skill') }, 'create-result'),
      React.createElement('button', { onClick: () => onBusyChange(true) }, 'start-request')
    )
}));
vi.mock('@/pageComponents/dashboard/skill/ImportSkillModal', () => ({
  ImportSkillForm: ({ parentId, onClose }: { parentId?: string; onClose: () => void }) =>
    React.createElement(
      'div',
      { 'data-parent': parentId },
      React.createElement('input', { name: 'draft-archive', defaultValue: '' }),
      React.createElement('button', { onClick: onClose }, 'import-result')
    )
}));

describe('Unified Skill creation page', () => {
  let root: Root;
  let container: HTMLDivElement;
  const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const button = (text: string) => {
    const el = [...container.querySelectorAll('button')].find((el) => el.textContent === text);
    if (!el) throw new Error(`Missing button ${text}`);
    return el;
  };
  const click = (el: HTMLElement) => act(async () => el.click());
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root.render(React.createElement(ChakraProvider, null, React.createElement(CreateSkillPage)))
    );
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  it('switches the form and matching instructions while preserving both drafts', async () => {
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'skill:create_blank_description'
    );
    const name = container.querySelector<HTMLInputElement>('[name="draft-name"]')!;
    name.value = 'My draft';
    await click(tabs()[1]);
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'skill:create_import_description'
    );
    const archive = container.querySelector<HTMLInputElement>('[name="draft-archive"]')!;
    archive.value = 'skills.zip';
    await click(tabs()[0]);
    expect(name.value).toBe('My draft');
    await click(tabs()[1]);
    expect(archive.value).toBe('skills.zip');
    expect(container.querySelectorAll('[data-parent="folder-one"]')).toHaveLength(2);
  });
  it('opens a newly created workspace and returns imports to the same folder', async () => {
    await click(button('create-result'));
    expect(mocks.push).toHaveBeenCalledWith('/skill/detail?skillId=new-skill');
    await click(tabs()[1]);
    await click(button('import-result'));
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: '/dashboard/skill',
      query: { parentId: 'folder-one' }
    });
  });
  it('prevents switching methods or leaving through the page while a request is active', async () => {
    await click(button('start-request'));
    expect(tabs().every((tab) => tab.disabled)).toBe(true);
    expect(button('skill:create_skill').disabled).toBe(true);
  });
});
