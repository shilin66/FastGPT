import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { omniTheme } from '@/web/common/brand/theme';
import AgentWorkflowDiagram from './AgentWorkflowDiagram';
import { AgentIcon, WorkflowIcon } from './AgentWorkflowIcons';

const loginTheme = omniTheme.login;

const AgentWorkflowVisual = () => {
  const { t } = useTranslation();

  return (
    <Box position="relative" zIndex={1} mt="27px">
      <Flex
        alignItems="center"
        gap="8px"
        color={loginTheme.onPanelQuiet}
        fontSize="9px"
        fontWeight={700}
        lineHeight="12.5px"
        letterSpacing="0.13em"
      >
        <Box w="6px" h="6px" flex="none" borderRadius="full" bg={omniTheme.colors.gold} />
        COORDINATED INTELLIGENCE
      </Flex>

      <AgentWorkflowDiagram ariaLabel={t('login:brand_visual_aria')} />

      <Flex alignItems="center" gap="8px" mt="12px" aria-label={t('login:brand_visual_aria')}>
        <Flex
          h="34px"
          alignItems="center"
          gap="7px"
          pl="7px"
          pr="12px"
          color={loginTheme.onPanel}
          bg={loginTheme.glassSurface}
          border="1px solid"
          borderColor={loginTheme.goldBorder}
          borderRadius="full"
          boxShadow={`inset 0 1px ${loginTheme.glassHighlight}, 0 8px 18px -16px ${loginTheme.nodeShadow}`}
          fontSize="11px"
        >
          <Flex
            w="20px"
            h="20px"
            alignItems="center"
            justifyContent="center"
            color={loginTheme.goldText}
            bg={loginTheme.goldGlow}
            borderRadius="7px"
          >
            <AgentIcon size="12px" />
          </Flex>
          Agentic
        </Flex>

        <Box w="24px" h="34px" color={loginTheme.blueLight}>
          <svg width="20" height="28" viewBox="0 0 20 28" fill="none" aria-hidden="true">
            <path
              d="M6 3.5V21.5M3.5 19L6 21.5L8.5 19"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M14 24.5V6.5M11.5 9L14 6.5L16.5 9"
              stroke={loginTheme.goldText}
              strokeWidth="1.35"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="2.4 2.8"
            />
            <circle cx="6" cy="3.5" r="1.25" fill="currentColor" />
            <circle cx="14" cy="24.5" r="1.25" fill={loginTheme.goldText} />
          </svg>
        </Box>

        <Flex
          h="34px"
          alignItems="center"
          gap="7px"
          pl="7px"
          pr="12px"
          color={loginTheme.onPanel}
          bg={loginTheme.glassSurface}
          border="1px solid"
          borderColor={loginTheme.agentBorder}
          borderRadius="full"
          boxShadow={`inset 0 1px ${loginTheme.glassHighlight}, 0 8px 18px -16px ${loginTheme.nodeShadow}`}
          fontSize="11px"
        >
          <Flex
            w="20px"
            h="20px"
            alignItems="center"
            justifyContent="center"
            color={loginTheme.blueLight}
            bg={loginTheme.legendBlueFill}
            borderRadius="7px"
          >
            <WorkflowIcon size="12px" />
          </Flex>
          Workflow
        </Flex>
      </Flex>
    </Box>
  );
};

export default AgentWorkflowVisual;
