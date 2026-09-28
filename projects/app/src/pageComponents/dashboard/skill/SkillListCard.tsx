import React, { type ReactNode } from 'react';
import { Box, Flex, HStack, LinkBox, LinkOverlay } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import type { SourceMemberType } from '@fastgpt/global/support/user/type';
import { omniTheme } from '@/web/common/brand/theme';

type Props = {
  name: string;
  avatar?: string;
  description?: string;
  isFolder: boolean;
  href: string;
  updateTime: Date;
  sourceMember?: Pick<SourceMemberType, 'name' | 'avatar'>;
  relatedApps?: ReactNode;
  children?: ReactNode;
};

const SkillListCard = ({
  name,
  avatar,
  description,
  isFolder,
  href,
  updateTime,
  sourceMember,
  relatedApps,
  children
}: Props) => {
  const { t } = useTranslation();
  const formattedTime = formatTimeToChatTime(updateTime);
  const timeLabel =
    formattedTime === 'common:just_now' || formattedTime === 'common:yesterday'
      ? t(formattedTime)
      : formattedTime.replace('#', ':');
  return (
    <LinkBox
      as="article"
      pt={3}
      pb={3}
      pl={5}
      pr={4}
      minW={0}
      minH="156px"
      display="flex"
      flexDirection="column"
      border="1px solid"
      borderColor={omniTheme.colors.border}
      borderRadius={omniTheme.radii.lg}
      bg={omniTheme.colors.surface}
      transition="border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease"
      _hover={{
        borderColor: omniTheme.colors.saturatedBlue,
        boxShadow: omniTheme.shadows.card,
        transform: 'translateY(-1px)',
        '& .more': { opacity: 1, pointerEvents: 'auto' }
      }}
      _focusWithin={{
        borderColor: omniTheme.colors.saturatedBlue,
        '& .more': { opacity: 1, pointerEvents: 'auto' }
      }}
    >
      <Flex align="center" gap={3} pb={2.5} borderBottomWidth="1px" borderColor="myGray.150">
        <Box minW={0} flex={1}>
          <Box
            as="h2"
            fontSize="sm"
            fontWeight={800}
            color={omniTheme.colors.text}
            isTruncated
            title={name}
          >
            <LinkOverlay
              as={NextLink}
              href={href}
              color={omniTheme.colors.text}
              _hover={{ textDecoration: 'none' }}
              _focusVisible={{
                outline: 'none',
                _after: {
                  outline: '2px solid',
                  outlineColor: omniTheme.colors.saturatedBlue,
                  borderRadius: omniTheme.radii.lg
                }
              }}
            >
              {name}
            </LinkOverlay>
          </Box>
          <HStack mt={1} spacing={1} color={omniTheme.colors.saturatedBlue} fontSize="11px">
            <MyIcon name={isFolder ? 'common/folderFill' : 'core/skill/default'} w="12px" />
            <Box>{isFolder ? t('common:Folder') : 'Skill'}</Box>
          </HStack>
        </Box>
        {isFolder ? (
          <MyIcon name="common/folderFill" w="30px" color="myGray.500" flexShrink={0} />
        ) : (
          <Avatar
            src={avatar || 'core/skill/default'}
            w="30px"
            h="30px"
            borderRadius={omniTheme.radii.md}
            flexShrink={0}
          />
        )}
      </Flex>
      <Box
        mt={3}
        flex="1 0 38px"
        fontSize="xs"
        color={omniTheme.colors.muted}
        wordBreak="break-word"
      >
        <Box
          className="textEllipsis2"
          noOfLines={2}
          whiteSpace="pre-wrap"
          lineHeight={omniTheme.typography.bodyLineHeight}
        >
          {description || t('common:no_intro')}
        </Box>
      </Box>
      <Flex
        position="relative"
        zIndex={1}
        mt="auto"
        pt={2.5}
        gap={2}
        align="center"
        borderTopWidth="1px"
        borderColor="myGray.150"
        minH="38px"
        fontSize="xs"
        color={omniTheme.colors.muted}
      >
        <Box flex={1} minW={0} overflow="hidden">
          <MyTooltip
            label={
              sourceMember?.name
                ? t('skill:creator_tooltip', { creator: sourceMember.name })
                : undefined
            }
          >
            <Box>
              {sourceMember && (
                <HStack spacing={0.5} minW={0}>
                  <Avatar
                    src={sourceMember.avatar ?? undefined}
                    w="1rem"
                    borderRadius="xs"
                    flexShrink={0}
                  />
                  <Box isTruncated>{sourceMember.name}</Box>
                </HStack>
              )}
            </Box>
          </MyTooltip>
        </Box>
        {!isFolder && (
          <Box position="relative" zIndex={1} flexShrink={0}>
            {relatedApps}
          </Box>
        )}
        <MyTooltip
          label={t('skill:update_time_tooltip', {
            updateTime: `${updateTime.getFullYear()}-${String(updateTime.getMonth() + 1).padStart(2, '0')}-${String(updateTime.getDate()).padStart(2, '0')}`
          })}
        >
          <HStack spacing={0.5} flexShrink={0}>
            <MyIcon name="history" w="0.85rem" color="myGray.400" />
            <Box>{timeLabel}</Box>
          </HStack>
        </MyTooltip>
        {children && (
          <Box
            className="more"
            position="relative"
            zIndex={1}
            flexShrink={0}
            opacity={[1, 0]}
            pointerEvents={['auto', 'none']}
            transition="opacity 0.15s ease"
            _focusWithin={{ opacity: 1, pointerEvents: 'auto' }}
          >
            {children}
          </Box>
        )}
      </Flex>
    </LinkBox>
  );
};

export default SkillListCard;
