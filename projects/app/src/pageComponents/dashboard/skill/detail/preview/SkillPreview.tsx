import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AlertIcon, Box, Flex, IconButton, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext } from '../context';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ChatItemContextProvider from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import { useSkillChatTest } from './useSkillChatTest';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getSkillDebugRecords } from '@/web/core/skill/api';
import type { LinkedPaginationProps } from '@fastgpt/global/openapi/api';
import type { GetPaginationRecordsBodyType } from '@fastgpt/global/openapi/core/chat/record/api';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { workspaceLayout } from '../workspaceLayout';
import AISettingModal from '@/components/core/ai/AISettingModal';
import { useLocalStorageState } from 'ahooks';
import { z } from 'zod';
import {
  AgentModelParamsSchema,
  type AgentModelParams
} from '@fastgpt/global/core/ai/agent/modelParams';

const SkillPreview = ({ chatId, restartChat }: { chatId: string; restartChat: () => void }) => {
  const { t } = useTranslation();
  const { skillId, sandboxState, chatRunning, currentTab, skillDetail } = useContextSelector(
    SkillDetailContext,
    (v) => v
  );

  const { llmModelList } = useSystemStore();
  const [showModelSettings, setShowModelSettings] = useState(false);
  const [modelParams = {}, setModelParams] = useLocalStorageState<
    Record<string, AgentModelParams | undefined>
  >(`skill_debug_model_params_${skillId}`, {
    defaultValue: {},
    deserializer: (value) => z.record(z.string(), AgentModelParamsSchema).parse(JSON.parse(value))
  });
  const [selectedModel, setSelectedModel] = useState(() => {
    const cached = localStorage.getItem(`skill_debug_model_${skillId}`);
    return (
      llmModelList.find((model) => model.model === cached)?.model || llmModelList[0]?.model || ''
    );
  });
  useEffect(() => {
    if (!llmModelList.length) return;
    if (!llmModelList.some((model) => model.model === selectedModel)) {
      const cached = localStorage.getItem(`skill_debug_model_${skillId}`);
      setSelectedModel(
        llmModelList.find((model) => model.model === cached)?.model || llmModelList[0].model
      );
      return;
    }
    localStorage.setItem(`skill_debug_model_${skillId}`, selectedModel);
  }, [skillId, selectedModel, llmModelList]);

  const modelSelectList = useMemo(
    () => llmModelList.map((item) => ({ label: item.name, value: item.model })),
    [llmModelList]
  );

  const isReady =
    sandboxState === 'ready' &&
    skillDetail?.workspace?.status === 'running' &&
    currentTab === 'config';
  const aiChatDefaultConfig = Object.hasOwn(modelParams, selectedModel)
    ? modelParams[selectedModel]
    : undefined;

  const { ChatContainer, chatError, runStatus } = useSkillChatTest({
    skillId,
    model: selectedModel,
    aiChatDefaultConfig,
    chatId,
    isReady
  });

  return (
    <Flex h={'100%'} direction={'column'} minH={0}>
      {/* Header */}
      <Flex
        px={4}
        h={workspaceLayout.headerHeight}
        borderBottomWidth="1px"
        borderColor="myGray.200"
        flexShrink={0}
        align="center"
        gap={2}
      >
        <MyIcon name="codeCopilot" w="18px" color="primary.500" aria-hidden />
        <Text fontSize="sm" fontWeight="600" color="myGray.900" flexShrink={0}>
          {t('skill:creation_chat_title')}
        </Text>
        <Flex minW={0} gap={1.5} align="center" role="status" fontSize="xs" color="myGray.500">
          <Box
            w="6px"
            h="6px"
            borderRadius="full"
            bg={chatRunning ? 'primary.500' : 'myGray.400'}
            flexShrink={0}
            aria-hidden
          />
          <Text isTruncated title={t(`skill:chat_run_${chatRunning ? 'running' : runStatus}`)}>
            {t(`skill:chat_run_${chatRunning ? 'running' : runStatus}`)}
          </Text>
        </Flex>
        <MyTooltip label={t('skill:creation_chat_hint')} shouldWrapChildren={false}>
          <IconButton
            ml="auto"
            size="xs"
            variant="ghost"
            aria-label={t('skill:creation_chat_hint')}
            icon={<MyIcon name="common/info" w="16px" />}
          />
        </MyTooltip>
      </Flex>
      <Flex
        px={4}
        h={workspaceLayout.toolbarHeight}
        flexShrink={0}
        borderBottomWidth="1px"
        borderColor="myGray.200"
        bg="myGray.25"
        alignItems="center"
        gap={2}
      >
        <Box flex="0 1 240px" minW={0}>
          <AIModelSelector
            isDisabled={chatRunning}
            w="100%"
            h="32px"
            size={'sm'}
            value={selectedModel}
            list={modelSelectList}
            onChange={(val) => setSelectedModel(val)}
          />
        </Box>
        <MyTooltip label={t('app:config_ai_model_params')} shouldWrapChildren={false}>
          <IconButton
            w="32px"
            h="32px"
            minW="32px"
            variant="whiteBase"
            aria-label={t('app:config_ai_model_params')}
            icon={<MyIcon name="common/settingLight" w="16px" />}
            isDisabled={chatRunning || !selectedModel}
            onClick={() => setShowModelSettings(true)}
          />
        </MyTooltip>
        <IconButton
          w={'32px'}
          h={'32px'}
          minW={'32px'}
          icon={<MyIcon name={'common/clearLight'} w={'14px'} />}
          variant={'whiteDanger'}
          borderRadius={'md'}
          aria-label={t('skill:new_conversation')}
          title={t('skill:new_conversation')}
          isDisabled={chatRunning}
          ml="auto"
          onClick={(e) => {
            e.stopPropagation();
            restartChat();
          }}
        />
      </Flex>
      {showModelSettings && !chatRunning && (
        <AISettingModal
          defaultData={{ model: selectedModel, aiChatDefaultConfig }}
          llmModels={llmModelList}
          showMaxToken={false}
          showTemperature={false}
          showTopP={false}
          showStopSign={false}
          showResponseFormat={false}
          showReasoning={false}
          validateDefaultConfig={(value) =>
            AgentModelParamsSchema.safeParse(value).success
              ? undefined
              : t('skill:model_params_invalid')
          }
          onClose={() => setShowModelSettings(false)}
          onSuccess={(data) => {
            if (chatRunning) return;
            const params = AgentModelParamsSchema.optional().parse(data.aiChatDefaultConfig);
            setModelParams((previous) => ({ ...previous, [data.model]: params }));
            setSelectedModel(data.model);
            setShowModelSettings(false);
          }}
        />
      )}

      {/* Chat area */}
      {chatError && (
        <Alert status="error" mb={2} fontSize="sm" maxH="120px" overflowY="auto">
          <AlertIcon />
          <Box whiteSpace="pre-wrap" wordBreak="break-word">
            {chatError}
          </Box>
        </Alert>
      )}
      <Box flex={1} minH={0} overflow={'hidden'}>
        {ChatContainer}
      </Box>
    </Flex>
  );
};

const CHAT_ID_STORAGE_KEY = (skillId: string) => `skill_debug_chatId_${skillId}`;

const Render = () => {
  const { skillId } = useContextSelector(SkillDetailContext, (v) => v);
  const [chatId, setChatId] = useState(() => {
    const stored = localStorage.getItem(CHAT_ID_STORAGE_KEY(skillId));
    if (stored) return stored;
    const newId = getNanoid(24);
    localStorage.setItem(CHAT_ID_STORAGE_KEY(skillId), newId);
    return newId;
  });

  const chatRecordProviderParams = useMemo(
    () => ({
      appId: skillId,
      chatId
    }),
    [skillId, chatId]
  );

  const restartChat = useCallback(() => {
    const newId = getNanoid(24);
    localStorage.setItem(CHAT_ID_STORAGE_KEY(skillId), newId);
    setChatId(newId);
  }, [skillId]);

  const skillFetchFn = useCallback(
    (data: LinkedPaginationProps<GetPaginationRecordsBodyType>) =>
      getSkillDebugRecords({
        skillId,
        chatId: data.chatId!,
        pageSize: data.pageSize,
        initialId: data.initialId,
        nextId: data.nextId,
        prevId: data.prevId
      }),
    [skillId]
  );

  return (
    <ChatItemContextProvider
      showRouteToDatasetDetail={false}
      canDownloadSource={false}
      isShowCite={false}
      isShowFullText={false}
      showRunningStatus={true}
      showSkillReferences={true}
      showWholeResponse={false}
      showAvatar={false}
    >
      <ChatRecordContextProvider params={chatRecordProviderParams} fetchFn={skillFetchFn}>
        <SkillPreview chatId={chatId} restartChat={restartChat} />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};

export default React.memo(Render);
