import React, { useCallback, useEffect, useId, useState } from 'react';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { omniTheme } from '@/web/common/brand/theme';

const CONFIG_NAV_COLLAPSED_KEY = 'omni_agent_config_nav_collapsed';

export type AgentConfigTask<Key extends string> = {
  readonly key: Key;
  readonly label: string;
};

const AgentConfigNav = <Key extends string>({
  tasks,
  activeKey,
  onSelect
}: {
  readonly tasks: readonly AgentConfigTask<Key>[];
  readonly activeKey?: Key;
  readonly onSelect: (key: Key) => void;
}) => {
  const { t } = useTranslation();
  const navId = useId();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    setIsCollapsed(localStorage.getItem(CONFIG_NAV_COLLAPSED_KEY) === '1');
  }, []);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((currentState) => {
      const nextState = !currentState;
      localStorage.setItem(CONFIG_NAV_COLLAPSED_KEY, nextState ? '1' : '0');
      return nextState;
    });
  }, []);

  return (
    <Flex
      id={navId}
      as={'nav'}
      aria-label={String(t('app:agent_config_map'))}
      direction={'column'}
      w={
        isCollapsed
          ? omniTheme.layout.agentNavCollapsedWidth
          : omniTheme.layout.agentNavExpandedWidth
      }
      minW={
        isCollapsed
          ? omniTheme.layout.agentNavCollapsedWidth
          : omniTheme.layout.agentNavExpandedWidth
      }
      h={'full'}
      overflow={'hidden'}
      bg={omniTheme.colors.surface}
      borderRight={'1px solid'}
      borderColor={omniTheme.colors.border}
    >
      <Flex
        h={omniTheme.layout.agentNavHeaderHeight}
        minH={omniTheme.layout.agentNavHeaderHeight}
        alignItems={'center'}
        justifyContent={isCollapsed ? 'center' : 'space-between'}
        px={isCollapsed ? 2 : 3}
      >
        {!isCollapsed && (
          <Box
            color={omniTheme.colors.muted}
            fontSize={omniTheme.typography.agentMicro}
            fontWeight={800}
            letterSpacing={'0.12em'}
          >
            {t('app:agent_config_map')}
          </Box>
        )}
        <MyTooltip
          label={t(
            isCollapsed
              ? 'app:agent_config_expand_navigation'
              : 'app:agent_config_collapse_navigation'
          )}
          placement={'right'}
        >
          <IconButton
            aria-label={String(
              t(
                isCollapsed
                  ? 'app:agent_config_expand_navigation'
                  : 'app:agent_config_collapse_navigation'
              )
            )}
            aria-controls={navId}
            aria-expanded={!isCollapsed}
            size={'sm'}
            minW={8}
            w={8}
            h={8}
            borderRadius={omniTheme.radii.md}
            variant={'whiteBase'}
            bg={omniTheme.colors.surface}
            border={'1px solid'}
            borderColor={omniTheme.colors.border}
            color={omniTheme.colors.muted}
            _hover={{
              color: omniTheme.colors.saturatedBlue,
              borderColor: omniTheme.colors.saturatedBlue
            }}
            _focusVisible={{ boxShadow: `0 0 0 2px ${omniTheme.colors.saturatedBlueSoft}` }}
            icon={
              <MyIcon name={isCollapsed ? 'common/arrowRight' : 'common/arrowLeft'} w={'14px'} />
            }
            onClick={toggleCollapsed}
          />
        </MyTooltip>
      </Flex>

      <Flex direction={'column'} gap={1} px={isCollapsed ? 2 : 2.5}>
        {tasks.map((task, index) => {
          const isActive = activeKey === task.key;
          const number = String(index + 1).padStart(2, '0');
          const taskButton = (
            <Flex
              key={task.key}
              as={'button'}
              type={'button'}
              aria-label={task.label}
              aria-current={isActive ? 'location' : undefined}
              position={'relative'}
              alignItems={'center'}
              justifyContent={isCollapsed ? 'center' : 'flex-start'}
              gap={2}
              w={'full'}
              minH={omniTheme.layout.agentNavItemMinHeight}
              px={isCollapsed ? 0 : 2}
              borderRadius={omniTheme.radii.sm}
              color={isActive ? omniTheme.colors.saturatedBlue : omniTheme.colors.muted}
              bg={isActive ? omniTheme.colors.pageBg : 'transparent'}
              textAlign={'left'}
              transition={omniTheme.motion.control}
              _hover={{
                color: isActive ? omniTheme.colors.saturatedBlue : omniTheme.colors.graphite,
                bg: omniTheme.colors.pageBg
              }}
              _focusVisible={{ boxShadow: `0 0 0 2px ${omniTheme.colors.saturatedBlueSoft}` }}
              _before={{
                content: '""',
                position: 'absolute',
                top: 2,
                bottom: 2,
                left: isCollapsed ? '-8px' : '-10px',
                w: '2px',
                bg: isActive ? omniTheme.colors.saturatedBlue : 'transparent'
              }}
              onClick={() => onSelect(task.key)}
            >
              <Box
                flexShrink={0}
                color={'currentColor'}
                fontFamily={'mono'}
                fontSize={omniTheme.typography.agentMicro}
                fontWeight={700}
              >
                {number}
              </Box>
              {!isCollapsed && (
                <Box
                  minW={0}
                  noOfLines={1}
                  fontSize={omniTheme.typography.agentBody}
                  fontWeight={700}
                >
                  {task.label}
                </Box>
              )}
            </Flex>
          );

          return isCollapsed ? (
            <MyTooltip key={task.key} label={task.label} placement={'right'}>
              {taskButton}
            </MyTooltip>
          ) : (
            taskButton
          );
        })}
      </Flex>
    </Flex>
  );
};

export default React.memo(AgentConfigNav) as typeof AgentConfigNav;
