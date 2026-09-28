import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GetSkillDetailResponseSchema,
  type GetSkillDetailResponse
} from '@fastgpt/global/openapi/core/agentSkills/api';
import type { SkillEditWorkspace } from '@fastgpt/global/core/agentSkills/workspace';
import type { streamCreateEditDebugSandbox } from '@/web/core/skill/api';
import {
  ManageRoleVal,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import {
  AgentSkillCreationStatusEnum,
  AgentSkillSourceEnum
} from '@fastgpt/global/core/agentSkills/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';

const mocks = vi.hoisted(() => ({
  t: (key: string) => key,
  router: {
    query: { skillId: '111111111111111111111111' },
    asPath: '/dashboard/skill/detail?skillId=111111111111111111111111',
    push: vi.fn(),
    replace: vi.fn()
  },
  getSkillDetail: vi.fn<() => Promise<GetSkillDetailResponse>>(),
  streamCreateEditDebugSandbox: vi.fn<typeof streamCreateEditDebugSandbox>(),
  postResetSkillWorkspace: vi.fn(async () => undefined),
  postSaveDeploySkill: vi.fn(async () => undefined),
  previewMounted: vi.fn(),
  toast: vi.fn()
}));

vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: mocks.t }),
  Trans: ({ values }: { values: { confirmText: string } }) => values.confirmText
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/web/core/skill/api', () => ({
  getSkillDetail: mocks.getSkillDetail,
  streamCreateEditDebugSandbox: mocks.streamCreateEditDebugSandbox,
  postResetSkillWorkspace: mocks.postResetSkillWorkspace,
  postSaveDeploySkill: mocks.postSaveDeploySkill,
  postSkillWorkspaceFiles: vi.fn(async () => ({ action: 'list', files: [], truncated: false })),
  postRetrySkillInitialization: vi.fn(),
  deleteSkill: vi.fn(),
  postUpdateSkill: vi.fn(),
  exportSkill: vi.fn(),
  resumeInheritPer: vi.fn(),
  postChangeSkillOwner: vi.fn()
}));
vi.mock('@/web/core/skill/collaborator', () => ({
  getSkillCollaboratorList: vi.fn(),
  postUpdateSkillCollaborators: vi.fn(),
  deleteSkillCollaborator: vi.fn()
}));
vi.mock('@chakra-ui/react', () => {
  const Box = ({ children, role }: { children?: React.ReactNode; role?: string }) =>
    React.createElement('div', { role }, children);
  const Button = ({
    children,
    onClick,
    isDisabled,
    isLoading,
    'aria-label': ariaLabel
  }: {
    children?: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    isDisabled?: boolean;
    isLoading?: boolean;
    'aria-label'?: string;
  }) =>
    React.createElement(
      'button',
      { onClick, disabled: isDisabled || isLoading, 'aria-label': ariaLabel },
      children
    );
  return {
    Box,
    Alert: Box,
    Flex: Box,
    HStack: Box,
    VStack: Box,
    Text: Box,
    Badge: Box,
    Portal: Box,
    Popover: ({ children }: { children: (props: { onClose: () => void }) => React.ReactNode }) =>
      children({ onClose: () => {} }),
    PopoverTrigger: Box,
    PopoverContent: () => null,
    ModalBody: Box,
    ModalFooter: Box,
    Button,
    IconButton: Button,
    Input: ({ value, onChange, placeholder }: React.InputHTMLAttributes<HTMLInputElement>) =>
      React.createElement('input', { value, onChange, placeholder }),
    useDisclosure: () => {
      const [isOpen, setIsOpen] = React.useState(false);
      return {
        isOpen,
        onOpen: React.useCallback(() => setIsOpen(true), []),
        onClose: React.useCallback(() => setIsOpen(false), [])
      };
    }
  };
});
vi.mock('@fastgpt/web/components/common/MyModal', () => ({
  default: ({
    isOpen,
    title,
    children
  }: {
    isOpen: boolean;
    title: string;
    children: React.ReactNode;
  }) =>
    isOpen ? React.createElement('div', { role: 'dialog', 'aria-label': title }, children) : null
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/pageComponents/dashboard/skill/detail/WorkspaceSplit', () => ({
  default: ({
    conversation,
    children
  }: {
    conversation?: React.ReactNode;
    children: React.ReactNode;
  }) => React.createElement(React.Fragment, null, conversation, children)
}));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyMenu', () => ({
  default: ({ Button }: { Button: React.ReactNode }) => Button
}));
vi.mock('@/pageComponents/dashboard/skill/detail/config/BuildingAnimation', () => ({
  default: () => null
}));
vi.mock('@/pageComponents/dashboard/skill/detail/config/SandboxTerminal', () => ({
  default: () => null
}));
vi.mock('@/pageComponents/dashboard/skill/detail/config/SkillHistoriesSlider', () => ({
  default: () => null
}));
vi.mock('@/pageComponents/dashboard/skill/detail/preview/SkillPreview', () => ({
  default: () => {
    React.useEffect(() => {
      mocks.previewMounted();
    }, []);
    return null;
  }
}));

import SkillDetailContextProvider from '@/pageComponents/dashboard/skill/detail/context';
import Content from '@/pageComponents/dashboard/skill/detail/Content';
import Header from '@/pageComponents/dashboard/skill/detail/Header';

describe('Skill workspace permission, confirmation and generation UI', () => {
  let root: Root;
  let container: HTMLDivElement;
  let detail: GetSkillDetailResponse;
  const initialWorkspace = (): SkillEditWorkspace => ({
    status: SandboxStatusEnum.running,
    sandboxId: 'logical-sandbox',
    generation: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    baseVersionId: '222222222222222222222222',
    currentVersionId: '222222222222222222222222',
    stale: false,
    resetAvailable: true,
    operation: {
      id: 'operation-original',
      type: 'initialize',
      checkpoint: 'ready',
      updatedAt: '2026-09-13T00:00:00.000Z'
    }
  });
  const editor = () =>
    container.querySelector<HTMLIFrameElement>('iframe[title="Skill workspace editor"]');
  const button = (text: string, scope: ParentNode = container) => {
    const result = [...scope.querySelectorAll('button')].find((item) => item.textContent === text);
    if (!result) throw new Error(`Button not found: ${text}`);
    return result;
  };
  const dialog = () => {
    const result = container.querySelector<HTMLElement>('[role="dialog"]');
    if (!result) throw new Error('Confirmation dialog is missing');
    return result;
  };
  const click = async (target: HTMLElement) => act(async () => target.click());
  const mount = async () =>
    act(async () =>
      root.render(
        React.createElement(
          SkillDetailContextProvider,
          null,
          React.createElement(Header),
          React.createElement(Content)
        )
      )
    );
  const ready = async () => {
    const stream = mocks.streamCreateEditDebugSandbox.mock.calls.at(-1)?.[0];
    if (!stream) throw new Error('Editor stream was not started');
    await act(async () =>
      stream.onStatus({
        sandboxId: mocks.router.query.skillId,
        phase: 'ready',
        providerSandboxId: 'provider-sandbox',
        endpoint: {
          host: 'sandbox.invalid',
          port: 8090,
          protocol: 'http',
          url: 'http://sandbox.invalid:8090'
        }
      })
    );
    await visitEditor();
  };
  const refresh = async (workspace: Partial<SkillEditWorkspace>) => {
    detail = { ...detail, workspace: { ...initialWorkspace(), ...detail.workspace, ...workspace } };
    await act(async () => window.dispatchEvent(new Event('focus')));
  };
  const enterConfirmation = async (value: string) => {
    const input = dialog().querySelector('input');
    if (!input) throw new Error('Name confirmation input is missing');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const visitEditor = async () => {
    await click(button('skill:detail_tab_ide'));
    expect(editor()).not.toBeNull();
    await click(button('skill:detail_tab_conversation'));
    await click(button('common:Confirm', dialog()));
  };

  it.each(['absent', 'provisioning', 'failed'] as const)(
    'does not claim a preserved draft before the %s workspace is initialized',
    async (status) => {
      detail.workspace = { ...initialWorkspace(), status, baseVersionId: null, stale: false };
      await mount();
      const message = container.querySelector('[role="status"]')?.textContent;
      expect(message).toContain('skill:workspace_not_ready');
      expect(message).not.toContain('skill:workspace_preserved');
    }
  );

  it('prioritizes a failed workspace over a stale draft hint', async () => {
    detail.workspace = { ...initialWorkspace(), status: SandboxStatusEnum.failed, stale: true };
    await mount();
    const message = container.querySelector('[role="status"]')?.textContent;
    expect(message).toContain('skill:workspace_not_ready');
    expect(message).not.toContain('skill:workspace_stale');
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.router.query.skillId = '111111111111111111111111';
    detail = {
      _id: mocks.router.query.skillId,
      source: AgentSkillSourceEnum.personal,
      name: 'Workspace demo',
      description: 'Demo',
      author: 'Author',
      category: [],
      config: {},
      createTime: '2026-09-13T00:00:00.000Z',
      updateTime: '2026-09-13T00:00:00.000Z',
      permission: ManageRoleVal,
      creationStatus: AgentSkillCreationStatusEnum.ready,
      workspace: initialWorkspace()
    };
    mocks.getSkillDetail.mockImplementation(async () => GetSkillDetailResponseSchema.parse(detail));
    mocks.streamCreateEditDebugSandbox.mockResolvedValue(undefined);
    mocks.postResetSkillWorkspace.mockResolvedValue(undefined);
    mocks.postSaveDeploySkill.mockResolvedValue(undefined);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('does not start or display an editor for Read permission and disables Save', async () => {
    detail = { ...detail, permission: ReadRoleVal, workspace: undefined };
    await mount();
    expect(mocks.streamCreateEditDebugSandbox).not.toHaveBeenCalled();
    expect(editor()).toBeNull();
    expect(container.textContent).toContain('skill:workspace_read_only');
    expect(container.textContent).not.toContain('skill:workspace_reset');
    expect(button('common:Save').disabled).toBe(true);
  });

  it('does not classify a pending detail request as read-only or mount preview before permission resolves', async () => {
    let deliver: (value: GetSkillDetailResponse) => void = () => {
      throw new Error('Detail request was not initialized');
    };
    const pending = new Promise<GetSkillDetailResponse>((resolve) => {
      deliver = resolve;
    });
    mocks.getSkillDetail.mockReturnValueOnce(pending);
    await mount();
    expect(mocks.getSkillDetail).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('skill:workspace_read_only');
    expect(container.textContent).toContain('common:Loading');
    expect(mocks.previewMounted).not.toHaveBeenCalled();
    expect(mocks.streamCreateEditDebugSandbox).not.toHaveBeenCalled();
    await act(async () => deliver(GetSkillDetailResponseSchema.parse(detail)));
    expect(mocks.streamCreateEditDebugSandbox).toHaveBeenCalledTimes(1);
  });

  it('does not present a failed detail request as Read permission or mount preview', async () => {
    mocks.getSkillDetail.mockRejectedValueOnce(new Error('detail request returned 400'));
    await mount();
    expect(mocks.getSkillDetail).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('skill:workspace_read_only');
    expect(mocks.previewMounted).not.toHaveBeenCalled();
    expect(mocks.streamCreateEditDebugSandbox).not.toHaveBeenCalled();
    expect(editor()).toBeNull();
    expect(container.textContent).toContain('skill:workspace_detail_failed');
    await click(button('skill:sandbox_retry'));
    expect(mocks.getSkillDetail).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain('skill:workspace_detail_failed');
    expect(mocks.streamCreateEditDebugSandbox).toHaveBeenCalledTimes(1);
  });

  it('does not mount the write-only preview for a Read user even in a hidden tab', async () => {
    detail = { ...detail, permission: ReadRoleVal, workspace: undefined };
    await mount();
    expect(container.textContent).toContain('skill:workspace_read_only');
    expect(mocks.previewMounted).not.toHaveBeenCalled();
  });

  it('waits for the route Skill ID before loading detail without showing a read-only message', async () => {
    mocks.router.query.skillId = '';
    await mount();
    expect(mocks.getSkillDetail).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('skill:workspace_read_only');
    expect(mocks.previewMounted).not.toHaveBeenCalled();
    mocks.router.query.skillId = detail._id;
    await mount();
    expect(mocks.getSkillDetail).toHaveBeenCalledTimes(1);
  });

  it('allows a writer to edit and publish with CAS but does not expose reset', async () => {
    detail = { ...detail, permission: WriteRoleVal };
    await mount();
    await ready();
    expect(mocks.previewMounted).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('skill:workspace_reset');
    await click(button('common:Save'));
    expect(mocks.postSaveDeploySkill).toHaveBeenCalledWith({
      skillId: detail._id,
      expectedCurrentVersionId: '222222222222222222222222',
      expectedBaseVersionId: '222222222222222222222222'
    });
  });

  it.each(['focus', 'poll'] as const)(
    'finishes the ready handshake when %s refresh overlaps the workspace read',
    async (refreshSource) => {
      await mount();
      let deliver: (value: GetSkillDetailResponse) => void = () => {
        throw new Error('Ready detail request was not initialized');
      };
      mocks.getSkillDetail.mockReturnValueOnce(
        new Promise<GetSkillDetailResponse>((resolve) => {
          deliver = resolve;
        })
      );
      const stream = mocks.streamCreateEditDebugSandbox.mock.calls[0][0];
      await act(async () =>
        stream.onStatus({
          sandboxId: detail._id,
          phase: 'ready',
          providerSandboxId: 'provider-sandbox',
          endpoint: {
            host: 'sandbox.invalid',
            port: 8090,
            protocol: 'http',
            url: 'http://sandbox.invalid:8090'
          }
        })
      );
      expect(editor()).toBeNull();
      await act(async () => {
        if (refreshSource === 'focus') window.dispatchEvent(new Event('focus'));
        else vi.advanceTimersByTime(20000);
      });
      detail.workspace = {
        ...initialWorkspace(),
        generation: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      };
      await act(async () => deliver(GetSkillDetailResponseSchema.parse(detail)));
      await visitEditor();
      expect(editor()?.src).toContain(
        'expectedWorkspaceGeneration=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      );
      const original = editor();
      const previousReads = mocks.getSkillDetail.mock.calls.length;
      await refresh({ stale: true });
      expect(mocks.getSkillDetail.mock.calls.length).toBeGreaterThan(previousReads);
      expect(editor()).toBe(original);
      expect(mocks.streamCreateEditDebugSandbox).toHaveBeenCalledTimes(1);
      expect(mocks.postResetSkillWorkspace).not.toHaveBeenCalled();
    }
  );

  it('opens a name confirmation before reset and cancelling preserves the mounted editor', async () => {
    await mount();
    await ready();
    const original = editor();
    await click(button('skill:workspace_reset'));
    expect(mocks.postResetSkillWorkspace).not.toHaveBeenCalled();
    expect(dialog().textContent).toContain('skill:workspace_reset_confirm');
    expect(button('common:Confirm', dialog()).disabled).toBe(true);
    await enterConfirmation('wrong name');
    expect(button('common:Confirm', dialog()).disabled).toBe(true);
    await click(button('common:Cancel', dialog()));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocks.postResetSkillWorkspace).not.toHaveBeenCalled();
    expect(editor()).toBe(original);
  });

  it('reads fresh detail after reset instead of sharing the pre-reset ready request', async () => {
    await mount();
    let rejectOldRead: (error: Error) => void = () => {};
    mocks.getSkillDetail.mockReturnValueOnce(
      new Promise<GetSkillDetailResponse>((_, reject) => {
        rejectOldRead = reject;
      })
    );
    const stream = mocks.streamCreateEditDebugSandbox.mock.calls[0][0];
    await act(async () =>
      stream.onStatus({
        sandboxId: detail._id,
        phase: 'ready',
        providerSandboxId: 'provider-sandbox',
        endpoint: {
          host: 'sandbox.invalid',
          port: 8090,
          protocol: 'http',
          url: 'http://sandbox.invalid:8090'
        }
      })
    );
    await click(button('skill:workspace_reset'));
    await enterConfirmation(detail.name);
    await click(button('common:Confirm', dialog()));
    await act(async () => rejectOldRead(new Error('pre-reset detail failed')));
    expect(mocks.postResetSkillWorkspace).toHaveBeenCalledTimes(1);
    expect(stream.abortCtrl.signal.aborted).toBe(true);
    expect(editor()).toBeNull();
    expect(container.textContent).toContain('skill:workspace_reopen');
    expect(container.textContent).not.toContain('pre-reset detail failed');
  });

  it('shows a ready detail error despite an overlapping refresh and allows subsequent refreshes', async () => {
    await mount();
    let rejectRead: (error: Error) => void = () => {};
    mocks.getSkillDetail.mockReturnValueOnce(
      new Promise<GetSkillDetailResponse>((_, reject) => {
        rejectRead = reject;
      })
    );
    const stream = mocks.streamCreateEditDebugSandbox.mock.calls[0][0];
    await act(async () =>
      stream.onStatus({
        sandboxId: detail._id,
        phase: 'ready',
        providerSandboxId: 'provider-sandbox',
        endpoint: {
          host: 'sandbox.invalid',
          port: 8090,
          protocol: 'http',
          url: 'http://sandbox.invalid:8090'
        }
      })
    );
    await refresh({});
    await act(async () => rejectRead(new Error('ready detail unavailable')));
    expect(editor()).toBeNull();
    expect(container.textContent).toContain('ready detail unavailable');
    const previousReads = mocks.getSkillDetail.mock.calls.length;
    await refresh({});
    expect(mocks.getSkillDetail.mock.calls.length).toBeGreaterThan(previousReads);
    expect(mocks.postResetSkillWorkspace).not.toHaveBeenCalled();
  });

  it('keeps the originally confirmed workspace versions and operation when detail refreshes', async () => {
    await mount();
    await ready();
    await click(button('skill:workspace_reset'));
    await enterConfirmation(detail.name);
    expect(button('common:Confirm', dialog()).disabled).toBe(false);
    await refresh({
      currentVersionId: '333333333333333333333333',
      baseVersionId: '444444444444444444444444',
      stale: true,
      operation: { ...initialWorkspace().operation!, id: 'operation-new' }
    });
    await click(button('common:Confirm', dialog()));
    expect(mocks.postResetSkillWorkspace).toHaveBeenCalledExactlyOnceWith({
      skillId: detail._id,
      expectedCurrentVersionId: '222222222222222222222222',
      expectedBaseVersionId: '222222222222222222222222',
      expectedOperationId: 'operation-original',
      confirmDiscard: true
    });
    expect(editor()).toBeNull();
    expect(container.textContent).toContain('skill:workspace_reopen');
    expect(mocks.streamCreateEditDebugSandbox).toHaveBeenCalledTimes(1);
  });

  it('disables reset while infrastructure reports recovery is required', async () => {
    detail.workspace = {
      ...initialWorkspace(),
      resetAvailable: false,
      resetUnavailableReason: 'recovery_required'
    };
    await mount();
    await ready();
    expect(button('skill:workspace_reset').disabled).toBe(true);
    await click(button('skill:workspace_reset'));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocks.postResetSkillWorkspace).not.toHaveBeenCalled();
  });

  it.each([
    ['sandbox_unavailable', 'skill:workspace_unavailable'],
    ['workspace_recovery_required', 'skill:workspace_recovery_required']
  ])('shows an actionable translated message for %s', async (code, message) => {
    await mount();
    const stream = mocks.streamCreateEditDebugSandbox.mock.calls[0][0];
    await act(async () => stream.onError(code));
    expect(container.textContent).toContain(message);
  });

  it('blocks ensure and error retry when an operation has an unknown outcome, including after polling', async () => {
    detail.workspace = {
      ...initialWorkspace(),
      status: SandboxStatusEnum.failed,
      resetAvailable: false,
      resetUnavailableReason: 'recovery_required',
      operation: { ...initialWorkspace().operation!, failureDisposition: 'unknown' }
    };
    await mount();
    expect(container.textContent).toContain('skill:workspace_recovery_required');
    expect(mocks.streamCreateEditDebugSandbox).not.toHaveBeenCalled();
    const retry = button('skill:sandbox_retry');
    expect(retry.disabled).toBe(true);
    await click(retry);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      vi.advanceTimersByTime(20000);
    });
    expect(mocks.getSkillDetail.mock.calls.length).toBeGreaterThan(1);
    expect(mocks.streamCreateEditDebugSandbox).not.toHaveBeenCalled();
  });

  it('shows a stale baseline without reloading the editor or restarting the stream', async () => {
    await mount();
    await ready();
    const original = editor();
    const originalSrc = original?.src;
    await refresh({ currentVersionId: '333333333333333333333333', stale: true });
    expect(container.textContent).toContain('skill:workspace_stale');
    expect(editor()).toBe(original);
    expect(editor()?.src).toBe(originalSrc);
    expect(mocks.streamCreateEditDebugSandbox).toHaveBeenCalledTimes(1);
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('requires stale publish confirmation and retains the CAS snapshot from opening it', async () => {
    detail.workspace = {
      ...initialWorkspace(),
      currentVersionId: '333333333333333333333333',
      stale: true
    };
    await mount();
    await ready();
    await click(button('common:Save'));
    expect(mocks.postSaveDeploySkill).not.toHaveBeenCalled();
    expect(dialog().textContent).toContain('skill:workspace_stale_publish_confirm');
    await refresh({ currentVersionId: '444444444444444444444444' });
    await click(button('common:Confirm', dialog()));
    expect(mocks.postSaveDeploySkill).toHaveBeenCalledExactlyOnceWith({
      skillId: detail._id,
      expectedCurrentVersionId: '333333333333333333333333',
      expectedBaseVersionId: '222222222222222222222222'
    });
  });

  it('refreshes a failed publish without replacing the editor or leaving an unhandled rejection', async () => {
    await mount();
    await ready();
    const original = editor();
    const previousReads = mocks.getSkillDetail.mock.calls.length;
    mocks.postSaveDeploySkill.mockRejectedValueOnce(new Error('version conflict'));
    await click(button('common:Save'));
    expect(mocks.getSkillDetail.mock.calls.length).toBeGreaterThan(previousReads);
    expect(editor()).toBe(original);
    expect(mocks.streamCreateEditDebugSandbox).toHaveBeenCalledTimes(1);
  });

  it('closes a replaced generation and only reopens it after the user clicks reopen', async () => {
    await mount();
    await ready();
    const oldStream = mocks.streamCreateEditDebugSandbox.mock.calls[0][0];
    const originalSrc = editor()?.src;
    await refresh({ generation: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
    expect(editor()).toBeNull();
    expect(oldStream.abortCtrl.signal.aborted).toBe(true);
    expect(container.textContent).toContain('skill:workspace_replaced');
    expect(mocks.streamCreateEditDebugSandbox).toHaveBeenCalledTimes(1);
    await click(button('skill:workspace_reopen'));
    expect(mocks.streamCreateEditDebugSandbox).toHaveBeenCalledTimes(2);
    await ready();
    expect(editor()?.src).not.toBe(originalSrc);
    expect(editor()?.src).toContain(
      'expectedWorkspaceGeneration=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    );
  });

  it('aborts the stream and removes polling and focus refreshes on unmount', async () => {
    await mount();
    await ready();
    const stream = mocks.streamCreateEditDebugSandbox.mock.calls[0][0];
    const previousReads = mocks.getSkillDetail.mock.calls.length;
    await act(async () => root.render(null));
    await act(async () => {
      vi.advanceTimersByTime(30000);
      window.dispatchEvent(new Event('focus'));
    });
    expect(stream.abortCtrl.signal.aborted).toBe(true);
    expect(container.children).toHaveLength(0);
    expect(mocks.getSkillDetail).toHaveBeenCalledTimes(previousReads);
  });
});
