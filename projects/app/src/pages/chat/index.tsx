import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NextHead from '@/components/common/NextHead';
import { Box, Flex } from '@chakra-ui/react';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import PageContainer from '@/components/PageContainer';
import ChatSlider from '@/pageComponents/chat/slider';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import ChatContextProvider from '@/web/core/chat/context/chatContext';
import { useContextSelector } from 'use-context-selector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { GetChatTypeEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider, {
  ChatRecordContext
} from '@/web/core/chat/context/chatRecordContext';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import LoginModal from '@/pageComponents/login/LoginModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ChatSetting from '@/pageComponents/chat/ChatSetting';
import AppChatWindow from '@/pageComponents/chat/ChatWindow/AppChatWindow';
import HomeChatWindow from '@/pageComponents/chat/ChatWindow/HomeChatWindow';
import { ChatPageContext, ChatPageContextProvider } from '@/web/core/chat/context/chatPageContext';
import ChatTeamApp from '@/pageComponents/chat/ChatTeamApp';
import ChatFavouriteApp from '@/pageComponents/chat/ChatFavouriteApp';
import { useUserStore } from '@/web/support/user/useUserStore';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { LoginSuccessResponseType } from '@fastgpt/global/openapi/support/user/account/login/api';
import AppListContextProvider from '@/pageComponents/dashboard/agent/context';
import {
  SandboxFilePanelProvider,
  useSandboxFilePanel
} from '@/pageComponents/chat/SandboxEditor/PanelContext';
import SandboxFilePanel from '@/pageComponents/chat/SandboxEditor/Panel';
import ResizeDivider from '@/pageComponents/chat/SandboxEditor/ResizeDivider';
import { useSize } from 'ahooks';
import { useAutoOpenSandboxFiles } from '@/pageComponents/chat/SandboxEditor/hook';

const logger = getLogger(LogCategories.MODULE.CHAT.ITEM);

const Chat = () => {
  const { isPc } = useSystem();
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useSize(containerRef);
  const panel = useSandboxFilePanel();
  const closeFilePanel = panel?.close;
  const refreshFilePanel = panel?.refresh;
  const isFilePanelOpen = panel?.isOpen;
  const [fileWidth, setFileWidth] = useState(280);
  useEffect(() => {
    const storedWidth = Number(localStorage.getItem('chat_file_pane_width_v2'));
    if (Number.isFinite(storedWidth) && storedWidth > 0) setFileWidth(storedWidth);
  }, []);

  const { appId, chatId } = useChatStore();

  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  const collapse = useContextSelector(ChatPageContext, (v) => v.collapse);
  const pane = useContextSelector(ChatPageContext, (v) => v.pane);
  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const isConversationPane =
    pane === ChatSidebarPaneEnum.RECENTLY_USED_APPS || pane === ChatSidebarPaneEnum.HOME;
  useAutoOpenSandboxFiles({
    appId,
    chatId,
    enabled: isPc && isConversationPane && !datasetCiteData
  });
  const fileOpen = !!isFilePanelOpen && isPc && !datasetCiteData && isConversationPane;
  const autoFileWidth = 248;
  const maxFileWidth = Math.max(248, (size?.width ?? 1440) - (collapse ? 64 : 268) - 480 - 8);
  const actualFileWidth = Math.max(
    248,
    Math.min(
      panel?.isExpanded ? 760 : panel?.isAutoOpened ? autoFileWidth : fileWidth,
      maxFileWidth
    )
  );

  useEffect(() => {
    if (datasetCiteData || !isConversationPane) closeFilePanel?.();
  }, [datasetCiteData, isConversationPane, closeFilePanel]);

  useEffect(() => {
    if (!isFilePanelOpen || !refreshFilePanel) return;
    const timer = window.setTimeout(refreshFilePanel, 1500);
    return () => window.clearTimeout(timer);
  }, [chatRecords, isFilePanelOpen, refreshFilePanel]);

  const moveFile = useCallback(
    (delta: number) => {
      if (panel?.isExpanded) panel.restore();
      panel?.markManuallyResized();
      setFileWidth((currentWidth) => {
        const next = Math.max(
          248,
          Math.min(
            (panel?.isExpanded || panel?.isAutoOpened ? actualFileWidth : currentWidth) - delta,
            maxFileWidth
          )
        );
        localStorage.setItem('chat_file_pane_width_v2', String(next));
        return next;
      });
    },
    [actualFileWidth, maxFileWidth, panel]
  );

  return (
    <Flex ref={containerRef} h={'100%'} minW={0} overflow={'hidden'}>
      {/* Side bar */}
      {isPc && (
        <Box
          flexGrow={0}
          flexShrink={0}
          w={collapse ? '64px' : '268px'}
          overflow={'hidden'}
          bg={'myGray.25'}
          borderRight={'base'}
          transition={'width 0.16s ease-in-out'}
        >
          <ChatSlider activeAppId={appId} />
        </Box>
      )}

      {(!datasetCiteData || isPc) && (
        <PageContainer
          flex="1 0 0"
          w={0}
          minW={fileOpen ? '480px' : 0}
          position="relative"
          py={0}
          pr={0}
          insertProps={{
            borderWidth: 0,
            borderRadius: 0,
            boxShadow: 'none'
          }}
        >
          {/* home chat window */}
          {pane === ChatSidebarPaneEnum.HOME && <HomeChatWindow />}

          {/* favourite apps */}
          {pane === ChatSidebarPaneEnum.FAVORITE_APPS && <ChatFavouriteApp />}

          {/* team apps */}
          {pane === ChatSidebarPaneEnum.TEAM_APPS && <ChatTeamApp />}

          {/* recently used apps chat window */}
          {pane === ChatSidebarPaneEnum.RECENTLY_USED_APPS && <AppChatWindow />}

          {/* setting */}
          {pane === ChatSidebarPaneEnum.SETTING && <ChatSetting />}
        </PageContainer>
      )}

      {fileOpen && <ResizeDivider label={'调整文件区域宽度'} onMove={moveFile} />}
      <Box
        w={`${fileOpen ? actualFileWidth : 0}px`}
        flexShrink={0}
        display={fileOpen ? 'block' : 'none'}
        overflow={'hidden'}
      >
        <SandboxFilePanel headerHeight={56} />
      </Box>

      {datasetCiteData && (
        <PageContainer
          flex="1 0 0"
          w={0}
          maxW="560px"
          py={0}
          pr={0}
          insertProps={{
            borderWidth: 0,
            borderLeftWidth: 1,
            borderRadius: 0,
            boxShadow: 'none'
          }}
        >
          <ChatQuoteList
            metadata={datasetCiteData.metadata}
            rawSearch={datasetCiteData.rawSearch}
            onClose={() => setCiteModalData(undefined)}
          />
        </PageContainer>
      )}
    </Flex>
  );
};

type ChatPageProps = {
  appId: string;
  isStandalone?: string;
  showRunningStatus: boolean;
  showSkillReferences: boolean;
  showCite: boolean;
  showFullText: boolean;
  canDownloadSource: boolean;
  showWholeResponse: boolean;
};

const ChatContent = (props: ChatPageProps) => {
  const { appId, isStandalone } = props;
  const { chatId, appId: currentAppId } = useChatStore();
  const { setUserInfo } = useUserStore();
  const { feConfigs } = useSystemStore();

  const isInitedUser = useContextSelector(ChatPageContext, (v) => v.isInitedUser);
  const userInfo = useContextSelector(ChatPageContext, (v) => v.userInfo);

  const chatHistoryProviderParams = useMemo(
    () => ({ appId, source: ChatSourceEnum.online }),
    [appId]
  );

  const chatRecordProviderParams = useMemo(() => {
    return {
      appId,
      type: GetChatTypeEnum.normal,
      chatId
    };
  }, [appId, chatId]);

  const loginSuccess = useCallback(
    async (res: LoginSuccessResponseType) => {
      setUserInfo(res.user);
    },
    [setUserInfo]
  );

  // Waiting for user info to be initialized
  if (!isInitedUser) {
    return (
      <PageContainer isLoading flex={'1'} p={4}>
        <NextHead title={feConfigs?.systemTitle} />
      </PageContainer>
    );
  }

  // Not login
  if (!userInfo) {
    return (
      <>
        <NextHead title={feConfigs?.systemTitle}></NextHead>

        <LoginModal onSuccess={loginSuccess} />
      </>
    );
  }

  // show main chat interface
  return (
    <ChatContextProvider params={chatHistoryProviderParams}>
      <ChatItemContextProvider
        showRouteToDatasetDetail={isStandalone !== '1'}
        showRunningStatus={props.showRunningStatus}
        showSkillReferences={props.showSkillReferences}
        canDownloadSource={props.canDownloadSource}
        isShowCite={props.showCite}
        isShowFullText={props.showFullText}
        showWholeResponse={props.showWholeResponse}
      >
        <ChatRecordContextProvider params={chatRecordProviderParams}>
          <AppListContextProvider>
            <SandboxFilePanelProvider scopeKey={`${currentAppId}:${chatId}`}>
              <Chat />
            </SandboxFilePanelProvider>
          </AppListContextProvider>
        </ChatRecordContextProvider>
      </ChatItemContextProvider>
    </ChatContextProvider>
  );
};

const Render = (props: ChatPageProps) => {
  return (
    <ChatPageContextProvider appId={props.appId}>
      <ChatContent {...props} />
    </ChatPageContextProvider>
  );
};

export default Render;

export async function getServerSideProps(context: any) {
  const appId = context?.query?.appId || '';

  const chatQuoteReaderConfig = await (async () => {
    try {
      if (!appId) return null;

      const config = await MongoOutLink.findOne(
        {
          appId,
          type: PublishChannelEnum.playground
        },
        'showRunningStatus showSkillReferences showCite showFullText canDownloadSource showWholeResponse'
      ).lean();

      return config;
    } catch (error) {
      logger.error('getServerSideProps failed', { error, appId });
      return null;
    }
  })();

  return {
    props: {
      appId,
      showRunningStatus: chatQuoteReaderConfig?.showRunningStatus ?? true,
      showSkillReferences: chatQuoteReaderConfig?.showSkillReferences ?? false,
      showCite: chatQuoteReaderConfig?.showCite ?? true,
      showFullText: chatQuoteReaderConfig?.showFullText ?? true,
      canDownloadSource: chatQuoteReaderConfig?.canDownloadSource ?? true,
      showWholeResponse: chatQuoteReaderConfig?.showWholeResponse ?? true,
      ...(await serviceSideProps(context, ['file', 'app', 'chat', 'workflow', 'skill']))
    }
  };
}
