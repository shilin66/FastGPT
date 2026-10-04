import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import SandboxEditorModal from '@/pageComponents/chat/SandboxEditor/modal';
import type { IconButtonProps } from '@chakra-ui/react';
import { IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { checkSandboxExist } from './api';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { useContextSelector } from 'use-context-selector';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { addStatisticalDataToHistoryItem } from '@/global/core/chat/utils';
import { useSandboxFilePanel, useSandboxFilePanelOpener } from './PanelContext';
import { useLatest } from 'ahooks';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { SandboxToolIds } from '@fastgpt/global/core/workflow/node/agent/skillTools';
import {
  SANDBOX_GET_FILE_URL_TOOL_NAME,
  SANDBOX_TOOL_NAME
} from '@fastgpt/global/core/ai/sandbox/constants';

const fileToolNames = new Set<string>([
  SandboxToolIds.readFile,
  SandboxToolIds.writeFile,
  SandboxToolIds.editFile,
  SandboxToolIds.search,
  SandboxToolIds.fetchUserFile,
  SANDBOX_GET_FILE_URL_TOOL_NAME
]);
const workspaceToolNames = new Set<string>([
  ...fileToolNames,
  SandboxToolIds.execute,
  SANDBOX_TOOL_NAME
]);

export const useAutoOpenSandboxFiles = ({
  appId,
  chatId,
  enabled = true
}: {
  appId: string;
  chatId: string;
  enabled?: boolean;
}) => {
  const chatRecords = useContextSelector(ChatRecordContext, (value) => value.chatRecords);
  const isChatRecordsLoaded = useContextSelector(
    ChatRecordContext,
    (value) => value.isChatRecordsLoaded
  );
  const panel = useSandboxFilePanel();
  const tracker = useRef({
    scopeKey: '',
    initialized: false,
    hasUsedFile: false,
    seen: new Set<string>(),
    completed: new Set<string>(),
    pending: undefined as { key: string; sandboxId?: string } | undefined
  });
  const completedTurn = useRef({ scopeKey: '', dataId: '' });

  useEffect(() => {
    if (!enabled || !panel || !appId || !chatId) return;
    const scopeKey = `${appId}:${chatId}`;
    if (tracker.current.scopeKey !== scopeKey) {
      tracker.current = {
        scopeKey,
        initialized: false,
        hasUsedFile: false,
        seen: new Set<string>(),
        completed: new Set<string>(),
        pending: undefined
      };
    }
    if (!isChatRecordsLoaded) return;

    const toolUses = chatRecords.flatMap((record) => {
      if (record.obj !== ChatRoleEnum.AI) return [];
      const runtimeStatus = record.value.findLast((item) => item.sandboxEvent)?.sandboxEvent
        ?.status;
      const ready = record.sandboxPhase
        ? record.sandboxPhase === 'ready'
        : runtimeStatus === 'ready' || runtimeStatus === 'referenced';
      const failed = record.sandboxPhase
        ? record.sandboxPhase === 'failed'
        : runtimeStatus === 'failed';
      return record.value.flatMap((value, valueIndex) =>
        [...(value.tools ?? []), ...(value.tool ? [value.tool] : [])]
          .filter((tool) => workspaceToolNames.has(tool.functionName))
          .map((tool, toolIndex) => ({
            key: `${record.dataId}:${valueIndex}:${tool.id || toolIndex}:${tool.functionName}`,
            sandboxId: record.sandboxId,
            active: record.status !== ChatStatusEnum.finish,
            fileUse: fileToolNames.has(tool.functionName),
            completed: tool.response != null,
            ready,
            failed
          }))
      );
    });
    const fileUses = toolUses.filter((usage) => usage.fileUse);
    const state = tracker.current;
    // Fast Refresh can retain a ref created before completion tracking was added.
    state.completed ??= new Set<string>();
    const newUses = fileUses.filter((usage) => !state.seen.has(usage.key));
    const activeNewUse = newUses.find((usage) => usage.active);
    fileUses.forEach((usage) => state.seen.add(usage.key));

    const firstObservation = !state.initialized;
    const newCompletion =
      !firstObservation &&
      toolUses.some((usage) => usage.completed && !state.completed.has(usage.key));
    toolUses.forEach((usage) => {
      if (usage.completed) state.completed.add(usage.key);
    });
    if (firstObservation) {
      state.initialized = true;
      state.hasUsedFile = fileUses.length > 0;
    }
    const firstFileUse = firstObservation || !state.hasUsedFile;
    if (newUses.length) state.hasUsedFile = true;
    if (firstFileUse && activeNewUse && !panel.isOpen && !state.pending) {
      state.pending = { key: activeNewUse.key, sandboxId: activeNewUse.sandboxId };
    }

    if (panel.isOpen) state.pending = undefined;
    const pendingUse = fileUses.find((usage) => usage.key === state.pending?.key);
    if (
      state.pending &&
      (!pendingUse || pendingUse.failed || (!pendingUse.active && !pendingUse.ready))
    ) {
      state.pending = undefined;
      state.hasUsedFile = false;
    }
    if (state.pending && pendingUse?.ready && pendingUse.completed) {
      panel.open({ appId, chatId, sandboxId: state.pending.sandboxId }, { automatic: true });
      state.pending = undefined;
      return;
    }
    if (panel.isOpen && (newCompletion || activeNewUse)) panel.refresh();
  }, [appId, chatId, chatRecords, enabled, isChatRecordsLoaded, panel]);

  useEffect(() => {
    if (!enabled || !panel || !appId || !chatId || !isChatRecordsLoaded) return;
    const scopeKey = `${appId}:${chatId}`;
    const last = chatRecords[chatRecords.length - 1];
    const dataId =
      last?.obj === ChatRoleEnum.AI && last.status === ChatStatusEnum.finish ? last.dataId : '';
    if (completedTurn.current.scopeKey !== scopeKey) {
      completedTurn.current = { scopeKey, dataId };
      return;
    }
    if (dataId && completedTurn.current.dataId !== dataId) {
      completedTurn.current.dataId = dataId;
      if (panel.isOpen) panel.refresh();
    }
  }, [appId, chatId, chatRecords, enabled, isChatRecordsLoaded, panel]);
};

/**
 * useSandboxEditor —— UI Hook
 *
 * 职责：仅负责渲染 SandboxEditorModal 弹窗及其开关逻辑。
 */
export const useSandboxEditor = ({
  appId,
  chatId,
  sandboxId,
  outLinkAuthData,
  afterClose
}: {
  appId: string;
  chatId: string;
  sandboxId?: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  afterClose?: () => void;
}) => {
  const [sandboxModalOpen, setSandboxModalOpen] = useState(false);
  const openPanel = useSandboxFilePanelOpener();
  const [openedSandboxId, setOpenedSandboxId] = useState<string>();
  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const activeSandboxId = useMemo(
    () =>
      sandboxId ??
      chatRecords.map(addStatisticalDataToHistoryItem).findLast((record) => record.sandboxId)
        ?.sandboxId,
    [sandboxId, chatRecords]
  );

  const onOpenSandboxModal = useCallback(() => {
    if (openPanel) {
      openPanel({ appId, chatId, sandboxId: activeSandboxId, outLinkAuthData });
      return;
    }
    setOpenedSandboxId(activeSandboxId);
    setSandboxModalOpen(true);
  }, [activeSandboxId, appId, chatId, outLinkAuthData, openPanel]);

  const onCloseSandboxModal = useCallback(() => {
    setSandboxModalOpen(false);
    afterClose?.();
  }, [afterClose]);

  const SandboxEditorModalDom = useCallback(() => {
    if (openPanel) return null;
    return sandboxModalOpen ? (
      <SandboxEditorModal
        onClose={onCloseSandboxModal}
        appId={appId}
        chatId={chatId}
        sandboxId={openedSandboxId}
        outLinkAuthData={outLinkAuthData}
      />
    ) : null;
  }, [
    openPanel,
    sandboxModalOpen,
    onCloseSandboxModal,
    appId,
    chatId,
    openedSandboxId,
    outLinkAuthData
  ]);

  return {
    SandboxEditorModal: SandboxEditorModalDom,
    onOpenSandboxModal,
    onCloseSandboxModal
  };
};

/**
 * useSandboxStatus —— Status Hook
 *
 * 职责：负责 checkSandboxExist 的网络同步及 SandboxEntryIcon 的显示控制。
 * 同步模式：
 *   1. 历史记录（ChatRecordContext）：useMemo 派生，无副作用。
 *   2. chatId 切换：渲染周期利用 useRef 确认 ID 变化并同步重置状态，防止 UI 闪烁。
 *   3. 网络请求：单一 useEffect，在参数变化时触发 1 次。
 */
export const useSandboxStatus = ({
  appId,
  chatId,
  outLinkAuthData
}: {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
}) => {
  const { t } = useTranslation();
  const [apiSandboxExists, setApiSandboxExists] = useState(false);
  const scopeKey = JSON.stringify([appId, chatId, outLinkAuthData]);
  const outLinkAuthDataRef = useLatest(outLinkAuthData);
  const lastChatIdRef = useRef(scopeKey);

  if (lastChatIdRef.current !== scopeKey) {
    lastChatIdRef.current = scopeKey;
    setApiSandboxExists(false);
  }

  const chatRecords = useContextSelector(ChatRecordContext, (v) => {
    return v.chatRecords;
  });
  const isChatRecordsLoaded = useContextSelector(ChatRecordContext, (v) => v.isChatRecordsLoaded);

  const hasSandboxInHistory = useMemo(() => {
    if (!isChatRecordsLoaded) return false;
    return chatRecords.some((record) => {
      const enriched = addStatisticalDataToHistoryItem(record);
      return enriched.useAgentSandbox === true;
    });
  }, [chatRecords, isChatRecordsLoaded]);

  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    checkSandboxExist({ appId, chatId, outLinkAuthData: outLinkAuthDataRef.current ?? undefined })
      .then((result) => {
        if (!cancelled) setApiSandboxExists(result.exists);
      })
      .catch((error) => {
        console.error('Failed to check sandbox status:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [appId, chatId, scopeKey, outLinkAuthDataRef]);

  const sandboxExists = hasSandboxInHistory || apiSandboxExists;

  const SandboxEntryIcon = useCallback(
    ({
      onOpen,
      ...props
    }: Omit<IconButtonProps, 'name' | 'onClick' | 'aria-label'> & { onOpen: () => void }) => {
      if (!sandboxExists) return null;

      return (
        <MyTooltip label={t('chat:sandbox_entry_tooltip')}>
          <IconButton
            variant={'whiteBase'}
            size={'smSquare'}
            icon={<MyIcon name={'core/app/sandbox/file'} w={'16px'} />}
            onClick={onOpen}
            {...props}
            aria-label="Sandbox Entry"
          />
        </MyTooltip>
      );
    },
    [sandboxExists, t]
  );

  return {
    sandboxExists,
    setSandboxExists: setApiSandboxExists,
    SandboxEntryIcon
  };
};
