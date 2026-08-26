import React, { useCallback, useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { omniTheme } from '@/web/common/brand/theme';
import AgentConfigNav, { type AgentConfigTask } from './AgentConfigNav';

export type { AgentConfigTask } from './AgentConfigNav';

const ParameterChannelGlyph = () => (
  <svg
    aria-hidden={'true'}
    focusable={'false'}
    width={'16'}
    height={'16'}
    viewBox={'0 0 16 16'}
    fill={'none'}
  >
    <path d={'M2 4h12M2 8h12M2 12h12'} stroke={'currentColor'} strokeLinecap={'round'} />
    <circle cx={'5'} cy={'4'} r={'1.5'} fill={omniTheme.colors.surface} stroke={'currentColor'} />
    <circle cx={'11'} cy={'8'} r={'1.5'} fill={omniTheme.colors.surface} stroke={'currentColor'} />
    <circle cx={'7'} cy={'12'} r={'1.5'} fill={omniTheme.colors.surface} stroke={'currentColor'} />
  </svg>
);

const AgentConfigWorkspace = <Key extends string>({
  tasks,
  sectionIds,
  children
}: {
  readonly tasks: readonly AgentConfigTask<Key>[];
  readonly sectionIds: Readonly<Record<Key, string>>;
  readonly children: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const [activeKey, setActiveKey] = useState<Key | undefined>(tasks[0]?.key);

  const syncActiveSection = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const marker = event.currentTarget.getBoundingClientRect().top + 16;
      let nextKey = tasks[0]?.key;

      for (const task of tasks) {
        const section = document.getElementById(sectionIds[task.key]);

        if (!section || section.getBoundingClientRect().top > marker) break;
        nextKey = task.key;
      }

      setActiveKey((currentKey) => (currentKey === nextKey ? currentKey : nextKey));
    },
    [sectionIds, tasks]
  );

  const onSelect = useCallback(
    (key: Key) => {
      setActiveKey(key);
      const section = document.getElementById(sectionIds[key]);
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      section?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start'
      });
    },
    [sectionIds]
  );

  return (
    <Flex
      direction={'column'}
      h={'full'}
      minW={0}
      overflow={'hidden'}
      bg={omniTheme.colors.surface}
    >
      <Flex
        h={omniTheme.layout.agentChannelHeaderHeight}
        minH={omniTheme.layout.agentChannelHeaderHeight}
        alignItems={'center'}
        gap={2}
        px={3.5}
        borderBottom={'1px solid'}
        borderColor={omniTheme.colors.border}
      >
        <Box color={omniTheme.colors.saturatedBlue} lineHeight={0}>
          <ParameterChannelGlyph />
        </Box>
        <Box
          color={omniTheme.colors.graphite}
          fontSize={omniTheme.typography.agentTitle}
          fontWeight={800}
        >
          {t('app:agent_config_channel')}
        </Box>
        <Box color={omniTheme.colors.muted} fontSize={omniTheme.typography.agentCaption}>
          {t('app:agent_config_continuous_view')}
        </Box>
      </Flex>

      <Flex flex={'1 1 0'} minH={0} minW={0} overflow={'hidden'}>
        <AgentConfigNav tasks={tasks} activeKey={activeKey} onSelect={onSelect} />
        <Box
          flex={'1 1 0'}
          minW={0}
          minH={0}
          overflowY={'auto'}
          overflowX={'hidden'}
          onScroll={syncActiveSection}
          sx={{
            scrollbarWidth: 'thin',
            scrollbarColor: `${omniTheme.colors.border} transparent`,
            '&::-webkit-scrollbar-thumb': { bg: omniTheme.colors.border }
          }}
        >
          {children}
        </Box>
      </Flex>
    </Flex>
  );
};

export default React.memo(AgentConfigWorkspace) as typeof AgentConfigWorkspace;
