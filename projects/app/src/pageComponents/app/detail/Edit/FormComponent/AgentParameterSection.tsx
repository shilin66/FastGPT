import React from 'react';
import { Box, Flex, Grid } from '@chakra-ui/react';
import { omniTheme } from '@/web/common/brand/theme';

type AgentParameterSectionProps = {
  readonly id: string;
  readonly chapter: string;
  readonly title: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly onMouseEnter?: () => void;
  readonly children: React.ReactNode;
};

export const AgentParameterSection = ({
  id,
  chapter,
  title,
  description,
  onMouseEnter,
  children
}: AgentParameterSectionProps) => {
  return (
    <Box
      as={'section'}
      id={id}
      scrollMarginTop={'12px'}
      bg={omniTheme.colors.surface}
      borderBottom={'1px solid'}
      borderColor={omniTheme.colors.border}
      onMouseEnter={onMouseEnter}
    >
      <Flex
        minH={omniTheme.layout.agentSectionMinHeight}
        alignItems={'center'}
        gap={3}
        px={[4, 5]}
        py={2.5}
        bg={omniTheme.colors.surface}
        borderBottom={'1px solid'}
        borderColor={omniTheme.colors.border}
      >
        <Box
          w={omniTheme.layout.agentChapterWidth}
          flexShrink={0}
          color={omniTheme.colors.saturatedBlue}
          fontFamily={'mono'}
          fontSize={omniTheme.typography.agentMicro}
          fontWeight={800}
          sx={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {chapter}
        </Box>

        <Box minW={0} flex={1}>
          <Box
            color={omniTheme.colors.graphite}
            fontSize={omniTheme.typography.agentTitle}
            fontWeight={800}
            lineHeight={omniTheme.typography.tightLineHeight}
          >
            {title}
          </Box>
          {!!description && (
            <Box
              mt={0.5}
              color={omniTheme.colors.muted}
              fontSize={omniTheme.typography.agentCaption}
              lineHeight={omniTheme.typography.bodyLineHeight}
              noOfLines={1}
            >
              {description}
            </Box>
          )}
        </Box>
      </Flex>

      <Box px={[4, 5]}>{children}</Box>
    </Box>
  );
};

type AgentParameterRowProps = {
  readonly label: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly action?: React.ReactNode;
  readonly align?: 'center' | 'start';
  readonly children: React.ReactNode;
};

export const AgentParameterRow = ({
  label,
  description,
  action,
  align = 'center',
  children
}: AgentParameterRowProps) => {
  return (
    <Grid
      gridTemplateColumns={omniTheme.layout.agentRowColumns}
      alignItems={align === 'start' ? 'start' : 'center'}
      columnGap={4}
      minH={omniTheme.layout.agentSectionMinHeight}
      py={3}
      borderBottom={'1px solid'}
      borderColor={omniTheme.colors.border}
      _last={{ borderBottom: 0 }}
    >
      <Box minW={0} pt={align === 'start' ? 1 : 0}>
        <Box
          color={omniTheme.colors.graphite}
          fontSize={omniTheme.typography.agentBody}
          fontWeight={750}
          lineHeight={omniTheme.typography.bodyLineHeight}
        >
          {label}
        </Box>
        {!!description && (
          <Box
            mt={0.5}
            color={omniTheme.colors.muted}
            fontSize={omniTheme.typography.agentMicro}
            lineHeight={omniTheme.typography.bodyLineHeight}
          >
            {description}
          </Box>
        )}
      </Box>
      <Box minW={0}>{children}</Box>
      {!!action && (
        <Flex
          minH={omniTheme.layout.agentActionMinHeight}
          alignItems={'center'}
          justifyContent={'flex-end'}
        >
          {action}
        </Flex>
      )}
    </Grid>
  );
};
