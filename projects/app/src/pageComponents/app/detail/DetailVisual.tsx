import React from 'react';
import { Box, Flex, type BoxProps, type FlexProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

export const detailPageBg = '#F5F8FC';

export const detailPanelStyles: BoxProps = {
  bg: 'white',
  border: '1px solid',
  borderColor: 'rgba(37, 99, 235, 0.16)',
  borderRadius: '14px',
  boxShadow: '0 18px 45px rgba(15, 23, 42, 0.06)',
  overflow: 'hidden'
};

export const detailGridSurfaceStyles: BoxProps = {
  bg: 'linear-gradient(180deg, rgba(37, 99, 235, 0.05) 0%, rgba(255, 255, 255, 0) 220px), #FFFFFF'
};

export const detailSectionStyles: BoxProps = {
  px: [4, 5],
  py: 4,
  borderBottom: '1px solid',
  borderBottomColor: 'rgba(148, 163, 184, 0.2)'
};

export const detailToolbarStyles: FlexProps = {
  bg: 'white',
  border: '1px solid',
  borderColor: 'rgba(37, 99, 235, 0.16)',
  borderRadius: '12px',
  boxShadow: '0 12px 30px rgba(15, 23, 42, 0.05)'
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
