import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Flex, Image, Input, InputGroup, InputLeftElement, Spinner } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { usePathname } from 'next/navigation';
import { useContextSelector } from 'use-context-selector';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { AppListItemType } from '@fastgpt/global/core/app/type';
import { useUserStore } from '@/web/support/user/useUserStore';
import UserAvatarPopover from '@/pageComponents/chat/UserAvatarPopover';
import {
  ChatSidebarPaneEnum,
  DEFAULT_LOGO_BANNER_COLLAPSED_URL,
  DEFAULT_LOGO_BANNER_URL
} from '@/pageComponents/chat/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { AppListContext } from '@/pageComponents/dashboard/agent/context';
import ChatSliderMenu from './ChatSliderMenu';
import ChatSliderList from './ChatSliderList';
import { getPortalStartupDecision } from '@/pageComponents/chat/utils/portalStartup';

type Props = {
  activeAppId: string;
};

const isFolder = (type: AppTypeEnum) =>
  type === AppTypeEnum.folder || type === AppTypeEnum.toolFolder;

const WorkspaceLogo = () => {
  const isCollapsed = useContextSelector(ChatPageContext, (v) => v.collapse === 1);
  const logos = useContextSelector(ChatPageContext, (v) => v.logos);
  const onTriggerCollapse = useContextSelector(ChatPageContext, (v) => v.onTriggerCollapse);

  return (
    <Flex h={'56px'} px={3} align={'center'} justify={'space-between'} borderBottom={'base'}>
      {isCollapsed ? (
        <Image
          mx={'auto'}
          w={'32px'}
          h={'32px'}
          src={logos.squareLogoUrl || DEFAULT_LOGO_BANNER_COLLAPSED_URL}
          fallbackSrc={DEFAULT_LOGO_BANNER_COLLAPSED_URL}
          alt={'OmniCockpit'}
        />
      ) : (
        <>
          <Image
            w={'120px'}
            h={'30px'}
            src={logos.wideLogoUrl || DEFAULT_LOGO_BANNER_URL}
            fallbackSrc={DEFAULT_LOGO_BANNER_URL}
            alt={'OmniCockpit'}
          />
          <Flex
            w={'32px'}
            h={'32px'}
            align={'center'}
            justify={'center'}
            borderRadius={'6px'}
            cursor={'pointer'}
            color={'myGray.500'}
            _hover={{ bg: 'white', color: 'primary.600' }}
            onClick={onTriggerCollapse}
          >
            <MyIcon name={'core/chat/sidebar/fold'} w={'18px'} />
          </Flex>
        </>
      )}
    </Flex>
  );
};

const ApplicationRow = ({
  item,
  active,
  onClick
}: {
  item: Pick<AppListItemType, '_id' | 'name' | 'avatar' | 'type'>;
  active?: boolean;
  onClick: () => void;
}) => (
  <Flex
    h={'42px'}
    px={2.5}
    align={'center'}
    gap={2.5}
    borderRadius={'6px'}
    position={'relative'}
    cursor={'pointer'}
    color={active ? 'primary.700' : 'myGray.700'}
    bg={active ? 'primary.50' : 'transparent'}
    fontWeight={active ? 600 : 500}
    _hover={{ bg: active ? 'primary.50' : 'white', color: active ? 'primary.700' : 'myGray.900' }}
    onClick={onClick}
  >
    {active && (
      <Box
        position={'absolute'}
        left={0}
        top={'8px'}
        bottom={'8px'}
        w={'3px'}
        borderRadius={'0 3px 3px 0'}
        bg={'primary.600'}
      />
    )}
    <Avatar src={item.avatar} w={'26px'} h={'26px'} borderRadius={'6px'} flexShrink={0} />
    <Box minW={0} flex={1} className={'textEllipsis'} fontSize={'sm'}>
      {item.name}
    </Box>
    {isFolder(item.type) && (
      <MyIcon name={'common/rightArrowLight'} w={'14px'} color={'myGray.400'} />
    )}
  </Flex>
);

const ExpandedNavigation = ({ activeAppId }: Props) => {
  const { t } = useTranslation();
  const router = useRouter();
  const pane = useContextSelector(ChatPageContext, (v) => v.pane);
  const recentApps = useContextSelector(ChatPageContext, (v) => v.myApps);
  const isRecentlyUsedReady = useContextSelector(ChatPageContext, (v) => v.isRecentlyUsedReady);
  const handlePaneChange = useContextSelector(ChatPageContext, (v) => v.handlePaneChange);
  const chatBoxData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const appResults = useContextSelector(AppListContext, (v) => v.myApps);
  const isFetchingApps = useContextSelector(AppListContext, (v) => v.isFetchingApps);
  const searchKey = useContextSelector(AppListContext, (v) => v.searchKey);
  const setSearchKey = useContextSelector(AppListContext, (v) => v.setSearchKey);
  const [isRecentOpen, setIsRecentOpen] = useState(false);
  const hasInitializedRecentOpen = useRef(false);

  useEffect(() => {
    if (hasInitializedRecentOpen.current) return;

    const decision = getPortalStartupDecision({
      routeAppId: activeAppId,
      isRecentlyUsedReady,
      recentlyUsedApps: recentApps
    });
    if (!decision) return;

    hasInitializedRecentOpen.current = true;
    setIsRecentOpen(decision.isRecentlyUsedExpanded);
  }, [activeAppId, isRecentlyUsedReady, recentApps]);

  const openAllApps = useCallback(async () => {
    setSearchKey('');
    const query = { ...router.query };
    delete query.parentId;
    await router.replace({
      query: { ...query, appId: '', pane: ChatSidebarPaneEnum.TEAM_APPS }
    });
  }, [router, setSearchKey]);

  const openApplication = useCallback(
    async (item: AppListItemType) => {
      setSearchKey('');
      if (isFolder(item.type)) {
        await router.replace({
          query: {
            ...router.query,
            pane: ChatSidebarPaneEnum.TEAM_APPS,
            appId: '',
            parentId: item._id
          }
        });
        return;
      }
      await handlePaneChange(ChatSidebarPaneEnum.RECENTLY_USED_APPS, item._id);
    },
    [handlePaneChange, router, setSearchKey]
  );

  const activeApp =
    chatBoxData.appId === activeAppId && activeAppId
      ? {
          _id: activeAppId,
          name: chatBoxData.app.name,
          avatar: chatBoxData.app.avatar,
          type: chatBoxData.app.type
        }
      : recentApps.find((item) => item.appId === activeAppId)
        ? {
            _id: activeAppId,
            name: recentApps.find((item) => item.appId === activeAppId)?.name || '',
            avatar: recentApps.find((item) => item.appId === activeAppId)?.avatar || '',
            type: AppTypeEnum.simple
          }
        : undefined;

  const showActiveWorkspace =
    pane === ChatSidebarPaneEnum.RECENTLY_USED_APPS && !!activeAppId && !!activeApp;

  return (
    <Flex flex={'1 0 0'} h={0} direction={'column'}>
      <Box px={3} pt={3}>
        <InputGroup size={'sm'}>
          <InputLeftElement pointerEvents={'none'}>
            <MyIcon name={'common/searchLight'} w={'15px'} color={'myGray.500'} />
          </InputLeftElement>
          <Input
            h={'36px'}
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
            placeholder={t('app:search_app')}
            borderRadius={'6px'}
            borderColor={'myGray.200'}
            bg={'white'}
            _focusVisible={{ borderColor: 'primary.500', boxShadow: '0 0 0 1px #3370FF' }}
          />
        </InputGroup>
        <Flex
          mt={2}
          h={'38px'}
          px={2.5}
          align={'center'}
          gap={2.5}
          borderRadius={'6px'}
          cursor={'pointer'}
          color={pane === ChatSidebarPaneEnum.TEAM_APPS ? 'primary.700' : 'myGray.700'}
          bg={pane === ChatSidebarPaneEnum.TEAM_APPS ? 'primary.50' : 'transparent'}
          _hover={{ bg: pane === ChatSidebarPaneEnum.TEAM_APPS ? 'primary.50' : 'white' }}
          onClick={openAllApps}
        >
          <Flex
            w={'26px'}
            h={'26px'}
            align={'center'}
            justify={'center'}
            borderRadius={'6px'}
            bg={pane === ChatSidebarPaneEnum.TEAM_APPS ? 'white' : 'myGray.100'}
          >
            <MyIcon name={'common/app'} w={'15px'} />
          </Flex>
          <Box fontSize={'sm'} fontWeight={600}>
            {t('app:all_apps')}
          </Box>
        </Flex>
      </Box>

      {searchKey ? (
        <MyBox
          flex={'1 0 0'}
          h={0}
          overflow={'overlay'}
          px={3}
          pt={4}
          sx={{
            scrollbarWidth: 'thin',
            '&::-webkit-scrollbar': { width: '4px' },
            '&::-webkit-scrollbar-thumb': { borderRadius: '4px' }
          }}
        >
          <Flex px={1} mb={2} align={'center'} justify={'space-between'}>
            <Box fontSize={'xs'} fontWeight={600} color={'myGray.600'}>
              {t('chat:sidebar.team_apps')}
            </Box>
            <Box fontSize={'mini'} color={'myGray.500'}>
              {appResults.length}
            </Box>
          </Flex>
          {isFetchingApps ? (
            <Flex py={8} justify={'center'}>
              <Spinner size={'sm'} color={'primary.600'} />
            </Flex>
          ) : (
            appResults.map((item) => (
              <ApplicationRow key={item._id} item={item} onClick={() => openApplication(item)} />
            ))
          )}
        </MyBox>
      ) : (
        <MyBox
          flex={'1 0 0'}
          h={0}
          overflow={'overlay'}
          px={3}
          pt={4}
          sx={{
            scrollbarWidth: 'thin',
            '&::-webkit-scrollbar': { width: '4px' },
            '&::-webkit-scrollbar-thumb': { borderRadius: '4px' }
          }}
        >
          {showActiveWorkspace && activeApp && (
            <Box mb={5}>
              <Flex px={1} mb={2} align={'center'} justify={'space-between'}>
                <Box fontSize={'xs'} fontWeight={600} color={'myGray.600'}>
                  {t('common:plugin.Currentapp')}
                </Box>
              </Flex>
              <ApplicationRow item={activeApp} active onClick={() => undefined} />
              <Box mt={2} pl={2.5} borderLeft={'1px solid'} borderColor={'myGray.200'}>
                <ChatSliderMenu embedded />
                <ChatSliderList compact />
              </Box>
            </Box>
          )}

          <Flex
            as={'button'}
            type={'button'}
            w={'100%'}
            h={'32px'}
            px={1}
            mb={1}
            align={'center'}
            justify={'space-between'}
            color={'myGray.600'}
            cursor={'pointer'}
            _hover={{ color: 'myGray.900' }}
            aria-expanded={isRecentOpen}
            onClick={() => setIsRecentOpen((value) => !value)}
          >
            <Box fontSize={'xs'} fontWeight={600} color={'myGray.600'}>
              {t('common:core.chat.Recent use')}
            </Box>
            <Flex align={'center'} gap={1.5}>
              <Box fontSize={'mini'} color={'myGray.500'}>
                {recentApps.filter((item) => item.appId !== activeAppId).length}
              </Box>
              <MyIcon
                name={'common/rightArrowLight'}
                w={'13px'}
                color={'myGray.400'}
                transform={isRecentOpen ? 'rotate(90deg)' : 'rotate(0deg)'}
                transition={'transform 0.15s ease'}
              />
            </Flex>
          </Flex>
          {isRecentOpen &&
            recentApps
              .filter((item) => item.appId !== activeAppId)
              .map((item) => (
                <ApplicationRow
                  key={item.appId}
                  item={{
                    _id: item.appId,
                    name: item.name,
                    avatar: item.avatar,
                    type: AppTypeEnum.simple
                  }}
                  onClick={() =>
                    handlePaneChange(ChatSidebarPaneEnum.RECENTLY_USED_APPS, item.appId)
                  }
                />
              ))}
        </MyBox>
      )}
    </Flex>
  );
};

const CollapsedNavigation = ({ activeAppId }: Props) => {
  const onTriggerCollapse = useContextSelector(ChatPageContext, (v) => v.onTriggerCollapse);
  const recentApps = useContextSelector(ChatPageContext, (v) => v.myApps);
  const pane = useContextSelector(ChatPageContext, (v) => v.pane);
  const handlePaneChange = useContextSelector(ChatPageContext, (v) => v.handlePaneChange);

  return (
    <Flex flex={1} direction={'column'} align={'center'} py={3} gap={2} overflow={'hidden'}>
      <Flex
        w={'40px'}
        h={'40px'}
        align={'center'}
        justify={'center'}
        borderRadius={'6px'}
        cursor={'pointer'}
        _hover={{ bg: 'white', color: 'primary.600' }}
        onClick={onTriggerCollapse}
      >
        <MyIcon name={'core/chat/sidebar/expand'} w={'19px'} />
      </Flex>
      <Flex
        w={'40px'}
        h={'40px'}
        align={'center'}
        justify={'center'}
        borderRadius={'6px'}
        cursor={'pointer'}
        bg={pane === ChatSidebarPaneEnum.TEAM_APPS ? 'primary.50' : 'transparent'}
        color={pane === ChatSidebarPaneEnum.TEAM_APPS ? 'primary.700' : 'myGray.600'}
        _hover={{ bg: 'white' }}
        onClick={() => handlePaneChange(ChatSidebarPaneEnum.TEAM_APPS)}
      >
        <MyIcon name={'common/app'} w={'18px'} />
      </Flex>
      <Box w={'28px'} borderTop={'1px solid'} borderColor={'myGray.200'} my={1} />
      <MyBox
        flex={1}
        overflow={'overlay'}
        sx={{
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': { width: '4px' },
          '&::-webkit-scrollbar-thumb': { borderRadius: '4px' }
        }}
      >
        <Flex direction={'column'} align={'center'} gap={2}>
          {recentApps.map((item) => (
            <Flex
              key={item.appId}
              w={'40px'}
              h={'40px'}
              align={'center'}
              justify={'center'}
              borderRadius={'6px'}
              cursor={'pointer'}
              bg={item.appId === activeAppId ? 'primary.50' : 'transparent'}
              _hover={{ bg: 'white' }}
              onClick={() => handlePaneChange(ChatSidebarPaneEnum.RECENTLY_USED_APPS, item.appId)}
            >
              <Avatar src={item.avatar} w={'26px'} h={'26px'} borderRadius={'6px'} />
            </Flex>
          ))}
        </Flex>
      </MyBox>
    </Flex>
  );
};

const AccountFooter = () => {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { userInfo } = useUserStore();
  const isCollapsed = useContextSelector(ChatPageContext, (v) => v.collapse === 1);
  const isSettingActive = useContextSelector(
    ChatPageContext,
    (v) => v.pane === ChatSidebarPaneEnum.SETTING
  );
  const handlePaneChange = useContextSelector(ChatPageContext, (v) => v.handlePaneChange);
  const showSetting =
    !!userInfo?.team.permission.hasManagePer && !!feConfigs.isPlus && pathname !== '/chat/share';

  return (
    <Flex
      minH={isCollapsed ? 'auto' : '56px'}
      p={isCollapsed ? 2 : 3}
      borderTop={'base'}
      align={'center'}
      direction={isCollapsed ? 'column' : 'row'}
      gap={2}
    >
      <Box flex={isCollapsed ? undefined : 1} minW={0} w={isCollapsed ? '40px' : 'auto'}>
        {userInfo ? (
          <UserAvatarPopover
            isCollapsed={isCollapsed}
            placement={isCollapsed ? 'right-start' : 'top-end'}
          >
            <Flex h={'40px'} align={'center'} gap={2.5} px={isCollapsed ? 1 : 2}>
              <Avatar src={userInfo.avatar} borderRadius={'50%'} w={'30px'} h={'30px'} />
              {!isCollapsed && (
                <Box minW={0} className={'textEllipsis'} fontSize={'sm'} fontWeight={600}>
                  {userInfo.team.memberName}
                </Box>
              )}
            </Flex>
          </UserAvatarPopover>
        ) : (
          <Flex h={'40px'} align={'center'} justify={'center'} fontSize={'sm'} color={'myGray.600'}>
            {isCollapsed ? <Avatar w={'30px'} h={'30px'} /> : t('login:Login')}
          </Flex>
        )}
      </Box>
      {showSetting && (
        <Flex
          w={'40px'}
          h={'40px'}
          align={'center'}
          justify={'center'}
          borderRadius={'6px'}
          cursor={'pointer'}
          bg={isSettingActive ? 'primary.50' : 'transparent'}
          color={isSettingActive ? 'primary.700' : 'myGray.500'}
          _hover={{ bg: 'white', color: 'primary.600' }}
          onClick={() => handlePaneChange(ChatSidebarPaneEnum.SETTING)}
        >
          <MyIcon name={'common/setting'} w={'18px'} />
        </Flex>
      )}
    </Flex>
  );
};

const SliderContent = ({ activeAppId }: Props) => {
  const isCollapsed = useContextSelector(ChatPageContext, (v) => v.collapse === 1);

  return (
    <Flex h={'100%'} w={'100%'} direction={'column'} bg={'myGray.25'} userSelect={'none'}>
      <WorkspaceLogo />
      {isCollapsed ? (
        <CollapsedNavigation activeAppId={activeAppId} />
      ) : (
        <ExpandedNavigation activeAppId={activeAppId} />
      )}
      <AccountFooter />
    </Flex>
  );
};

const ChatSlider = (props: Props) => <SliderContent {...props} />;

export default React.memo(ChatSlider);
