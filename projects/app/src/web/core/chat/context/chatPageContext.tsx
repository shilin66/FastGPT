import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { ChatSettingTabOptionEnum } from '@/pageComponents/chat/constants';
import {
  ChatSidebarPaneEnum,
  defaultCollapseStatus,
  type CollapseStatusType
} from '@/pageComponents/chat/constants';
import { getChatSetting } from '@/web/core/chat/api';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import type { ChatSettingType } from '@fastgpt/global/core/chat/setting/type';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createContext } from 'use-context-selector';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { getRecentlyUsedApps } from '@/web/core/chat/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useLatest, useMount } from 'ahooks';
import type { GetRecentlyUsedAppsResponseType } from '@fastgpt/global/openapi/core/chat/api';
import type { UserType } from '@fastgpt/global/support/user/type';
import { getPortalStartupDecision } from '@/pageComponents/chat/utils/portalStartup';

export type ChatPageContextValue = {
  // Pane & collapse
  pane: ChatSidebarPaneEnum;
  handlePaneChange: (
    pane: ChatSidebarPaneEnum,
    _id?: string,
    _tab?: ChatSettingTabOptionEnum
  ) => void;
  collapse: CollapseStatusType;
  onTriggerCollapse: () => void;
  // Chat settings
  chatSettings: ChatSettingType | undefined;
  refreshChatSetting: () => Promise<ChatSettingType | undefined>;
  logos: { wideLogoUrl?: string; squareLogoUrl?: string };

  // User & apps
  isInitedUser: boolean;
  userInfo: UserType | null;
  myApps: GetRecentlyUsedAppsResponseType;
  isRecentlyUsedReady: boolean;
  refreshRecentlyUsed: () => void;
};

export const ChatPageContext = createContext<ChatPageContextValue>({
  pane: ChatSidebarPaneEnum.HOME,
  handlePaneChange: () => {},
  collapse: defaultCollapseStatus,
  onTriggerCollapse: () => {},
  chatSettings: undefined,
  logos: { wideLogoUrl: '', squareLogoUrl: '' },
  refreshChatSetting: function (): Promise<ChatSettingType | undefined> {
    throw new Error('Function not implemented.');
  },
  isInitedUser: false,
  userInfo: null,
  myApps: [],
  isRecentlyUsedReady: false,
  refreshRecentlyUsed: () => {}
});

export const ChatPageContextProvider = ({
  appId: routeAppId,
  children
}: {
  appId: string;
  children: React.ReactNode;
}) => {
  const router = useRouter();
  const { feConfigs } = useSystemStore();
  const { setSource, setAppId, setLastPane, setLastChatAppId, lastPane } = useChatStore();
  const { userInfo, initUserInfo } = useUserStore();

  const { pane = lastPane || ChatSidebarPaneEnum.HOME } = router.query as {
    pane: ChatSidebarPaneEnum;
  };

  const [collapse, setCollapse] = useState<CollapseStatusType>(defaultCollapseStatus);
  const [isInitedUser, setIsInitedUser] = useState(false);
  const teamMemberId = userInfo?.team?.tmbId;

  // Get recently used apps
  const {
    data: recentlyUsedApps,
    loading: isRecentlyUsedLoading,
    refresh: refreshRecentlyUsed
  } = useRequest(() => (teamMemberId ? getRecentlyUsedApps() : Promise.resolve([])), {
    manual: false,
    ready: !!teamMemberId,
    errorToast: '',
    refreshDeps: [teamMemberId],
    pollingInterval: 30000,
    throttleWait: 500 // 500ms throttle
  });
  const myApps = recentlyUsedApps ?? [];
  const isRecentlyUsedReady =
    !!teamMemberId && recentlyUsedApps !== undefined && !isRecentlyUsedLoading;

  // Initialize user info
  useMount(async () => {
    if (routeAppId) setAppId(routeAppId);
    try {
      await initUserInfo();
    } catch (error) {
      console.log('User not logged in:', error);
    } finally {
      setSource('online');
      setIsInitedUser(true);
    }
  });

  // Sync appId to store as route/appId changes
  useEffect(() => {
    if (routeAppId) {
      setAppId(routeAppId);
    }
  }, [routeAppId, setAppId]);

  const { data: chatSettings, runAsync: refreshChatSetting } = useRequest(
    async () => {
      // if (!feConfigs.isPlus) return;
      if (true) return;
      return await getChatSetting();
    },
    {
      manual: false,
      refreshDeps: [feConfigs.isPlus],
      onSuccess: (data) => {
        if (!data) return;

        if (!data.enableHome && pane === ChatSidebarPaneEnum.HOME) {
          handlePaneChange(ChatSidebarPaneEnum.TEAM_APPS);
          return;
        }

        if (
          pane === ChatSidebarPaneEnum.HOME &&
          routeAppId !== data.appId &&
          data.quickAppList.every((q) => q._id !== routeAppId)
        ) {
          handlePaneChange(ChatSidebarPaneEnum.HOME, data.appId);
        }
      }
    }
  );

  const lastestPane = useLatest(pane);
  const handlePaneChange = useCallback(
    async (newPane: ChatSidebarPaneEnum, id?: string, tab?: ChatSettingTabOptionEnum) => {
      if (newPane === lastestPane.current && !id && !tab) return;

      const _id = (() => {
        if (id) return id;

        const hiddenAppId = chatSettings?.appId;
        if (newPane === ChatSidebarPaneEnum.HOME && hiddenAppId) {
          return hiddenAppId;
        }

        return '';
      })();

      await router.replace({
        query: {
          ...router.query,
          appId: _id,
          pane: newPane,
          tab
        }
      });

      setLastPane(newPane);
      setLastChatAppId(_id);
    },
    [lastestPane, router, setLastPane, setLastChatAppId, chatSettings?.appId]
  );

  const hasHandledPortalStartup = useRef(false);
  useEffect(() => {
    if (hasHandledPortalStartup.current || !router.isReady || !isInitedUser) return;

    const decision = getPortalStartupDecision({
      routeAppId,
      isRecentlyUsedReady,
      recentlyUsedApps: myApps
    });
    if (!decision) return;

    hasHandledPortalStartup.current = true;
    if (decision.appIdToRestore) {
      void handlePaneChange(ChatSidebarPaneEnum.RECENTLY_USED_APPS, decision.appIdToRestore);
    }
  }, [handlePaneChange, isInitedUser, isRecentlyUsedReady, myApps, routeAppId, router.isReady]);

  useEffect(() => {
    if (!Object.values(ChatSidebarPaneEnum).includes(pane)) {
      handlePaneChange(ChatSidebarPaneEnum.HOME);
    }
  }, [handlePaneChange, pane]);

  const logos: Pick<ChatSettingType, 'wideLogoUrl' | 'squareLogoUrl'> = useMemo(
    () => ({
      wideLogoUrl: chatSettings?.wideLogoUrl,
      squareLogoUrl: chatSettings?.squareLogoUrl
    }),
    [chatSettings?.squareLogoUrl, chatSettings?.wideLogoUrl]
  );

  const onTriggerCollapse = useCallback(() => {
    setCollapse(collapse === 0 ? 1 : 0);
  }, [collapse]);

  const value: ChatPageContextValue = useMemoEnhance(
    () => ({
      pane,
      handlePaneChange,
      collapse,
      onTriggerCollapse,
      chatSettings,
      refreshChatSetting,
      logos,
      isInitedUser,
      userInfo,
      myApps,
      isRecentlyUsedReady,
      refreshRecentlyUsed
    }),
    [
      pane,
      handlePaneChange,
      collapse,
      onTriggerCollapse,
      chatSettings,
      refreshChatSetting,
      logos,
      isInitedUser,
      userInfo,
      myApps,
      isRecentlyUsedReady,
      refreshRecentlyUsed
    ]
  );

  return <ChatPageContext.Provider value={value}>{children}</ChatPageContext.Provider>;
};
