import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportSkillForm } from '@/pageComponents/dashboard/skill/ImportSkillModal';
import type { importSkill } from '@/web/core/skill/api';

const mocks = vi.hoisted(() => ({
  importSkill: vi.fn<typeof importSkill>(),
  toast: vi.fn(),
  close: vi.fn(),
  success: vi.fn(),
  busy: vi.fn()
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/web/core/skill/api', () => ({ importSkill: mocks.importSkill }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyModal', () => ({
  default: ({ children }: React.PropsWithChildren) => children
}));

describe('Skill archive import form', () => {
  let container: HTMLDivElement;
  let root: Root;
  const button = (label: string) => {
    const el = [...container.querySelectorAll('button')].find(
      (el) => el.textContent === label || el.getAttribute('aria-label') === label
    );
    if (!el) throw new Error(`Missing button ${label}`);
    return el;
  };
  const click = (el: HTMLElement) => act(async () => el.click());
  const select = (file: File) =>
    act(async () => {
      const input = container.querySelector('input[type="file"]')!;
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.importSkill.mockResolvedValue('imported-skill');
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(ImportSkillForm, {
            parentId: 'folder-one',
            onClose: mocks.close,
            onSuccess: mocks.success,
            onBusyChange: mocks.busy
          })
        )
      )
    );
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  it('explains the archive requirements and keeps import disabled until a file is selected', async () => {
    expect(container.textContent).toContain('skill:create_import_form_hint');
    expect(button('skill:import_skill').disabled).toBe(true);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const open = vi.spyOn(input, 'click');
    await click(button('skill:create_import_file_label'));
    expect(open).toHaveBeenCalledOnce();
  });
  it('rejects non-ZIP and oversized files without sending a request', async () => {
    await select(new File(['wrong'], 'skill.txt'));
    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'warning',
      title: 'skill:unsupported_file_format'
    });
    const large = new File(['zip'], 'large.zip');
    Object.defineProperty(large, 'size', { value: 100 * 1024 * 1024 + 1 });
    await select(large);
    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'warning',
      title: 'file:some_file_size_exceeds_limit'
    });
    expect(button('skill:import_skill').disabled).toBe(true);
    expect(mocks.importSkill).not.toHaveBeenCalled();
  });
  it('preserves the archive and explains a failed import, then retries in the same folder', async () => {
    mocks.importSkill.mockRejectedValueOnce(new Error('Invalid Skill package'));
    await select(new File(['zip'], 'my-skill.zip'));
    await click(button('skill:import_skill'));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Invalid Skill package'
    );
    expect(container.textContent).toContain('my-skill.zip');
    expect(mocks.close).not.toHaveBeenCalled();
    await click(button('skill:import_skill'));
    expect(mocks.importSkill).toHaveBeenCalledTimes(2);
    const body = mocks.importSkill.mock.calls[1][0];
    expect(body.get('parentId')).toBe('folder-one');
    expect((body.get('file') as File).name).toBe('my-skill.zip');
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledOnce();
  });
  it('locks file removal and cancel while importing, then releases busy state', async () => {
    let complete: ((value: string) => void) | undefined;
    mocks.importSkill.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      })
    );
    await select(new File(['zip'], 'my-skill.zip'));
    await click(button('skill:import_skill'));
    expect(button('skill:create_remove_file').disabled).toBe(true);
    expect(button('common:Cancel').disabled).toBe(true);
    expect(mocks.busy).toHaveBeenLastCalledWith(true);
    await act(async () => complete?.('imported-skill'));
    expect(mocks.busy).toHaveBeenLastCalledWith(false);
  });
});
