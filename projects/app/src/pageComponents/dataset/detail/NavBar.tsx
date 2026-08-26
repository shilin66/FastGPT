import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import { omniTheme } from '@/web/common/brand/theme';

export enum TabEnum {
  dataCard = 'dataCard',
  collectionCard = 'collectionCard',
  test = 'test',
  info = 'info',
  import = 'import'
}

type Props = {
  currentTab: TabEnum;
  isInfoOpen?: boolean;
  onToggleInfo?: () => void;
};

const NavBar = ({ currentTab, isInfoOpen, onToggleInfo }: Props) => {
  const { t } = useTranslation();
  const router = useRouter();
  const query = router.query;
  const { isPc } = useSystem();
  const { datasetDetail, rebuildingCount } = useContextSelector(DatasetPageContext, (v) => v);

  const tabList = [
    {
      label: t('common:core.dataset.Collection'),
      value: TabEnum.collectionCard
    },
    { label: t('common:core.dataset.test.Search Test'), value: TabEnum.test },
    ...(datasetDetail.permission.hasManagePer && !isPc
      ? [{ label: t('common:Config'), value: TabEnum.info }]
      : [])
  ];

  const setCurrentTab = useCallback(
    (tab: TabEnum) => {
      router.replace({
        query: {
          datasetId: query.datasetId,
          currentTab: tab
        }
      });
    },
    [query, router]
  );

  return (
    <>
      {isPc ? (
        <Flex
          h={'68px'}
          px={4}
          align={'center'}
          justify={'space-between'}
          gap={4}
          borderBottom={'1px solid'}
          borderColor={omniTheme.colors.border}
          bg={omniTheme.colors.surface}
          flexShrink={0}
        >
          <Flex minW={0} flex={'1 1 0'} align={'center'} gap={3}>
            <IconButton
              icon={<MyIcon name={'common/arrowLeft'} w={'16px'} />}
              aria-label={t('common:back')}
              size={'smSquare'}
              variant={'whiteBase'}
              borderRadius={omniTheme.radii.sm}
              onClick={() => router.back()}
            />
            <Flex
              w={'36px'}
              h={'36px'}
              align={'center'}
              justify={'center'}
              borderRadius={omniTheme.radii.sm}
              bg={omniTheme.colors.saturatedBlueSoft}
              flexShrink={0}
            >
              <Avatar src={datasetDetail.avatar} w={'26px'} h={'26px'} borderRadius={'4px'} />
            </Flex>
            <Box minW={0}>
              <Box
                fontSize={'15px'}
                lineHeight={'20px'}
                fontWeight={700}
                color={omniTheme.colors.text}
                className={'textEllipsis'}
              >
                {datasetDetail.name}
              </Box>
              <Flex align={'center'} gap={2} fontSize={'11px'} color={omniTheme.colors.muted}>
                <Box className={'textEllipsis'}>
                  {DatasetTypeMap[datasetDetail.type]
                    ? t(DatasetTypeMap[datasetDetail.type].label)
                    : ''}
                </Box>
                {rebuildingCount > 0 && (
                  <Flex align={'center'} gap={1} color={omniTheme.colors.saturatedBlue}>
                    <Box
                      w={'5px'}
                      h={'5px'}
                      borderRadius={'50%'}
                      bg={omniTheme.colors.saturatedBlue}
                    />
                    {t('common:dataset.collections.Collection Embedding', {
                      total: rebuildingCount
                    })}
                  </Flex>
                )}
              </Flex>
            </Box>
          </Flex>

          <Box flexShrink={0}>
            <LightRowTabs<TabEnum>
              px={1}
              py={1}
              visibility={currentTab === TabEnum.dataCard ? 'hidden' : 'visible'}
              bg={omniTheme.colors.sidebarBg}
              border={'1px solid'}
              borderColor={omniTheme.colors.border}
              borderRadius={omniTheme.radii.md}
              list={tabList}
              value={currentTab}
              activeColor={omniTheme.colors.saturatedBlue}
              onChange={setCurrentTab}
              inlineStyles={{
                px: 4,
                py: 1.5,
                fontSize: '13px',
                lineHeight: '18px',
                fontWeight: 600,
                border: 'none',
                _hover: {
                  bg: omniTheme.colors.surface
                },
                borderRadius: omniTheme.radii.sm
              }}
            />
          </Box>

          <Flex flex={'1 1 0'} justify={'flex-end'}>
            {onToggleInfo && currentTab !== TabEnum.dataCard && (
              <Button
                size={'sm'}
                h={'34px'}
                px={3}
                variant={'unstyled'}
                display={'inline-flex'}
                alignItems={'center'}
                border={'1px solid'}
                borderColor={isInfoOpen ? '#B9CCFB' : omniTheme.colors.border}
                borderRadius={omniTheme.radii.sm}
                bg={isInfoOpen ? omniTheme.colors.saturatedBlueSoft : omniTheme.colors.surface}
                color={isInfoOpen ? omniTheme.colors.saturatedBlue : omniTheme.colors.graphite}
                fontSize={'12px'}
                fontWeight={700}
                leftIcon={<MyIcon name={'common/settingLight'} w={'15px'} />}
                onClick={onToggleInfo}
                _hover={{ bg: isInfoOpen ? '#CFE0FF' : omniTheme.colors.sidebarBg }}
              >
                {t('common:Config')}
              </Button>
            )}
          </Flex>
        </Flex>
      ) : (
        <Box mb={2}>
          <LightRowTabs<TabEnum>
            m={'auto'}
            w={'full'}
            size={'sm'}
            list={tabList}
            value={currentTab}
            onChange={setCurrentTab}
          />
        </Box>
      )}
    </>
  );
};

export default NavBar;
