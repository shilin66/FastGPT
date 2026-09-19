import { useEffect, useState } from 'react';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useMemoizedFn } from 'ahooks';
import { useContextSelector } from 'use-context-selector';
import { streamFetch } from '@/web/common/api/fetch';
import {
  SKILL_DEBUG_CHAT_URL,
  delSkillDebugChatItem,
  getSkillDebugStatus
} from '@/web/core/skill/api';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import React from 'react';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import { SkillDetailContext } from '../context';
import { skillAttachmentConfig } from '@fastgpt/global/core/agentSkills/attachments';
import type { SkillDebugStatusResponse } from '@fastgpt/global/openapi/core/agentSkills/api';
import { useTranslation } from 'next-i18next';
import type { AgentModelParams } from '@fastgpt/global/core/ai/agent/modelParams';

export const useSkillChatTest = ({
  skillId,
  model,
  aiChatDefaultConfig,
  chatId,
  isReady
}: {
  skillId: string;
  model: string;
  aiChatDefaultConfig?: AgentModelParams;
  chatId: string;
  isReady: boolean;
}) => {
  const { t } = useTranslation();
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const { flushWorkspace, setChatRunning, setWorkspaceBusy, chatRunning, skillDetail } =
    useContextSelector(SkillDetailContext, (v) => v);
  const [runStatus, setRunStatus] = useState<SkillDebugStatusResponse['status']>('idle');
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setRunStatus('idle');
    const poll = async () => {
      try {
        const status = await getSkillDebugStatus({ skillId, chatId });
        if (active) {
          setRunStatus(status.status);
          setWorkspaceBusy(status.workspaceRunning);
        }
      } catch {
        /* Keep the last known busy state until the next authorized status read. */
      }
      if (active) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
      setWorkspaceBusy(false);
    };
  }, [skillId, chatId, setWorkspaceBusy]);
  const [chatError, setChatError] = useState('');
  useEffect(() => setChatError(''), [chatId]);

  const fileSelectConfig: AppFileSelectConfigType = {
    ...skillAttachmentConfig,
    maxFiles: 10,
    canSelectFile: true,
    canSelectImg: false,
    customPdfParse: 'default',
    canSelectVideo: false,
    canSelectAudio: false,
    canSelectCustomFileExtension: false,
    customFileExtensionList: []
  };

  // Set chat box data
  useEffect(() => {
    setChatBoxData({
      sourceType: 'skillEdit',
      appId: skillId,
      app: {
        chatConfig: { fileSelectConfig, welcomeText: t('skill:creation_chat_welcome') },
        name: skillDetail?.name || t('skill:creation_chat_title'),
        avatar: skillDetail?.avatar || '',
        type: AppTypeEnum.simple,
        pluginInputs: []
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillId, setChatBoxData, skillDetail?.name, skillDetail?.avatar, t]);

  const startChat = useMemoizedFn(
    async ({ messages, responseChatItemId, controller, generatingMessage }: StartChatFnProps) => {
      const histories = messages.slice(-1);
      setChatError('');
      try {
        await flushWorkspace();
        setChatRunning(true);
        const { responseText } = await streamFetch({
          url: SKILL_DEBUG_CHAT_URL,
          data: {
            skillId,
            chatId,
            messages: histories,
            model,
            aiChatDefaultConfig,
            responseChatItemId
          },
          onMessage: generatingMessage,
          abortCtrl: controller
        });

        return { responseText };
      } catch (error) {
        setChatError(getErrText(error));
        throw error;
      } finally {
        setChatRunning(false);
      }
    }
  );

  // 使用 skill 专属的删除接口，避免走 /api/core/chat/item/delete 时用 skillId 查 App 报错
  const handleDeleteChatItem = useMemoizedFn((contentId: string) =>
    delSkillDebugChatItem({ skillId, chatId, contentId })
  );

  const ChatContainer = (
    <ChatBox
      markReadEnabled={false}
      isReady={isReady && !chatRunning}
      appId={skillId}
      chatId={chatId}
      chatType={ChatTypeEnum.test}
      onStartChat={startChat}
      onDeleteChatItem={handleDeleteChatItem}
    />
  );

  return {
    ChatContainer,
    chatError,
    runStatus
  };
};
