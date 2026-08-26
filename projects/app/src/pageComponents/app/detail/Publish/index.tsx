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
    border: '1px solid rgba(37, 99, 235, 0.14)',
    borderRadius: '14px',
    bg: 'rgba(255, 255, 255, 0.82)',
    boxShadow: '0 14px 34px rgba(15, 23, 42, 0.05)',
    overflow: 'auto'
  },
  '.chakra-table': {
    borderCollapse: 'separate',
    borderSpacing: '0 8px',
    minW: '720px'
  },
  '.chakra-table thead th': {
    h: '46px',
    py: '11px',
    bg: '#F8FAFC',
    borderBottom: '1px solid rgba(148, 163, 184, 0.22)',
    color: '#64748B',
    fontSize: '12px',
    fontWeight: 800,
    letterSpacing: 0,
    lineHeight: 1.2,
    whiteSpace: 'nowrap'
  },
  '.chakra-table tbody td': {
    bg: 'white',
    borderTop: '1px solid rgba(148, 163, 184, 0.2)',
    borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
    color: '#334155',
    py: 3,
    whiteSpace: 'nowrap'
  },
  '.chakra-table tbody tr td:first-of-type': {
    borderLeft: '1px solid rgba(37, 99, 235, 0.18)',
    borderLeftWidth: '4px',
    borderTopLeftRadius: '14px',
    borderBottomLeftRadius: '14px'
  },
  '.chakra-table tbody tr td:last-of-type': {
    borderRight: '1px solid rgba(148, 163, 184, 0.2)',
    borderTopRightRadius: '14px',
    borderBottomRightRadius: '14px'
  },
  '.chakra-table tbody tr:hover td': {
    bg: 'rgba(37, 99, 235, 0.04)',
    borderColor: 'rgba(37, 99, 235, 0.3)'
  },
  '.chakra-menu__menu-list': {
    border: '1px solid rgba(37, 99, 235, 0.16)',
    borderRadius: '12px',
    boxShadow: '0 18px 45px rgba(15, 23, 42, 0.14)'
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
      py={[4, 5]}
    >
      <Box display={'flex'} px={[4, 8]} flex={1} minH={0}>
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
            borderRightColor={'rgba(148, 163, 184, 0.22)'}
          >
            <Box px={2} pb={2} color={'#64748B'} fontSize={'xs'} fontWeight={800}>
              发布渠道
            </Box>
            <Flex flexDirection={'column'} gap={2}>
              {publishList.current.map((item) => {
                const isActive = linkType === item.value;
                return (
                  <Flex
                    key={item.value}
                    cursor={'pointer'}
                    p={3}
                    gap={2.5}
                    position={'relative'}
                    alignItems={'center'}
                    border={'1px solid'}
                    borderColor={isActive ? 'rgba(37, 99, 235, 0.42)' : 'transparent'}
                    borderRadius={'12px'}
                    bg={isActive ? 'rgba(37, 99, 235, 0.08)' : 'transparent'}
                    boxShadow={isActive ? 'inset 4px 0 0 #2563EB' : 'none'}
                    transition={'all .2s ease'}
                    _hover={{
                      bg: isActive ? 'rgba(37, 99, 235, 0.08)' : 'rgba(37, 99, 235, 0.05)',
                      borderColor: 'rgba(37, 99, 235, 0.28)'
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
                      bg={isActive ? '#2563EB' : 'rgba(37, 99, 235, 0.1)'}
                      color={isActive ? 'white' : '#2563EB'}
                    >
                      <Avatar src={item.icon} w={'17px'} fill={'currentColor'} />
                    </Flex>
                    <Box flex={'1 0 0'} minW={0}>
                      <Box
                        color={'#1E293B'}
                        fontSize={'sm'}
                        fontWeight={800}
                        lineHeight={1.25}
                        className={'textEllipsis'}
                      >
                        {item.title}
                      </Box>
                      <Box
                        mt={1}
                        color={'#64748B'}
                        fontSize={'xs'}
                        lineHeight={1.35}
                        className={'textEllipsis'}
                      >
                        {item.desc}
                      </Box>
                    </Box>
                    {isActive && (
                      <MyIcon name={'common/check'} w={'13px'} color={'#2563EB'} flexShrink={0} />
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
                  borderBottomColor={'rgba(148, 163, 184, 0.22)'}
                >
                  <Flex alignItems={'center'} gap={3} minW={0}>
                    <Flex
                      alignItems={'center'}
                      justifyContent={'center'}
                      w={'40px'}
                      h={'40px'}
                      flexShrink={0}
                      borderRadius={'12px'}
                      bg={'linear-gradient(135deg, #2563EB, #8FB4FF)'}
                      color={'white'}
                      boxShadow={'0 14px 28px rgba(37, 99, 235, 0.2)'}
                    >
                      <Avatar src={activeItem.icon} w={'21px'} fill={'currentColor'} />
                    </Flex>
                    <Box minW={0}>
                      <Box color={'#1E293B'} fontSize={'lg'} fontWeight={800}>
                        {activeItem.title}
                      </Box>
                      <Box
                        mt={1}
                        color={'#64748B'}
                        fontSize={'sm'}
                        lineHeight={1.4}
                        className={'textEllipsis'}
                      >
                        {activeItem.desc}
                      </Box>
                    </Box>
                  </Flex>
                  <Flex
                    px={3}
                    py={1.5}
                    borderRadius={'full'}
                    bg={'rgba(37, 99, 235, 0.1)'}
                    color={'#2563EB'}
                    fontSize={'xs'}
                    fontWeight={800}
                    flexShrink={0}
                  >
                    当前渠道
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
