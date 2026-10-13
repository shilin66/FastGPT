import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@fastgpt/web/i18n/zh-CN/common.json';

const mocks = vi.hoisted(() => ({
  notice: vi.fn(),
  announcement: vi.fn(),
  track: vi.fn(),
  isPlus: false,
  path: '/dashboard/agent'
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh-CN' },
    t: (key: string, values?: Record<string, unknown>) =>
      Object.entries(values ?? {}).reduce(
        (s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)),
        (messages as Record<string, string>)[key.replace('common:', '')] ?? key
      )
  })
}));
vi.mock('next/router', () => ({ useRouter: () => ({ pathname: mocks.path }) }));
vi.mock('next/dynamic', () => ({
  default:
    () =>
    ({ source }: { source?: string }) =>
      React.createElement('div', null, source)
}));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => ({ isPc: true }) }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: { isPlus: mocks.isPlus } })
}));
vi.mock('@/web/support/license/api', () => ({ getLicenseExpiryNotice: mocks.notice }));
vi.mock('@/web/support/user/inform/api', () => ({ getSystemMsgModalData: mocks.announcement }));
vi.mock('@/web/common/middle/tracks/utils', () => ({
  webPushTrack: { readSystemAnnouncement: mocks.track }
}));
vi.mock('@/web/support/user/useUserStore', async () => {
  const { create } = await import('@fastgpt/web/common/zustand');
  const store = create<any>((set) => ({
    userInfo: { _id: 'member-1', username: 'member' },
    systemMsgReadId: '',
    licenseNoticeReadIds: {},
    setSysMsgReadId: (id: string) => set({ systemMsgReadId: id }),
    setLicenseNoticeReadId: (userId: string, id: string) =>
      set((s: any) => ({
        licenseNoticeReadIds: {
          ...s.licenseNoticeReadIds,
          [userId]: [...(s.licenseNoticeReadIds[userId] || []), id]
        }
      }))
  }));
  Object.assign(store, {
    persist: { hasHydrated: () => true, onFinishHydration: () => () => {}, rehydrate: vi.fn() }
  });
  return { useUserStore: store };
});
import SystemMsgModal from '@/components/support/user/inform/SystemMsgModal';
import { useUserStore } from '@/web/support/user/useUserStore';

const notice = (stage = 30) => ({
  id: `reminder-${stage}`,
  stage,
  expiresAt: new Date(Date.now() + 20 * 86400000).toISOString(),
  serverNow: new Date().toISOString(),
  remainingDays: 20,
  content: '系统授权剩余 {{remainingDays}}，到期时间：{{expiresAt}}。'
});
describe('license reminders in the system-message modal', () => {
  let root: Root;
  let container: HTMLDivElement;
  let client: QueryClient;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.isPlus = false;
    mocks.path = '/dashboard/agent';
    mocks.notice.mockResolvedValue(notice());
    mocks.announcement.mockResolvedValue({ id: 'announcement-1', content: '普通公告' });
    useUserStore.setState({
      userInfo: { _id: 'member-1', username: 'member' } as any,
      systemMsgReadId: '',
      licenseNoticeReadIds: {}
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, cacheTime: 0 } },
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
    });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    vi.unstubAllGlobals();
  });
  const settle = async () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
  const render = async () => {
    await act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(QueryClientProvider, { client }, React.createElement(SystemMsgModal))
        )
      )
    );
    await settle();
    await settle();
  };
  const dismiss = async () => {
    await act(async () =>
      [...document.querySelectorAll('button')].find((b) => b.textContent === '我知道了')?.click()
    );
    await settle();
  };
  it('reminds ordinary users even when isPlus is false', async () => {
    await render();
    expect(document.body.textContent).toContain('系统授权剩余 20 天');
    expect(document.body.textContent).not.toContain('查看授权配置');
    expect(mocks.announcement).not.toHaveBeenCalled();
  });
  it('only acknowledges the current stage and reminds again at the next stage', async () => {
    await render();
    await dismiss();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(useUserStore.getState().systemMsgReadId).toBe('');
    mocks.notice.mockResolvedValue(notice(15));
    await act(async () => {
      await client.invalidateQueries(['licenseExpiryNotice']);
    });
    await settle();
    expect(document.body.textContent).toContain('系统授权剩余');
  });
  it('shows the ordinary announcement after the reminder and reads them separately', async () => {
    mocks.isPlus = true;
    await render();
    await dismiss();
    expect(document.body.textContent).toContain('普通公告');
    expect(useUserStore.getState().systemMsgReadId).toBe('');
    expect(mocks.track).not.toHaveBeenCalled();
  });
  it('does not let one user acknowledgement silence another logged-in user', async () => {
    await render();
    await dismiss();
    await act(async () =>
      useUserStore.setState({ userInfo: { _id: 'member-2', username: 'member2' } as any })
    );
    await settle();
    expect(document.body.textContent).toContain('系统授权剩余');
  });
  it('does not add a configuration button for root', async () => {
    useUserStore.setState({ userInfo: { _id: 'root', username: 'root' } as any });
    await render();
    expect(document.body.textContent).toContain('我知道了');
    expect(document.body.textContent).not.toContain('查看授权配置');
    await dismiss();
    expect(useUserStore.getState().licenseNoticeReadIds.root).toContain('reminder-30');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('does not remind on the login or external-share page', async () => {
    mocks.path = '/chat/share';
    await render();
    expect(mocks.notice).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('still shows announcements if the reminder request fails', async () => {
    mocks.isPlus = true;
    mocks.notice.mockRejectedValue(new Error('offline'));
    await render();
    expect(mocks.announcement).toHaveBeenCalled();
    expect(document.body.textContent).toContain('普通公告');
  });
  it('waits while another modal is open', async () => {
    const other = document.createElement('div');
    other.setAttribute('role', 'dialog');
    document.body.appendChild(other);
    await render();
    expect(document.body.textContent).not.toContain('系统授权剩余');
    await act(async () => other.remove());
    await settle();
    expect(document.body.textContent).toContain('系统授权剩余');
  });
});
