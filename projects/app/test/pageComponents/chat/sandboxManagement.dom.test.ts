import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@fastgpt/web/i18n/zh-CN/chat.json';

const mocks = vi.hoisted(() => ({ list: vi.fn(), action: vi.fn(), confirm: vi.fn() }));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh-CN' },
    t: (key: string, values?: Record<string, unknown>) => {
      const dictionary: Record<string, string> = messages;
      return Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
        dictionary[key.replace('chat:', '')] ?? key
      );
    }
  })
}));
vi.mock('@/web/core/ai/sandbox/management', () => ({
  listSandboxWorkspaces: mocks.list,
  actOnSandboxWorkspace: mocks.action
}));
vi.mock('@fastgpt/web/hooks/useConfirm', () => ({
  useConfirm: () => ({
    openConfirm: (options: unknown) => () => mocks.confirm(options),
    ConfirmModal: () => null
  })
}));
import SandboxManagementModal from '@/components/core/sandbox/SandboxManagementModal';

const workspace = {
  sandboxId: 'workspace-failed-1',
  sourceType: 'appRuntime',
  sourceId: 'app-1',
  sourceName: '重要 Agent',
  reuseScope: 'user',
  purpose: 'runtime',
  technicalName: 'agent-user',
  status: 'failed',
  providerStatus: 'unknown',
  statusMismatch: false,
  createdAt: '2026-01-01',
  lastActiveAt: '2026-01-01',
  hasPersistentStorage: true,
  canRelease: false,
  canDelete: false,
  canForceDelete: true,
  canRecover: true,
  deletionRevision: 'a'.repeat(64)
};

describe('sandbox force deletion UI', () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.list.mockResolvedValue({ supported: true, total: 1, list: [workspace] });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  const render = async () =>
    act(async () =>
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(SandboxManagementModal, {
            isOpen: true,
            onClose: vi.fn(),
            scope: { sourceType: 'appRuntime', sourceId: 'app-1' }
          })
        )
      )
    );
  it('only submits empty rebuilding after explicit confirmation', async () => {
    const revision = 'b'.repeat(64);
    mocks.action.mockResolvedValue({
      success: false,
      status: 'confirmation_required',
      recoveryRevision: revision
    });
    await render();
    await act(async () =>
      [...document.querySelectorAll('button')]
        .find((button) => button.textContent === '恢复沙箱')
        ?.click()
    );
    expect(mocks.action).toHaveBeenCalledExactlyOnceWith({
      sourceType: 'appRuntime',
      sourceId: 'app-1',
      sandboxId: workspace.sandboxId,
      action: 'recover'
    });
    expect(document.body.textContent).toContain('原文件卷和备份均不存在');
    expect(document.body.textContent).toContain('无法找回');
    expect(document.body.textContent).toContain('重要 Agent');
    expect(document.body.textContent).toContain(workspace.sandboxId);
    mocks.action.mockResolvedValue({ success: true, status: 'recovered', strategy: 'empty' });
    await act(async () =>
      [...document.querySelectorAll('button')]
        .find((button) => button.textContent === '重建空白沙箱')
        ?.click()
    );
    expect(mocks.action).toHaveBeenLastCalledWith({
      sourceType: 'appRuntime',
      sourceId: 'app-1',
      sandboxId: workspace.sandboxId,
      action: 'recover',
      rebuildEmpty: true,
      recoveryRevision: revision
    });
  });

  it('does not rebuild if empty confirmation is cancelled', async () => {
    mocks.action.mockResolvedValue({
      success: false,
      status: 'confirmation_required',
      recoveryRevision: 'b'.repeat(64)
    });
    await render();
    await act(async () =>
      [...document.querySelectorAll('button')]
        .find((button) => button.textContent === '恢复沙箱')
        ?.click()
    );
    await act(async () =>
      [...document.querySelectorAll('button')]
        .find((button) => button.textContent === '取消')
        ?.click()
    );
    expect(mocks.action).toHaveBeenCalledOnce();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(document.body.textContent).not.toContain('重建空白沙箱');
  });
  it('shows the member name in the list and the account and ID in details', async () => {
    mocks.list.mockResolvedValue({
      supported: true,
      total: 1,
      list: [
        {
          ...workspace,
          runtimeUserId: 'member-1',
          runtimeUserName: '张三',
          runtimeUserAccount: 'zhangsan@example.com'
        }
      ]
    });
    await render();
    expect(document.body.textContent).toContain('所属用户：张三');
    await act(async () =>
      [...document.querySelectorAll('button')]
        .find((button) => button.textContent === '详情')
        ?.click()
    );
    expect(document.body.textContent).toContain('所属用户账号');
    expect(document.body.textContent).toContain('zhangsan@example.com');
    expect(document.body.textContent).toContain('member-1');
  });

  it.each([
    { runtimeUserAccount: 'account@example.com', expected: 'account@example.com' },
    { runtimeUserAccount: undefined, expected: 'external-visitor' }
  ])(
    'falls back to the account or ID when a member name is unavailable: $expected',
    async ({ runtimeUserAccount, expected }) => {
      mocks.list.mockResolvedValue({
        supported: true,
        total: 1,
        list: [
          {
            ...workspace,
            runtimeUserId: 'external-visitor',
            runtimeUserAccount
          }
        ]
      });
      await render();
      expect(document.body.textContent).toContain(`所属用户：${expected}`);
      await act(async () =>
        [...document.querySelectorAll('button')]
          .find((button) => button.textContent === '详情')
          ?.click()
      );
      if (!runtimeUserAccount) expect(document.body.textContent).toContain('未关联账号');
      expect(document.body.textContent).toContain('external-visitor');
    }
  );

  it('requires explicit destructive confirmation with Agent and workspace identity before submitting revision', async () => {
    await render();
    const button = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === '强制删除'
    );
    expect(button).toBeDefined();
    await act(async () => button?.click());
    expect(mocks.action).not.toHaveBeenCalled();
    const confirmation = mocks.confirm.mock.calls[0][0];
    expect(confirmation.customContent).toContain('重要 Agent');
    expect(confirmation.customContent).toContain('workspace-failed-1');
    expect(confirmation.customContent).toContain('不可恢复');
    expect(confirmation.customContent).toContain('多条对话');
    expect(confirmation.customContent).toContain('保留');
    expect(confirmation.customContent).toContain('空白');
    mocks.action.mockResolvedValue({ success: false, status: 'pending', reason: 'cleanup_failed' });
    mocks.list.mockResolvedValue({
      supported: true,
      total: 1,
      list: [{ ...workspace, forceDeletionPending: true }]
    });
    await act(async () => confirmation.onConfirm());
    expect(mocks.action).toHaveBeenCalledWith({
      sourceType: 'appRuntime',
      sourceId: 'app-1',
      sandboxId: workspace.sandboxId,
      action: 'forceDelete',
      deletionRevision: workspace.deletionRevision
    });
    expect(document.body.textContent).toContain('删除待完成');
    expect(document.body.textContent).toContain('继续删除');
  });
  it('returns from an emptied last page after deletion', async () => {
    mocks.list.mockImplementation(async () => ({ supported: true, total: 21, list: [workspace] }));
    await render();
    await act(async () =>
      [...document.querySelectorAll('button')]
        .find((button) => button.textContent === messages.sandbox_manage_next)
        ?.click()
    );
    expect(mocks.list.mock.calls.at(-1)?.[0].page).toBe(2);
    await act(async () =>
      [...document.querySelectorAll('button')]
        .find((button) => button.textContent === '强制删除')
        ?.click()
    );
    mocks.action.mockResolvedValue({ success: true, status: 'deleted' });
    mocks.list.mockImplementation(async ({ page }: { page: number }) => ({
      supported: true,
      total: 20,
      list: page === 2 ? [] : [{ ...workspace, sandboxId: 'remaining' }]
    }));
    await act(async () => mocks.confirm.mock.calls[0][0].onConfirm());
    expect(mocks.list.mock.calls.at(-1)?.[0].page).toBe(1);
    expect(document.body.textContent).toContain('remaining');
  });
});
