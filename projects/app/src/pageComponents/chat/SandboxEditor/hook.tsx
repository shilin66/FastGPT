import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
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
    setOpenedSandboxId(activeSandboxId);
    setSandboxModalOpen(true);
  }, [activeSandboxId]);

  const onCloseSandboxModal = useCallback(() => {
    setSandboxModalOpen(false);
    afterClose?.();
  }, [afterClose]);

  const SandboxEditorModalDom = useCallback(() => {
    return sandboxModalOpen ? (
      <SandboxEditorModal
        onClose={onCloseSandboxModal}
        appId={appId}
        chatId={chatId}
        sandboxId={openedSandboxId}
        outLinkAuthData={outLinkAuthData}
      />
    ) : null;
  }, [sandboxModalOpen, onCloseSandboxModal, appId, chatId, openedSandboxId, outLinkAuthData]);

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
    checkSandboxExist({ appId, chatId, outLinkAuthData })
      .then((result) => {
        if (!cancelled) setApiSandboxExists(result.exists);
      })
      .catch((error) => {
        console.error('Failed to check sandbox status:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [appId, chatId, scopeKey]);

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
