import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SkillListCard from '@/pageComponents/dashboard/skill/SkillListCard';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));

describe('Skill list card', () => {
  let root: Root;
  let container: HTMLDivElement;
  const render = async (folder = false) => {
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(
            SkillListCard,
            {
              name: 'Email skill',
              description: '',
              isFolder: folder,
              href: folder
                ? '/dashboard/skill?parentId=folder-one'
                : '/skill/detail?skillId=skill-one',
              updateTime: new Date('2026-09-20T00:00:00Z'),
              relatedApps: React.createElement('button', null, 'Related apps 2')
            },
            React.createElement('button', { 'aria-label': 'More' }, 'More')
          )
        )
      )
    );
  };
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  it('provides a native detail link, description fallback and separate actions', async () => {
    await render();
    const link = container.querySelector('a')!;
    expect(link.textContent).toBe('Email skill');
    expect(link.getAttribute('href')).toBe('/skill/detail?skillId=skill-one');
    expect(container.textContent).toContain('common:no_intro');
    expect(container.textContent).toContain('Skill');
    expect(container.querySelectorAll('button')).toHaveLength(2);
    expect(link.querySelector('button')).toBeNull();
    const more = container.querySelector<HTMLButtonElement>('[aria-label="More"]')!;
    more.focus();
    expect(document.activeElement).toBe(more);
  });
  it('renders a folder label and navigation without related app metadata', async () => {
    await render(true);
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      '/dashboard/skill?parentId=folder-one'
    );
    expect(container.textContent).toContain('common:Folder');
    expect(container.textContent).not.toContain('Related apps 2');
  });
});
