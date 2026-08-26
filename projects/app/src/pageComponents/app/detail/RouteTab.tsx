import { Box, HStack } from '@chakra-ui/react';
import React, { useCallback, useMemo } from 'react';
import { AppContext, TabEnum } from './context';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';

const RouteTab = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { appDetail, currentTab } = useContextSelector(AppContext, (v) => v);

  const setCurrentTab = useCallback(
    (tab: TabEnum) => {
      router.replace({
        query: {
          ...router.query,
          currentTab: tab
        }
      });
    },
    [router]
  );

  const tabList = useMemo(
    () => [
      ...(appDetail.permission.hasWritePer
        ? [
            {
              label:
                appDetail.type === AppTypeEnum.workflowTool
                  ? t('app:setting_plugin')
                  : t('app:setting_app'),
              value: TabEnum.appEdit
            }
          ]
        : []),
      ...(appDetail.permission.hasManagePer
        ? [
            {
              label: t('app:publish_channel'),
              value: TabEnum.publish
            }
          ]
        : []),
      ...(appDetail.permission.hasReadChatLogPer
        ? [{ label: t('app:chat_logs'), value: TabEnum.logs }]
        : [])
    ],
    [
      appDetail.permission.hasManagePer,
      appDetail.permission.hasReadChatLogPer,
      appDetail.permission.hasWritePer,
      appDetail.type,
      t
    ]
  );

  return (
    <HStack h={'full'} bg={'transparent'} p={0} gap={0} flexShrink={0} whiteSpace={'nowrap'}>
      {tabList.map((tab) => (
        <HStack
          key={tab.value}
          justifyContent={'center'}
          gap={1.5}
          cursor={'pointer'}
          position={'relative'}
          px={3}
          h={'full'}
          flexShrink={0}
          fontSize={'13px'}
          fontWeight={700}
          userSelect={'none'}
          transition={'color .18s ease, background-color .18s ease'}
          onClick={() => setCurrentTab(tab.value)}
          {...(currentTab === tab.value
            ? {
                color: '#2563EB',
                _after: {
                  content: '""',
                  position: 'absolute',
                  left: '12px',
                  right: '12px',
                  bottom: 0,
                  h: '2px',
                  bg: '#2563EB'
                }
              }
            : {
                color: '#64748B',
                _hover: {
                  bg: '#F8FAFC',
                  color: '#2563EB'
                }
              })}
        >
          <MyIcon
            name={
              tab.value === TabEnum.appEdit
                ? 'common/settingLight'
                : tab.value === TabEnum.publish
                  ? 'core/workflow/publish'
                  : 'core/app/logsLight'
            }
            w={'14px'}
          />
          <Box>{tab.label}</Box>
        </HStack>
      ))}
    </HStack>
  );
};

export default RouteTab;
