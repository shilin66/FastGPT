import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  SkillWorkspaceFileBody,
  SkillWorkspaceFileResponse
} from '@fastgpt/global/openapi/core/agentSkills/files';

const mocks = vi.hoisted(() => ({
  files: vi.fn<(body: SkillWorkspaceFileBody) => Promise<SkillWorkspaceFileResponse>>(),
  context: {
    skillId: '111111111111111111111111',
    chatRunning: false,
    registerWorkspaceSave: vi.fn(),
    sandboxState: 'ready',
    skillDetail: { workspace: { status: 'running' } }
  }
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_: unknown, selector: (value: typeof mocks.context) => unknown) =>
    selector(mocks.context)
}));
vi.mock('@/pageComponents/dashboard/skill/detail/context', () => ({ SkillDetailContext: {} }));
vi.mock('@/web/core/skill/api', () => ({ postSkillWorkspaceFiles: mocks.files }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('next/dynamic', () => ({
  default:
    () =>
    ({ value }: { value: string }) =>
      React.createElement('textarea', { 'aria-label': 'editor', value, readOnly: true })
}));

import WorkspaceFiles from '@/pageComponents/dashboard/skill/detail/config/WorkspaceFiles';

describe('Skill workspace file browser', () => {
  let root: Root;
  let container: HTMLDivElement;
  let entries: Extract<SkillWorkspaceFileResponse, { action: 'list' }>['files'];
  const button = (path: string) => {
    const element = [...container.querySelectorAll('button')].find((el) => el.title === path);
    if (!element) throw new Error(`Missing file browser entry: ${path}`);
    return element;
  };
  const click = async (element: HTMLElement) => act(async () => element.click());
  const refresh = async () => {
    const element = [...container.querySelectorAll('button')].find(
      (el) => el.textContent === 'skill:file_refresh'
    );
    if (!element) throw new Error('Missing refresh button');
    await click(element);
  };

  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    entries = [
      { path: 'skills', type: 'directory', version: '1', size: 0 },
      { path: 'skills/demo', type: 'directory', version: '1', size: 0 },
      { path: 'skills/demo/SKILL.md', type: 'file', version: '1', size: 12 },
      { path: 'skills/demo/scripts', type: 'directory', version: '1', size: 0 },
      { path: 'skills/demo/scripts/test.py', type: 'file', version: '1', size: 12 },
      { path: 'skills/other', type: 'directory', version: '1', size: 0 },
      { path: 'skills/other/SKILL.md', type: 'file', version: '1', size: 12 }
    ];
    mocks.files.mockReset();
    mocks.files.mockImplementation(async (body) => {
      if (body.action === 'list') return { action: 'list', files: [...entries], truncated: false };
      if (body.action === 'read') {
        return {
          action: 'read',
          path: body.path,
          content: 'Original draft',
          hash: 'hash',
          version: '1'
        };
      }
      throw new Error('Directory navigation must not write files');
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () =>
      root.render(React.createElement(ChakraProvider, null, React.createElement(WorkspaceFiles)))
    );
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens only root directories initially and toggles nested folders without file requests', async () => {
    expect(button('skills').getAttribute('aria-expanded')).toBe('true');
    expect(button('skills/demo').disabled).toBe(false);
    expect(button('skills/demo').getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[title="skills/demo/SKILL.md"]')).toBeNull();
    await click(button('skills/demo'));
    expect(button('skills/demo').getAttribute('aria-expanded')).toBe('true');
    expect(button('skills/demo/SKILL.md')).toBeTruthy();
    await click(button('skills/demo/scripts'));
    expect(button('skills/demo/scripts/test.py')).toBeTruthy();
    await click(button('skills/demo'));
    expect(container.querySelector('[title="skills/demo/scripts/test.py"]')).toBeNull();
    expect(mocks.files.mock.calls.every(([body]) => body.action === 'list')).toBe(true);
  });

  it('keeps recent changes collapsed, merges paths and opens existing files from the popover', async () => {
    const changesButton = () => {
      const element = [...container.querySelectorAll('button')].find((el) =>
        el.textContent?.startsWith('skill:file_recent_changes')
      );
      if (!element) throw new Error('Missing recent changes action');
      return element;
    };
    expect(changesButton().disabled).toBe(true);
    entries = entries.map((entry) =>
      entry.path === 'skills/demo/SKILL.md' ? { ...entry, version: '2' } : entry
    );
    await refresh();
    entries = entries
      .map((entry) => (entry.path === 'skills/demo/SKILL.md' ? { ...entry, version: '3' } : entry))
      .filter((entry) => entry.path !== 'skills/demo/scripts/test.py');
    await refresh();
    expect(changesButton().textContent).toContain('2');
    const closedPopup = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(getComputedStyle(closedPopup).visibility).toBe('hidden');
    expect(closedPopup.querySelectorAll('button[title]')).toHaveLength(0);
    await click(changesButton());
    await act(async () => vi.advanceTimersByTimeAsync(50));
    const popup = document.querySelector('[role="dialog"]');
    expect(popup).not.toBeNull();
    const rows = popup!.querySelectorAll('button[title]');
    expect(rows).toHaveLength(2);
    const deleted = popup!.querySelector<HTMLButtonElement>(
      '[title="skills/demo/scripts/test.py"]'
    )!;
    expect(deleted.disabled).toBe(true);
    expect(deleted.textContent).toContain('skill:file_change_deleted');
    const modified = popup!.querySelector<HTMLButtonElement>('[title="skills/demo/SKILL.md"]')!;
    expect(modified.textContent).toContain('skill:file_change_modified');
    await click(modified);
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(container.querySelector('textarea')?.value).toBe('Original draft');
    expect(mocks.files).toHaveBeenCalledWith({
      skillId: mocks.context.skillId,
      action: 'read',
      path: 'skills/demo/SKILL.md'
    });
    expect(changesButton().getAttribute('aria-expanded')).toBe('false');
    await click(changesButton());
    await act(async () => vi.advanceTimersByTimeAsync(50));
    await act(async () => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
      dialog.focus();
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(changesButton().getAttribute('aria-expanded')).toBe('false');
  });

  it('retains expansion choices across list refreshes and preserves a selected file when collapsing', async () => {
    await click(button('skills/demo'));
    await click(button('skills/demo/SKILL.md'));
    expect(container.querySelector('textarea')?.value).toBe('Original draft');
    await click(button('skills/demo'));
    entries.push({ path: 'skills/new', type: 'directory', version: '1', size: 0 });
    await refresh();
    expect(button('skills/demo').getAttribute('aria-expanded')).toBe('false');
    expect(button('skills/new').getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('textarea')?.value).toBe('Original draft');
    await click(button('skills'));
    await act(async () => vi.advanceTimersByTimeAsync(2100));
    expect(button('skills').getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[title="skills/demo"]')).toBeNull();
    await click(button('skills'));
    await click(button('skills/demo'));
    expect(button('skills/demo/SKILL.md').getAttribute('aria-current')).toBe('true');
    expect(mocks.files.mock.calls.filter(([body]) => body.action === 'read')).toHaveLength(1);
  });

  it('collapses every folder and keeps nested folders closed when the root reopens', async () => {
    await click(button('skills/demo'));
    await click(button('skills/demo/scripts'));
    const collapse = [...container.querySelectorAll('button')].find(
      (el) => el.textContent === 'skill:file_collapse_all'
    );
    if (!collapse) throw new Error('Missing collapse-all action');
    await click(collapse);
    expect(button('skills').getAttribute('aria-expanded')).toBe('false');
    expect(collapse.disabled).toBe(true);
    await click(button('skills'));
    expect(button('skills/demo').getAttribute('aria-expanded')).toBe('false');
    await click(button('skills/demo'));
    expect(button('skills/demo/scripts').getAttribute('aria-expanded')).toBe('false');
  });

  it('handles valid folder names that also exist on Object.prototype', async () => {
    entries.push(
      { path: 'constructor', type: 'directory', version: '1', size: 0 },
      { path: 'constructor/SKILL.md', type: 'file', version: '1', size: 12 }
    );
    await refresh();
    expect(button('constructor').getAttribute('aria-expanded')).toBe('true');
    await click(button('constructor'));
    expect(button('constructor').getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[title="constructor/SKILL.md"]')).toBeNull();
  });
});
