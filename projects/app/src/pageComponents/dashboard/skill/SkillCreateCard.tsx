import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { omniTheme } from '@/web/common/brand/theme';

const SkillCreateCard = ({
  parentId,
  isEmpty = false
}: {
  parentId: string | null;
  isEmpty?: boolean;
}) => {
  const { t } = useTranslation();

  return (
    <Box
      as={NextLink}
      href={parentId ? `/skill/create?parentId=${encodeURIComponent(parentId)}` : '/skill/create'}
      aria-label={t('skill:create_skill')}
      pt={3}
      pb={3}
      pl={5}
      pr={4}
      mt={isEmpty ? 4 : 0}
      minH={isEmpty ? '164px' : '156px'}
      minW={0}
      display={'flex'}
      flexDirection={'column'}
      justifyContent={isEmpty ? 'center' : undefined}
      border={'1px solid'}
      borderColor={omniTheme.colors.border}
      borderRadius={omniTheme.radii.lg}
      bg={omniTheme.colors.surface}
      color={omniTheme.colors.text}
      transition={'border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease'}
      _hover={{
        textDecoration: 'none',
        borderColor: omniTheme.colors.saturatedBlue,
        boxShadow: omniTheme.shadows.card,
        transform: 'translateY(-1px)'
      }}
      _focusVisible={{
        outline: '2px solid',
        outlineColor: omniTheme.colors.saturatedBlue,
        outlineOffset: '2px'
      }}
    >
      <Flex
        alignItems={'center'}
        justifyContent={isEmpty ? 'center' : 'space-between'}
        gap={3}
        pb={2.5}
        borderBottomWidth={isEmpty ? 0 : '1px'}
        borderColor={'myGray.150'}
      >
        <Box>
          <Box fontSize={isEmpty ? '24px' : 'sm'} fontWeight={800}>
            {isEmpty ? t('skill:create_skill') : t('common:new_create')}
          </Box>
          {!isEmpty && (
            <Box mt={1} color={omniTheme.colors.saturatedBlue} fontSize={'11px'} fontWeight={800}>
              Skill
            </Box>
          )}
        </Box>
        {!isEmpty && (
          <Flex
            w={'34px'}
            h={'34px'}
            alignItems={'center'}
            justifyContent={'center'}
            borderRadius={omniTheme.radii.md}
            bg={omniTheme.colors.saturatedBlueSoft}
          >
            <MyIcon name={'common/addLight'} w={5} color={omniTheme.colors.saturatedBlue} />
          </Flex>
        )}
      </Flex>
      <Flex
        mt={3}
        mb={2}
        flex={isEmpty ? undefined : '1 0 56px'}
        h={isEmpty ? 14 : undefined}
        w={isEmpty ? '330px' : '100%'}
        maxW={'100%'}
        alignSelf={'center'}
        alignItems={'center'}
        justifyContent={'center'}
        border={'1px dashed'}
        borderColor={omniTheme.colors.saturatedBlue}
        borderRadius={omniTheme.radii.lg}
      >
        <MyIcon name={'common/addLight'} w={8} color={omniTheme.colors.saturatedBlue} />
      </Flex>
    </Box>
  );
};

export default React.memo(SkillCreateCard);
