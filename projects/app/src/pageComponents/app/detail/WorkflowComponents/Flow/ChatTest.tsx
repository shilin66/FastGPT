import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React, { useMemo } from 'react';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { type StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';

import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useChatTest } from '../../useChatTest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { PluginRunBoxTabEnum } from '@/components/core/chat/ChatContainer/PluginRunBox/constants';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider, {
  ChatRecordContext
} from '@/web/core/chat/context/chatRecordContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import VariablePopover from '@/components/core/chat/ChatContainer/components/VariablePopover';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import { useSandboxEditor, useSandboxStatus } from '@/pageComponents/chat/SandboxEditor/hook';
import { getAppChatConfig, getGuideModule } from '@fastgpt/global/core/workflow/utils';
import { ResizableRightPanel } from '@/components/common/ResizableRightPanel';

const DEBUG_PANEL_WIDTH = 480;
const DEBUG_PANEL_CITATION_WIDTH = 920;
const DEBUG_PANEL_MIN_WIDTH = 420;
const DEBUG_PANEL_MAX_WIDTH = 1120;

type Props = {
  isOpen: boolean;
  nodes?: StoreNodeItemType[];
  edges?: StoreEdgeItemType[];
  onClose: () => void;
  chatId: string;
};

const ChatTest = ({ isOpen, nodes = [], edges = [], onClose, chatId }: Props) => {
  const { t } = useTranslation();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const isPlugin = appDetail.type === AppTypeEnum.workflowTool;
  const { copyData } = useCopyData();

  // 与画布「用户引导」节点一致：合并当前 appDetail.chatConfig 与本次调试用的系统配置节点，避免未发布时与编辑态不一致
  const chatConfigForDebug = useMemo(
    () =>
      getAppChatConfig({
        chatConfig: appDetail.chatConfig,
        systemConfigNode: getGuideModule(nodes),
        isPublicFetch: true
      }),
    [appDetail.chatConfig, nodes]
  );

  const { restartChat, ChatContainer } = useChatTest({
    nodes,
    edges,
    chatConfig: chatConfigForDebug,
    isReady: isOpen
  });
  const pluginRunTab = useContextSelector(ChatItemContext, (v) => v.pluginRunTab);
  const setPluginRunTab = useContextSelector(ChatItemContext, (v) => v.setPluginRunTab);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  const isVariableVisible = useContextSelector(ChatItemContext, (v) => v.isVariableVisible);
  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);

  // Sandbox: Status Hook 负责网络同步，UI Hook 负责弹窗渲染
  const { SandboxEntryIcon } = useSandboxStatus({
    appId: appDetail._id,
    chatId
  });
  const { SandboxEditorModal, onOpenSandboxModal } = useSandboxEditor({
    appId: appDetail._id,
    chatId
  });

  const debugHeader = isPlugin ? (
    <LightRowTabs<PluginRunBoxTabEnum>
      list={[
        { label: t('common:Input'), value: PluginRunBoxTabEnum.input },
        ...(chatRecords.length > 0
          ? [
              { label: t('common:Output'), value: PluginRunBoxTabEnum.output },
              { label: t('common:all_result'), value: PluginRunBoxTabEnum.detail }
            ]
          : [])
      ]}
      value={pluginRunTab}
      onChange={setPluginRunTab}
      inlineStyles={{ px: 0.5 }}
      gap={5}
      py={0}
      fontSize={'sm'}
    />
  ) : (
    <Flex alignItems={'center'} minW={0} w={'full'} whiteSpace={'nowrap'}>
      <Flex fontSize={'16px'} fontWeight={'bold'} alignItems={'center'} mr={3} minW={0}>
        <MyIcon name={'common/paused'} w={'14px'} mr={2.5} />
        <MyTooltip label={chatId ? t('common:chat_chatId', { chatId }) : ''}>
          <Box
            cursor={'pointer'}
            overflow={'hidden'}
            textOverflow={'ellipsis'}
            onClick={() => {
              copyData(chatId);
            }}
          >
            {t('common:core.chat.Run test')}
          </Box>
        </MyTooltip>
      </Flex>
      {!isVariableVisible && <VariablePopover chatType={ChatTypeEnum.test} />}
      <Box flex={1} />
      <SandboxEntryIcon mr={2} onOpen={onOpenSandboxModal} />
      <MyTooltip label={t('common:core.chat.Restart')}>
        <IconButton
          mr={2}
          className="chat"
          size={'smSquare'}
          icon={<MyIcon name={'common/clearLight'} w={'14px'} />}
          variant={'whiteDanger'}
          borderRadius={'md'}
          aria-label={t('common:core.chat.Restart')}
          onClick={restartChat}
        />
      </MyTooltip>
    </Flex>
  );

  return (
    <Flex h={'full'}>
      {isOpen && (
        <ResizableRightPanel
          onClose={onClose}
          title={debugHeader}
          initialWidth={DEBUG_PANEL_WIDTH}
          preferredWidth={datasetCiteData ? DEBUG_PANEL_CITATION_WIDTH : DEBUG_PANEL_WIDTH}
          minWidth={DEBUG_PANEL_MIN_WIDTH}
          maxWidth={DEBUG_PANEL_MAX_WIDTH}
          closeLabel={t('common:Close')}
          resizeLabel={t('common:core.chat.Resize preview')}
          placement={{
            top: [0, '80px'],
            right: [0, 4],
            bottom: [0, 4],
            borderRadius: [0, '18px']
          }}
        >
          <Flex flex={'1 0 0'} alignItems={'end'} minH={0}>
            <Box flex={'1 0 0'} minW={0} h={'100%'} overflow={'auto'}>
              <ChatContainer />
            </Box>

            {datasetCiteData && (
              <Box
                flex={'1 0 0'}
                w={0}
                mr={4}
                maxW={'440px'}
                h={'98%'}
                bg={'white'}
                boxShadow={
                  '0px 4px 10px 0px rgba(19, 51, 107, 0.10), 0px 0px 1px 0px rgba(19, 51, 107, 0.10)'
                }
                borderRadius={'md'}
              >
                <ChatQuoteList
                  rawSearch={datasetCiteData.rawSearch}
                  metadata={datasetCiteData.metadata}
                  onClose={() => setCiteModalData(undefined)}
                />
              </Box>
            )}
          </Flex>
        </ResizableRightPanel>
      )}

      <SandboxEditorModal />
    </Flex>
  );
};

const Render = (Props: Props) => {
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
        <ChatTest {...Props} chatId={chatId} />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};

export default React.memo(Render);
