import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { SystemPluginToolTagType } from '@fastgpt/global/core/plugin/type';
import React, { useMemo } from 'react';
import MyIcon from '../../../common/Icon';
import MyPopover from '../../../common/MyPopover';

const ToolTagFilterBox = ({
  tags,
  selectedTagIds,
  onTagSelect,
  size = 'base',
  variant = 'inline'
}: {
  tags: SystemPluginToolTagType[];
  selectedTagIds: string[];
  onTagSelect: (tagIds: string[]) => void;
  size?: 'base' | 'sm';
  variant?: 'inline' | 'compactMenu';
}) => {
  const { t, i18n } = useTranslation();

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onTagSelect(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onTagSelect([...selectedTagIds, tagId]);
    }
  };

  const tagBaseStyles = useMemo(() => {
    const sizeStyles = {
      base: {
        px: 3,
        py: 1.5,
        fontSize: 'sm'
      },
      sm: {
        px: 2,
        py: 1,
        fontSize: 'xs'
      }
    };

    return {
      ...sizeStyles[size],
      fontWeight: 'medium',
      color: 'myGray.700',
      border: '1px solid',
      borderColor: 'myGray.200',
      whiteSpace: 'nowrap',
      flexShrink: 0,
      cursor: 'pointer'
    };
  }, [size]);

  if (variant === 'compactMenu') {
    const selectedText =
      selectedTagIds.length === 0
        ? t('common:All')
        : t('common:selected_count', { count: selectedTagIds.length });

    return (
      <MyPopover
        trigger={'click'}
        placement={'bottom-start'}
        closeOnBlur={true}
        hasArrow={false}
        w={'240px'}
        maxW={'calc(100vw - 24px)'}
        borderRadius={'8px'}
        Trigger={
          <Flex
            as={'button'}
            type={'button'}
            w={'100%'}
            h={'36px'}
            px={2.5}
            alignItems={'center'}
            gap={2}
            border={'1px solid'}
            borderColor={selectedTagIds.length > 0 ? '#9DB9FA' : '#DCE3ED'}
            borderRadius={'7px'}
            color={'#27364A'}
            bg={selectedTagIds.length > 0 ? '#F5F8FF' : '#F8FAFC'}
            cursor={'pointer'}
            transition={'border-color .18s ease, background-color .18s ease'}
            _hover={{ borderColor: '#9DB9FA', bg: '#F5F8FF' }}
            _focusVisible={{ outline: '2px solid #93B4FF', outlineOffset: '1px' }}
            aria-label={`${t('common:tag_filter')}: ${selectedText}`}
          >
            <MyIcon name={'core/dataset/tag'} w={'14px'} color={'#2563EB'} flexShrink={0} />
            <Box fontSize={'11px'} fontWeight={850}>
              {t('common:tag_filter')}
            </Box>
            <Box
              ml={'auto'}
              minW={0}
              maxW={'88px'}
              color={selectedTagIds.length > 0 ? '#2563EB' : '#667085'}
              fontSize={'10px'}
              fontWeight={800}
              className={'textEllipsis'}
            >
              {selectedText}
            </Box>
            <MyIcon name={'core/chat/chevronDown'} w={'13px'} color={'#7A8699'} flexShrink={0} />
          </Flex>
        }
      >
        {() => (
          <Box p={2}>
            <Flex h={'34px'} px={2} alignItems={'center'} borderBottom={'1px solid #EDF1F6'}>
              <Box color={'#27364A'} fontSize={'11px'} fontWeight={900}>
                {t('common:tag_filter')}
              </Box>
              <Box ml={'auto'} color={'#7A8699'} fontSize={'9px'} fontWeight={750}>
                {selectedText}
              </Box>
            </Flex>

            <Box
              mt={1}
              maxH={'252px'}
              overflowY={'auto'}
              pr={1}
              css={{
                '&::-webkit-scrollbar': { width: '4px' },
                '&::-webkit-scrollbar-thumb': {
                  background: '#CBD5E1',
                  borderRadius: '4px'
                }
              }}
            >
              {[
                { tagId: '', label: t('common:All') },
                ...tags.map((tag) => ({
                  tagId: tag.tagId,
                  label: t(parseI18nString(tag.tagName, i18n.language))
                }))
              ].map((tag) => {
                const isSelected =
                  tag.tagId === ''
                    ? selectedTagIds.length === 0
                    : selectedTagIds.includes(tag.tagId);

                return (
                  <Flex
                    as={'button'}
                    type={'button'}
                    key={tag.tagId || 'all'}
                    w={'100%'}
                    minH={'36px'}
                    px={2}
                    alignItems={'center'}
                    gap={2.5}
                    borderRadius={'6px'}
                    color={isSelected ? '#1D4ED8' : '#344054'}
                    bg={isSelected ? '#EFF6FF' : 'transparent'}
                    cursor={'pointer'}
                    _hover={{ bg: isSelected ? '#E7F0FF' : '#F6F8FB' }}
                    _focusVisible={{ outline: '2px solid #93B4FF', outlineOffset: '-2px' }}
                    aria-pressed={isSelected}
                    onClick={() => (tag.tagId ? toggleTag(tag.tagId) : onTagSelect([]))}
                  >
                    <Flex
                      w={'16px'}
                      h={'16px'}
                      flexShrink={0}
                      alignItems={'center'}
                      justifyContent={'center'}
                      border={'1px solid'}
                      borderColor={isSelected ? '#2563EB' : '#C9D3E1'}
                      borderRadius={'5px'}
                      bg={isSelected ? '#2563EB' : 'white'}
                    >
                      {isSelected && <MyIcon name={'common/check'} w={'10px'} color={'white'} />}
                    </Flex>
                    <Box
                      minW={0}
                      flex={1}
                      textAlign={'left'}
                      fontSize={'11px'}
                      fontWeight={isSelected ? 850 : 700}
                      className={'textEllipsis'}
                    >
                      {tag.label}
                    </Box>
                  </Flex>
                );
              })}
            </Box>
          </Box>
        )}
      </MyPopover>
    );
  }

  return (
    <Flex
      alignItems={'center'}
      userSelect={'none'}
      overflow={'auto'}
      pb={1}
      css={{
        '&:hover': {
          overflow: 'auto',
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '3px',
            visibility: 'visible'
          }
        },
        '&::-webkit-scrollbar': {
          marginTop: '2px',
          height: '6px'
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent'
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'rgba(0, 0, 0, 0)',
          borderRadius: '3px',
          visibility: 'hidden'
        },
        '&::-webkit-scrollbar-thumb:hover': {
          background: 'rgba(0, 0, 0, 0.3)'
        }
      }}
    >
      <Box
        {...tagBaseStyles}
        rounded={'sm'}
        bg={selectedTagIds.length === 0 ? 'myGray.150' : 'transparent'}
        onClick={() => onTagSelect([])}
      >
        {t('common:All')}
      </Box>
      <Box mx={2} h={'20px'} w={'1px'} bg={'myGray.200'} flexShrink={0} />
      <Box flex={1}>
        <Flex gap={2} flexWrap="nowrap">
          {tags.map((tag) => {
            const isSelected = selectedTagIds.includes(tag.tagId);
            return (
              <Box
                key={tag.tagId}
                {...tagBaseStyles}
                rounded={'full'}
                bg={isSelected ? 'myGray.150 !important' : 'transparent'}
                onClick={() => toggleTag(tag.tagId)}
              >
                {t(parseI18nString(tag.tagName, i18n.language))}
              </Box>
            );
          })}
        </Flex>
      </Box>
    </Flex>
  );
};

export default React.memo(ToolTagFilterBox);
