import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { postCreateSkill } from '@/web/core/skill/api';

const mocks = vi.hoisted(() => ({
  t: (key: string) => key,
  postCreateSkill: vi.fn<typeof postCreateSkill>(),
  useSystemStore: vi.fn(() => ({ defaultModels: {} })),
  push: vi.fn(),
  onClose: vi.fn(),
  onSuccess: vi.fn(),
  toast: vi.fn()
}));

vi.mock('next/router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: mocks.t }) }));
vi.mock('@/web/core/skill/api', () => ({ postCreateSkill: mocks.postCreateSkill }));
vi.mock('@/web/common/system/useSystemStore', () => ({ useSystemStore: mocks.useSystemStore }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/web/common/file/api', () => ({ getUploadAvatarPresignedUrl: vi.fn() }));
vi.mock('@fastgpt/web/common/file/hooks/useUploadAvatar', () => ({
  useUploadAvatar: (_: unknown, { onSuccess }: { onSuccess: (avatar: string) => void }) => ({
    Component: () => null,
    handleFileSelectorOpen: () => onSuccess('/selected-skill-avatar.png')
  })
}));
vi.mock('@chakra-ui/react', () => {
  const Box = ({ children, onClick }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement('div', { onClick }, children);
  return {
    Box,
    Flex: Box,
    ModalBody: Box,
    ModalFooter: Box,
    Button: ({
      children,
      onClick,
      isLoading
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { isLoading?: boolean }) =>
      React.createElement('button', { onClick, disabled: isLoading }, children),
    Input: React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
      function MockInput({ name, value, defaultValue, onChange, onBlur, placeholder }, ref) {
        return React.createElement('input', {
          ref,
          name,
          value,
          defaultValue,
          onChange,
          onBlur,
          placeholder
        });
      }
    ),
    Textarea: React.forwardRef<
      HTMLTextAreaElement,
      React.TextareaHTMLAttributes<HTMLTextAreaElement>
    >(function MockTextarea({ name, value, defaultValue, onChange, onBlur, placeholder }, ref) {
      return React.createElement('textarea', {
        ref,
        name,
        value,
        defaultValue,
        onChange,
        onBlur,
        placeholder
      });
    })
  };
});
vi.mock('@fastgpt/web/components/common/MyModal', () => ({
  default: ({ children, title }: { children: React.ReactNode; title: string }) =>
    React.createElement('div', { role: 'dialog', 'aria-label': title }, children)
}));
vi.mock('@fastgpt/web/components/common/MyBox/FormLabel', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('label', null, children)
}));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({
  default: ({ src }: { src: string }) => React.createElement('img', { src, alt: 'Skill avatar' })
}));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyPopover', () => ({
  default: ({ Trigger }: { Trigger: React.ReactNode }) => Trigger
}));

import CreateSkillModal from '@/pageComponents/dashboard/skill/CreateSkillModal';

describe('Create blank Skill modal', () => {
  let root: Root;
  let container: HTMLDivElement;
  const field = (name: string) => {
    const result = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `[name="${name}"]`
    );
    if (!result) throw new Error(`Missing form field: ${name}`);
    return result;
  };
  const button = (text: string) => {
    const result = [...container.querySelectorAll('button')].find(
      (item) => item.textContent === text
    );
    if (!result) throw new Error(`Missing button: ${text}`);
    return result;
  };
  const change = async (name: string, value: string) => {
    const input = field(name);
    await act(async () => {
      const prototype =
        input instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const click = async (target: HTMLElement) => act(async () => target.click());
  const mount = async (parentId?: string) =>
    act(async () =>
      root.render(
        React.createElement(CreateSkillModal, {
          parentId,
          onClose: mocks.onClose,
          onSuccess: mocks.onSuccess
        })
      )
    );
  const chooseAvatar = async () => {
    const target = container.querySelector('img')?.parentElement;
    if (!target) throw new Error('Missing avatar picker');
    await click(target);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.postCreateSkill.mockResolvedValue('created-skill-id');
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('offers only name, introduction and avatar without reading model configuration', async () => {
    await mount();

    expect(field('name').value).toBe('');
    expect(field('intro').value).toBe('');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelectorAll('textarea')).toHaveLength(1);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('core/skill/default');
    expect(container.textContent).not.toContain('skill:skill_requirement_label');
    expect(mocks.useSystemStore).not.toHaveBeenCalled();
  });

  it('creates with a name and no configured model, without ignored generation parameters', async () => {
    await mount();
    await change('name', '  Blank skill  ');
    await click(button('common:Confirm'));

    expect(mocks.postCreateSkill).toHaveBeenCalledExactlyOnceWith({
      parentId: null,
      name: 'Blank skill',
      description: undefined,
      avatar: 'core/skill/default'
    });
    expect(mocks.onSuccess).toHaveBeenCalledOnce();
    expect(mocks.onClose).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/skill/detail?skillId=created-skill-id');
  });

  it('keeps name, introduction and selected avatar after failure, then retries the same creation', async () => {
    mocks.postCreateSkill.mockRejectedValueOnce(new Error('Creation unavailable'));
    await mount('parent-folder-id');
    await change('name', '  Draft skill  ');
    await change('intro', '  Keep this introduction.  ');
    await chooseAvatar();
    await click(button('common:Confirm'));

    expect(field('name').value).toBe('  Draft skill  ');
    expect(field('intro').value).toBe('  Keep this introduction.  ');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/selected-skill-avatar.png');
    expect(mocks.onClose).not.toHaveBeenCalled();
    expect(mocks.onSuccess).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({ title: 'Creation unavailable', status: 'error' });
    expect(button('common:Confirm').disabled).toBe(false);

    await click(button('common:Confirm'));
    const expectedRequest = {
      parentId: 'parent-folder-id',
      name: 'Draft skill',
      description: 'Keep this introduction.',
      avatar: '/selected-skill-avatar.png'
    };
    expect(mocks.postCreateSkill).toHaveBeenNthCalledWith(1, expectedRequest);
    expect(mocks.postCreateSkill).toHaveBeenNthCalledWith(2, expectedRequest);
    expect(mocks.onClose).toHaveBeenCalledOnce();
    expect(mocks.onSuccess).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/skill/detail?skillId=created-skill-id');
  });

  it('does not submit without a name and permits cancellation without creating a resource', async () => {
    await mount();
    await click(button('common:Confirm'));
    expect(mocks.postCreateSkill).not.toHaveBeenCalled();

    await click(button('common:Cancel'));
    expect(mocks.onClose).toHaveBeenCalledOnce();
    expect(mocks.onSuccess).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
