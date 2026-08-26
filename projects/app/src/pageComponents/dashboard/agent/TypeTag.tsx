import React from 'react';
import type { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { appTypeTagMap } from '../constant';
import { omniTheme } from '@/web/common/brand/theme';

const AppTypeTag = ({ type }: { type: AppTypeEnum }) => {
  const { t } = useTranslation();

  const data = appTypeTagMap[type as keyof typeof appTypeTagMap];

  return data ? (
    <Flex
      bg={'transparent'}
      color={omniTheme.colors.saturatedBlue}
      display={'inline-flex'}
      w={'fit-content'}
      maxW={'100%'}
      py={0}
      px={0}
      whiteSpace={'nowrap'}
      alignItems={'center'}
    >
      <MyIcon name={data.icon as any} w={'12px'} color={'currentColor'} flexShrink={0} />
      <Box ml={1} fontSize={'11px'} className={'textEllipsis'}>
        {t(data.label)}
      </Box>
    </Flex>
  ) : null;
};

export default AppTypeTag;
