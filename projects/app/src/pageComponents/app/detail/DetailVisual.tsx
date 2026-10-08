import React from 'react';
import { Box, Flex, type BoxProps, type FlexProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { omniTheme } from '@/web/common/brand/theme';

export const detailPageBg = '#F5F8FC';

export const detailPanelStyles: BoxProps = {
  bg: omniTheme.colors.surface,
  border: 0,
  borderRadius: 0,
  boxShadow: 'none',
  overflow: 'hidden'
};

export const detailGridSurfaceStyles: BoxProps = {
  bg: omniTheme.colors.surface
};

export const detailSectionStyles: BoxProps = {
  px: [4, 5],
  py: 4,
  borderBottom: '1px solid',
  borderBottomColor: 'rgba(148, 163, 184, 0.2)'
};

export const detailToolbarStyles: FlexProps = {
  bg: omniTheme.colors.surface,
  borderBottom: '1px solid',
  borderColor: omniTheme.colors.border,
  borderRadius: 0,
  boxShadow: 'none'
};

export const DetailSectionTitle = ({
  icon,
  title,
  children
}: {
  icon?: any;
  title: React.ReactNode;
  children?: React.ReactNode;
}) => {
  return (
    <Flex alignItems={'center'} gap={2} minW={0}>
      {!!icon && (
        <Flex
          alignItems={'center'}
          justifyContent={'center'}
          w={'28px'}
          h={'28px'}
          flexShrink={0}
          borderRadius={'8px'}
          bg={'rgba(37, 99, 235, 0.1)'}
          color={'#2563EB'}
        >
          <MyIcon name={icon} w={'16px'} />
        </Flex>
      )}
      <Box flex={'1 0 0'} minW={0}>
        <Box color={'#1E293B'} fontWeight={700} fontSize={'sm'} lineHeight={1.2}>
          {title}
        </Box>
        {children}
      </Box>
    </Flex>
  );
};

export default function DetailVisualDom() {
  return <></>;
}
