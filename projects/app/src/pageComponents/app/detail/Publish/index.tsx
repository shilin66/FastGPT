import React, { useRef, useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';

import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import dynamic from 'next/dynamic';

import { useTranslation } from 'next-i18next';

import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useUserStore } from '@/web/support/user/useUserStore';
import { UserTagsEnum } from '@fastgpt/global/support/user/type';

import ChromeExtension from '@/pages/app/detail/components/Publish/ChromeExtension';
import Teams from '@/pageComponents/app/detail/Publish/Teams';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { detailGridSurfaceStyles, detailPanelStyles } from '../DetailVisual';
import { omniTheme } from '@/web/common/brand/theme';
const Link = dynamic(() => import('./Link'));
const API = dynamic(() => import('./API'));
const FeiShu = dynamic(() => import('./FeiShu'));
const DingTalk = dynamic(() => import('./DingTalk'));
const Wecom = dynamic(() => import('./Wecom'));
const OffiAccount = dynamic(() => import('./OffiAccount'));
const Wechat = dynamic(() => import('./Wechat'));
const Playground = dynamic(() => import('./Playground'));

const publishChannelContentStyles = {
  '.chakra-table__container': {
    border: 0,
    borderRadius: 0,
    bg: omniTheme.colors.surface,
    boxShadow: 'none',
    overflow: 'auto'
  },
  '.chakra-table': {
    borderCollapse: 'collapse',
    borderSpacing: 0,
    minW: '720px'
  },
  '.chakra-table thead th': {
    py: 3,
    bg: omniTheme.colors.pageBg,
    borderBottom: '1px solid',
    borderColor: omniTheme.colors.border,
    color: omniTheme.colors.muted,
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: 0,
    lineHeight: 1.2,
    whiteSpace: 'nowrap'
  },
  '.chakra-table tbody td': {
    bg: omniTheme.colors.surface,
    borderBottom: '1px solid',
    borderColor: omniTheme.colors.border,
    color: omniTheme.colors.text,
    py: 3,
    whiteSpace: 'nowrap'
  },
  '.chakra-table tbody tr:hover td': {
    bg: omniTheme.colors.pageBg
  }
};

const OutLink = () => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { toast } = useToast();
  const { userInfo } = useUserStore();

  const appId = useContextSelector(AppContext, (v) => v.appId);

  const publishList = useRef([
    {
      icon: '/imgs/modal/shareFill.svg',
      title: t('common:core.app.Share link'),
      desc: t('common:core.app.Share link desc'),
      value: PublishChannelEnum.share,
      isProFn: false
    },
    {
      icon: 'support/outlink/apikeyFill',
      title: t('common:core.app.Api request'),
      desc: t('common:core.app.Api request desc'),
      value: PublishChannelEnum.apikey,
      isProFn: false
    },
    // {
    //   icon: 'core/app/publish/wechat',
    //   title: t('publish:wechat.bot'),
    //   desc: t('publish:wechat.bot_desc'),
    //   value: PublishChannelEnum.wechat,
    //   isProFn: false
    // },
    ...(feConfigs?.show_publish_feishu !== false &&
    !userInfo?.tags?.includes(UserTagsEnum.enum.wecom)
      ? [
          {
            icon: 'core/app/publish/lark',
            title: t('publish:feishu_bot'),
            desc: t('publish:feishu_bot_desc'),
            value: PublishChannelEnum.feishu,
            isProFn: false
          }
        ]
      : []),
    ...(feConfigs?.show_publish_dingtalk !== false &&
    !userInfo?.tags?.includes(UserTagsEnum.enum.wecom)
      ? [
          {
            icon: 'common/dingtalkFill',
            title: t('publish:dingtalk.bot'),
            desc: t('publish:dingtalk.bot_desc'),
            value: PublishChannelEnum.dingtalk,
            isProFn: false
          }
        ]
      : []),
    ...(feConfigs?.show_publish_wecom !== false
      ? [
          {
            icon: 'core/app/publish/wecom',
            title: t('publish:wecom.bot'),
            desc: t('publish:wecom.bot_desc'),
            value: PublishChannelEnum.wecom,
            isProFn: false
          }
        ]
      : []),
    // ...(feConfigs?.show_publish_offiaccount !== false
    //   ? [
    //       {
    //         icon: 'core/app/publish/offiaccount',
    //         title: t('publish:official_account.name'),
    //         desc: t('publish:official_account.desc'),
    //         value: PublishChannelEnum.officialAccount,
    //         isProFn: true
    //       }
    //     ]
    //   : []),

    {
      icon: 'common/teamsFill',
      title: t('publish:teams.bot'),
      desc: t('publish:teams.bot_desc'),
      value: PublishChannelEnum.teams,
      isProFn: true
    },
    {
      icon: 'support/outlink/chromeExtension',
      title: 'Chrome 插件',
      desc: '集成到浏览器中,在任意页面使用Chatbot',
      value: PublishChannelEnum.chromeExtension,
      isProFn: false
    }
    // {
    //   icon: 'core/chat/sidebar/home',
    //   title: t('common:navbar.Chat'),
    //   desc: t('app:publish.chat_desc'),
    //   value: PublishChannelEnum.playground,
    //   isProFn: false
    // }
  ]);

  const [linkType, setLinkType] = useState<PublishChannelEnum>(PublishChannelEnum.share);

  return (
    <Box
      display={'flex'}
      overflowY={'auto'}
      overflowX={'hidden'}
      h={'100%'}
      minH={0}
      flexDirection={'column'}
    >
      <Box display={'flex'} flex={1} minH={0}>
        <Flex
          {...detailPanelStyles}
          {...detailGridSurfaceStyles}
          flex={1}
          h={'100%'}
          alignItems={'stretch'}
          minH={'520px'}
          overflowX={'auto'}
          overflowY={'hidden'}
        >
          <Box
            flex={'0 0 238px'}
            p={3}
            overflowY={'auto'}
            borderRight={'1px solid'}
            borderRightColor={omniTheme.colors.border}
          >
            <Box px={2} pb={2} color={omniTheme.colors.muted} fontSize={'xs'} fontWeight={800}>
              发布渠道
            </Box>
            <Flex flexDirection={'column'} gap={2}>
              {publishList.current.map((item) => {
                const isActive = linkType === item.value;
                return (
                  <Flex
                    key={item.value}
                    as={'button'}
                    type={'button'}
                    aria-current={isActive ? 'page' : undefined}
                    textAlign={'left'}
                    w={'full'}
                    cursor={'pointer'}
                    p={3}
                    gap={2.5}
                    position={'relative'}
                    alignItems={'center'}
                    border={0}
                    borderRadius={omniTheme.radii.md}
                    bg={isActive ? omniTheme.colors.activeBg : 'transparent'}
                    transition={omniTheme.motion.control}
                    _hover={{
                      bg: omniTheme.colors.activeBg
                    }}
                    onClick={() => {
                      const config = publishList.current.find((v) => v.value === item.value)!;
                      if (!feConfigs.isPlus && config.isProFn) {
                        toast({
                          status: 'warning',
                          title: t('common:commercial_function_tip')
                        });
                      } else {
                        setLinkType(item.value as PublishChannelEnum);
                      }
                    }}
                  >
                    <Flex
                      alignItems={'center'}
                      justifyContent={'center'}
                      w={'30px'}
                      h={'30px'}
                      flexShrink={0}
                      borderRadius={'9px'}
                      bg={isActive ? omniTheme.colors.saturatedBlueSoft : omniTheme.colors.pageBg}
                      color={omniTheme.colors.saturatedBlue}
                    >
                      <Avatar src={item.icon} w={'17px'} fill={'currentColor'} />
                    </Flex>
                    <Box flex={'1 0 0'} minW={0}>
                      <Box
                        color={omniTheme.colors.text}
                        fontSize={'sm'}
                        fontWeight={800}
                        lineHeight={1.25}
                        className={'textEllipsis'}
                      >
                        {item.title}
                      </Box>
                      <Box
                        mt={1}
                        color={omniTheme.colors.muted}
                        fontSize={'xs'}
                        lineHeight={1.35}
                        className={'textEllipsis'}
                      >
                        {item.desc}
                      </Box>
                    </Box>
                    {isActive && (
                      <MyIcon
                        name={'common/check'}
                        w={'13px'}
                        color={omniTheme.colors.saturatedBlue}
                        flexShrink={0}
                      />
                    )}
                  </Flex>
                );
              })}
            </Flex>
          </Box>

          <Box
            display={'flex'}
            flexDirection={'column'}
            flex={'1 0 760px'}
            minW={0}
            minH={0}
            p={[4, 5]}
            sx={publishChannelContentStyles}
          >
            {(() => {
              const activeItem = publishList.current.find((item) => item.value === linkType);
              if (!activeItem) return null;

              return (
                <Flex
                  pb={4}
                  mb={4}
                  alignItems={'center'}
                  justifyContent={'space-between'}
                  gap={4}
                  borderBottom={'1px solid'}
                  borderBottomColor={omniTheme.colors.border}
                >
                  <Flex alignItems={'center'} gap={3} minW={0}>
                    <Flex
                      alignItems={'center'}
                      justifyContent={'center'}
                      w={'40px'}
                      h={'40px'}
                      flexShrink={0}
                      borderRadius={'12px'}
                      bg={omniTheme.colors.saturatedBlueSoft}
                      color={omniTheme.colors.saturatedBlue}
                    >
                      <Avatar src={activeItem.icon} w={'21px'} fill={'currentColor'} />
                    </Flex>
                    <Box minW={0}>
                      <Box color={omniTheme.colors.text} fontSize={'lg'} fontWeight={800}>
                        {activeItem.title}
                      </Box>
                      <Box
                        mt={1}
                        color={omniTheme.colors.muted}
                        fontSize={'sm'}
                        lineHeight={1.4}
                        className={'textEllipsis'}
                      >
                        {activeItem.desc}
                      </Box>
                    </Box>
                  </Flex>
                </Flex>
              );
            })()}

            <Box flex={1} minH={0} overflowY={'auto'} overflowX={'hidden'}>
              {linkType === PublishChannelEnum.share && (
                <Link appId={appId} type={PublishChannelEnum.share} />
              )}
              {linkType === PublishChannelEnum.apikey && <API appId={appId} />}
              {linkType === PublishChannelEnum.feishu && <FeiShu appId={appId} />}
              {linkType === PublishChannelEnum.dingtalk && <DingTalk appId={appId} />}
              {linkType === PublishChannelEnum.wecom && <Wecom appId={appId} />}
              {linkType === PublishChannelEnum.officialAccount && <OffiAccount appId={appId} />}
              {linkType === PublishChannelEnum.wechat && <Wechat appId={appId} />}
              {linkType === PublishChannelEnum.playground && <Playground appId={appId} />}
              {linkType === PublishChannelEnum.teams && <Teams appId={appId} />}
              {linkType === PublishChannelEnum.chromeExtension && <ChromeExtension />}
            </Box>
          </Box>
        </Flex>
      </Box>
    </Box>
  );
};

export default OutLink;
