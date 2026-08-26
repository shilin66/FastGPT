import { Box, Flex, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useMemo } from 'react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';

import { useSafeState } from 'ahooks';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../context';
import { useChatTest } from '../../useChatTest';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import MyBox from '@fastgpt/web/components/common/MyBox';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import VariablePopover from '@/components/core/chat/ChatContainer/components/VariablePopover';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import type { Form2WorkflowFnType } from '../FormComponent/type';
import { useSandboxEditor, useSandboxStatus } from '@/pageComponents/chat/SandboxEditor/hook';
import { getWebLLMModel } from '@/web/common/system/utils';

type Props = {
  appForm: AppFormEditFormType;
  setRenderEdit: React.Dispatch<React.SetStateAction<boolean>>;
  form2WorkflowFn: Form2WorkflowFnType;
};
const SummaryChip = ({
  label,
  tone = 'blue'
}: {
  label: React.ReactNode;
  tone?: 'blue' | 'gray';
}) => (
  <Flex
    alignItems={'center'}
    h={'24px'}
    px={2}
    borderRadius={'6px'}
    bg={tone === 'gray' ? '#F1F5F9' : '#EEF4FF'}
    color={tone === 'gray' ? '#64748B' : '#2563EB'}
    fontSize={'11px'}
    fontWeight={700}
    whiteSpace={'nowrap'}
  >
    {label}
  </Flex>
);

const ChatTest = ({ appForm, setRenderEdit, form2WorkflowFn }: Props) => {
  const { t } = useTranslation();
  const { chatId } = useChatStore();

  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);
  // agentForm2AppWorkflow dependent allDatasets
  const isVariableVisible = useContextSelector(ChatItemContext, (v) => v.isVariableVisible);

  const [workflowData, setWorkflowData] = useSafeState({
    nodes: appDetail.modules || [],
    edges: appDetail.edges || []
  });

  // Sandbox: Status Hook 负责网络同步，UI Hook 负责弹窗渲染
  const { SandboxEntryIcon, setSandboxExists } = useSandboxStatus({
    appId: appDetail._id,
    chatId
  });
  const { SandboxEditorModal, onOpenSandboxModal } = useSandboxEditor({
    appId: appDetail._id,
    chatId
  });

  useEffect(() => {
    const { nodes, edges } = form2WorkflowFn(appForm, t);
    setWorkflowData({ nodes, edges });
  }, [appForm, form2WorkflowFn, setWorkflowData, t]);

  useEffect(() => {
    setRenderEdit(!datasetCiteData);
  }, [datasetCiteData, setRenderEdit]);

  const { ChatContainer, restartChat } = useChatTest({
    ...workflowData,
    chatConfig: appForm.chatConfig,
    isReady: true
  });

  const debugSummary = useMemo(() => {
    const selectedModel = getWebLLMModel(appForm.aiSettings.model);
    const fileConfig = appForm.chatConfig.fileSelectConfig;
    const fileAbilities = [
      fileConfig?.canSelectFile ? t('app:agent_debug_file_document') : '',
      fileConfig?.canSelectImg ? t('app:agent_debug_file_image') : '',
      fileConfig?.canSelectAudio ? t('app:agent_debug_file_audio') : '',
      fileConfig?.canSelectVideo ? t('app:agent_debug_file_video') : '',
      fileConfig?.canSelectCustomFileExtension ? t('app:agent_debug_file_custom') : ''
    ].filter(Boolean);

    return {
      modelName: selectedModel?.name || appForm.aiSettings.model || '-',
      datasetCount: appForm.dataset.datasets?.length || 0,
      toolCount: appForm.selectedTools?.length || 0,
      variableCount: appForm.chatConfig.variables?.length || 0,
      fileAbilities,
      sandboxEnabled: !!appForm.aiSettings.useAgentSandbox
    };
  }, [appForm, t]);

  return (
    <Flex h={'full'} gap={0} bg={'white'} overflow={'hidden'}>
      <MyBox
        flex={'1 0 0'}
        w={0}
        display={'flex'}
        position={'relative'}
        flexDirection={'column'}
        h={'full'}
        py={0}
        bg={'white'}
        border={0}
        borderRadius={0}
        boxShadow={'none'}
        overflow={'hidden'}
      >
        <Flex
          px={4}
          py={0}
          minH={'48px'}
          alignItems={'center'}
          borderBottom={'1px solid'}
          borderColor={'#DFE5EE'}
        >
          <Box fontSize={['md', 'lg']} fontWeight={'bold'} color={'myGray.900'} mr={3}>
            {t('app:chat_debug')}
          </Box>
          {!isVariableVisible && <VariablePopover chatType={ChatTypeEnum.test} />}
          <Box flex={1} />

          <SandboxEntryIcon size={'smSquare'} mr={2} onOpen={onOpenSandboxModal} />
          <MyTooltip label={t('common:core.chat.Restart')}>
            <IconButton
              className="chat"
              size={'smSquare'}
              icon={<MyIcon name={'common/clearLight'} w={'14px'} />}
              variant={'whiteDanger'}
              borderRadius={'md'}
              aria-label={'delete'}
              onClick={(e) => {
                e.stopPropagation();
                restartChat();
                setSandboxExists(false);
              }}
            />
          </MyTooltip>
        </Flex>
        <Flex
          px={4}
          py={1.5}
          minH={'38px'}
          gap={2}
          alignItems={'center'}
          flexWrap={'wrap'}
          borderBottom={'1px solid'}
          borderColor={'#DFE5EE'}
          bg={'#F8FAFC'}
        >
          <SummaryChip label={t('app:agent_debug_model', { value: debugSummary.modelName })} />
          <SummaryChip label={t('app:agent_debug_dataset', { value: debugSummary.datasetCount })} />
          <SummaryChip label={t('app:agent_debug_tool', { value: debugSummary.toolCount })} />
          {!!debugSummary.variableCount && (
            <SummaryChip
              label={t('app:agent_debug_variable', { value: debugSummary.variableCount })}
            />
          )}
          <SummaryChip
            label={
              debugSummary.fileAbilities.length
                ? t('app:agent_debug_file', {
                    value: debugSummary.fileAbilities.join(' / ')
                  })
                : t('app:agent_debug_file_off')
            }
            tone={debugSummary.fileAbilities.length ? 'blue' : 'gray'}
          />
          <SummaryChip
            label={
              debugSummary.sandboxEnabled
                ? t('app:agent_debug_sandbox_on')
                : t('app:agent_debug_sandbox_off')
            }
            tone={debugSummary.sandboxEnabled ? 'blue' : 'gray'}
          />
        </Flex>
        <Box flex={1} minH={0}>
          <ChatContainer />
        </Box>
      </MyBox>
      {datasetCiteData && (
        <Box
          flex={'1 0 0'}
          w={0}
          maxW={'560px'}
          bg={'white'}
          borderLeft={'1px solid'}
          borderColor={'#DFE5EE'}
          borderRadius={0}
          boxShadow={'none'}
          overflow={'hidden'}
        >
          <ChatQuoteList
            rawSearch={datasetCiteData.rawSearch}
            metadata={datasetCiteData.metadata}
            onClose={() => setCiteModalData(undefined)}
          />
        </Box>
      )}

      <SandboxEditorModal />
    </Flex>
  );
};

const Render = ({ appForm, setRenderEdit, form2WorkflowFn }: Props) => {
  const { chatId } = useChatStore();
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const chatRecordProviderParams = useMemo(
    () => ({
      chatId: chatId,
      appId: appDetail._id
    }),
    [appDetail._id, chatId]
  );

  return (
    <ChatItemContextProvider
      showRouteToDatasetDetail={true}
      canDownloadSource={true}
      isShowCite={true}
      isShowFullText={true}
      showRunningStatus={true}
      showSkillReferences={true}
      showWholeResponse={true}
    >
      <ChatRecordContextProvider params={chatRecordProviderParams}>
        <ChatTest
          appForm={appForm}
          setRenderEdit={setRenderEdit}
          form2WorkflowFn={form2WorkflowFn}
        />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};

export default React.memo(Render);
