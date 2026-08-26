import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import type { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { omniTheme } from '@/web/common/brand/theme';

export type ResourceTypeTabValue = AppTypeEnum | 'all';

export type ResourceTypeTabItem = {
  label: string;
  value: ResourceTypeTabValue;
  icon: string;
  activeIcon?: string;
};

const ResourceTypeTabs = ({
  items,
  value,
  onChange
}: {
  items: ResourceTypeTabItem[];
  value: ResourceTypeTabValue;
  onChange: (value: ResourceTypeTabValue) => void;
}) => {
  return (
    <Flex
      mt={4}
      mb={1}
      p={1}
      w={'fit-content'}
      maxW={'100%'}
      flexShrink={0}
      minH={'44px'}
      overflowX={'auto'}
      overflowY={'hidden'}
      alignItems={'center'}
      gap={1}
      border={'1px solid'}
      borderColor={omniTheme.colors.border}
      borderRadius={'12px'}
      bg={'rgba(255, 255, 255, 0.82)'}
      boxShadow={'0 12px 34px -28px rgba(31, 41, 55, 0.3)'}
    >
      {items.map((item) => {
        const isActive = value === item.value;

        return (
          <Flex
            as={'button'}
            type={'button'}
            key={item.value}
            alignItems={'center'}
            justifyContent={'center'}
            flexShrink={0}
            gap={2}
            h={9}
            px={3}
            borderRadius={'9px'}
            cursor={'pointer'}
            whiteSpace={'nowrap'}
            transition={'all 0.16s ease'}
            bg={isActive ? omniTheme.colors.saturatedBlue : 'transparent'}
            color={isActive ? 'white' : omniTheme.colors.muted}
            fontSize={'sm'}
            fontWeight={800}
            _hover={{
              bg: isActive ? omniTheme.colors.saturatedBlue : '#EEF4FF',
              color: isActive ? 'white' : omniTheme.colors.saturatedBlue
            }}
            onClick={() => onChange(item.value)}
          >
            <MyIcon
              name={(isActive && item.activeIcon ? item.activeIcon : item.icon) as any}
              w={'15px'}
              color={'currentColor'}
            />
            <Box>{item.label}</Box>
          </Flex>
        );
      })}
    </Flex>
  );
};

export default ResourceTypeTabs;
