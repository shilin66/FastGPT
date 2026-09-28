import { describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getIsActive } from '@/components/Layout/navbar';

vi.mock('@/web/support/user/useUserStore', () => ({ useUserStore: vi.fn() }));
vi.mock('@/web/core/chat/context/useChatStore', () => ({ useChatStore: vi.fn() }));
vi.mock('@/web/common/system/useSystemStore', () => ({ useSystemStore: vi.fn() }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Image/MyImage', () => ({ default: () => null }));
vi.mock('@fastgpt/web/hooks/useConfirm', () => ({ useConfirm: vi.fn() }));

const agent = {
  label: 'Agent 管理',
  icon: '',
  link: '/dashboard/agent',
  activeLink: ['/dashboard/agent', '/dashboard/create', '/app/detail']
};
const tool = {
  label: '集成管理',
  icon: '',
  link: '/dashboard/tool',
  activeLink: ['/dashboard/tool']
};

describe('creation page navigation', () => {
  it.each([AppTypeEnum.workflowTool, AppTypeEnum.mcpToolSet, AppTypeEnum.httpToolSet])(
    'highlights only integrations when creating %s',
    (appType) => {
      const query = { appType, parentId: 'folder-one' };
      expect(getIsActive('/dashboard/create', query, tool)).toBe(true);
      expect(getIsActive('/dashboard/create', query, agent)).toBe(false);
    }
  );
  it.each([
    undefined,
    AppTypeEnum.chatAgent,
    AppTypeEnum.simple,
    AppTypeEnum.workflow,
    'unknown',
    ['plugin']
  ])('keeps Agent selected for default, Agent, and invalid types: %s', (appType) => {
    expect(getIsActive('/dashboard/create', { appType }, agent)).toBe(true);
    expect(getIsActive('/dashboard/create', { appType }, tool)).toBe(false);
  });
  it('does not change list routes or query-specific matching', () => {
    expect(getIsActive('/dashboard/agent', { appType: AppTypeEnum.workflowTool }, agent)).toBe(
      true
    );
    expect(getIsActive('/dashboard/tool', {}, tool)).toBe(true);
    const filtered = { ...tool, activeQuery: { view: 'owned' } };
    expect(getIsActive('/dashboard/tool', { view: 'shared' }, filtered)).toBe(false);
    expect(getIsActive('/dashboard/tool', { view: ['owned'] }, filtered)).toBe(true);
  });
});
