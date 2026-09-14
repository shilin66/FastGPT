import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { omniTheme } from '@/web/common/brand/theme';
import { AgentIcon, WorkflowIcon } from './AgentWorkflowIcons';

const loginTheme = omniTheme.login;
const nodes = [
  { label: 'Knowledge', color: loginTheme.nodeBlue, top: '126px', left: '18px', w: '108px' },
  { label: 'Context', color: loginTheme.nodeViolet, top: '126px', right: '12px', w: '90px' },
  { label: 'Condition', color: loginTheme.nodeGreen, top: '245px', left: '46px', w: '100px' },
  { label: 'Action', color: loginTheme.nodeOrange, top: '245px', right: '42px', w: '82px' }
] as const;

type ConnectionDot = readonly [number, number, string];

const connectionDots = [
  [126, 144, loginTheme.nodeBlue],
  [442, 144, loginTheme.nodeViolet],
  [146, 263, loginTheme.nodeGreen],
  [420, 263, loginTheme.nodeOrange],
  [204, 96, loginTheme.blueLight],
  [340, 96, loginTheme.blueLight],
  [184, 245, loginTheme.blueLight],
  [360, 245, loginTheme.blueLight]
] satisfies readonly ConnectionDot[];

const AgentWorkflowDiagram = ({ ariaLabel }: { ariaLabel: string }) => (
  <Box position="relative" w="544px" h="320px" role="img" aria-label={ariaLabel}>
    <Box
      as="svg"
      position="absolute"
      zIndex={0}
      inset={0}
      w="100%"
      h="100%"
      overflow="visible"
      viewBox="0 0 544 320"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="login-top-left" x1="118" y1="144" x2="210" y2="92">
          <stop stopColor={loginTheme.nodeBlue} stopOpacity="0.22" />
          <stop offset="1" stopColor={loginTheme.blueLight} stopOpacity="0.88" />
        </linearGradient>
        <linearGradient id="login-top-right" x1="432" y1="144" x2="334" y2="92">
          <stop stopColor={loginTheme.nodeViolet} stopOpacity="0.22" />
          <stop offset="1" stopColor={loginTheme.blueLight} stopOpacity="0.88" />
        </linearGradient>
        <linearGradient id="login-bottom-left" x1="146" y1="263" x2="190" y2="243">
          <stop stopColor={loginTheme.nodeGreen} stopOpacity="0.25" />
          <stop offset="1" stopColor={loginTheme.blueLight} stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="login-bottom-right" x1="428" y1="263" x2="354" y2="243">
          <stop stopColor={loginTheme.nodeOrange} stopOpacity="0.25" />
          <stop offset="1" stopColor={loginTheme.blueLight} stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="login-down-lane" x1="0" y1="128" x2="0" y2="204">
          <stop stopColor={loginTheme.blueLight} stopOpacity="0.32" />
          <stop offset="1" stopColor={loginTheme.blueLight} stopOpacity="0.92" />
        </linearGradient>
        <linearGradient id="login-up-lane" x1="0" y1="204" x2="0" y2="128">
          <stop stopColor={omniTheme.colors.gold} stopOpacity="0.35" />
          <stop offset="1" stopColor={loginTheme.goldText} stopOpacity="0.92" />
        </linearGradient>
        <filter id="login-soft-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <marker
          id="login-arrow-down"
          markerWidth="8"
          markerHeight="8"
          refX="6.5"
          refY="4"
          orient="auto"
        >
          <path d="M0 0L7 3.5L0 7L1.7 3.5Z" fill={loginTheme.blueLight} />
        </marker>
        <marker
          id="login-arrow-up"
          markerWidth="8"
          markerHeight="8"
          refX="6.5"
          refY="4"
          orient="auto"
        >
          <path d="M0 0L7 3.5L0 7L1.7 3.5Z" fill={loginTheme.goldText} />
        </marker>
      </defs>

      <g strokeLinecap="round">
        <path
          d="M126 144C164 144 170 96 204 96"
          stroke={loginTheme.agentLineMuted}
          strokeWidth="7"
        />
        <path
          d="M442 144C400 144 374 96 340 96"
          stroke={loginTheme.agentLineMuted}
          strokeWidth="7"
        />
        <path
          d="M146 263C166 263 172 245 184 245"
          stroke={loginTheme.agentLineQuiet}
          strokeWidth="7"
        />
        <path
          d="M420 263C392 263 379 245 360 245"
          stroke={loginTheme.agentLineQuiet}
          strokeWidth="7"
        />
        <path d="M126 144C164 144 170 96 204 96" stroke="url(#login-top-left)" strokeWidth="1.8" />
        <path d="M442 144C400 144 374 96 340 96" stroke="url(#login-top-right)" strokeWidth="1.8" />
        <path
          d="M146 263C166 263 172 245 184 245"
          stroke="url(#login-bottom-left)"
          strokeWidth="1.8"
        />
        <path
          d="M420 263C392 263 379 245 360 245"
          stroke="url(#login-bottom-right)"
          strokeWidth="1.8"
        />
        <path
          d="M262 128C258 150 258 182 262 204"
          stroke={loginTheme.agentLineMuted}
          strokeWidth="6"
        />
        <path d="M282 204C286 182 286 150 282 128" stroke={loginTheme.goldGlow} strokeWidth="6" />
        <path
          d="M262 128C258 150 258 182 262 204"
          stroke="url(#login-down-lane)"
          strokeWidth="1.9"
          markerEnd="url(#login-arrow-down)"
        />
        <path
          d="M282 204C286 182 286 150 282 128"
          stroke="url(#login-up-lane)"
          strokeWidth="1.9"
          strokeDasharray="3.5 5.5"
          markerEnd="url(#login-arrow-up)"
        />
      </g>

      <g filter="url(#login-soft-glow)">
        {connectionDots.map(([cx, cy, fill]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.5" fill={fill} />
        ))}
        <circle cx="262" cy="128" r="2.2" fill={loginTheme.blueLight} />
        <circle cx="282" cy="204" r="2.2" fill={loginTheme.goldText} />
      </g>
    </Box>

    <Flex
      position="absolute"
      zIndex={2}
      top="34px"
      left="204px"
      w="136px"
      h="94px"
      direction="column"
      alignItems="center"
      justifyContent="center"
      color={omniTheme.colors.surface}
      bg={loginTheme.glassFill}
      border="1px solid"
      borderColor={loginTheme.goldBorder}
      borderRadius="16px"
      boxShadow={`0 0 42px ${loginTheme.goldGlow}, inset 0 1px ${loginTheme.glassHighlight}`}
    >
      <Box color={omniTheme.colors.gold} lineHeight={0}>
        <AgentIcon size="25px" />
      </Box>
      <Box mt="5px" fontSize="15px" fontWeight={700}>
        Agentic
      </Box>
    </Flex>

    <Flex
      position="absolute"
      zIndex={2}
      top="204px"
      left="184px"
      w="176px"
      h="82px"
      direction="column"
      alignItems="center"
      justifyContent="center"
      color={omniTheme.colors.surface}
      bg={loginTheme.glassFill}
      border="1px solid"
      borderColor={loginTheme.agentBorder}
      borderRadius="16px"
      boxShadow={`0 0 46px ${loginTheme.agentGlow}, inset 0 1px ${loginTheme.glassHighlight}`}
    >
      <Box color={loginTheme.blueLight} lineHeight={0}>
        <WorkflowIcon size="25px" />
      </Box>
      <Box mt="5px" fontSize="15px" fontWeight={700}>
        Workflow
      </Box>
    </Flex>

    {nodes.map((node) => (
      <Flex
        key={node.label}
        position="absolute"
        zIndex={2}
        top={node.top}
        left={'left' in node ? node.left : undefined}
        right={'right' in node ? node.right : undefined}
        w={node.w}
        h="36px"
        alignItems="center"
        gap="8px"
        px="14px"
        color={loginTheme.onPanel}
        bg={loginTheme.glassNode}
        border="1px solid"
        borderColor={loginTheme.glassBorder}
        borderRadius="10px"
        boxShadow={`0 10px 22px -18px ${loginTheme.nodeShadow}`}
        fontSize="12px"
        whiteSpace="nowrap"
      >
        <Box
          w="8px"
          h="8px"
          flex="none"
          borderRadius="full"
          bg={node.color}
          boxShadow={`0 0 10px ${node.color}`}
        />
        {node.label}
      </Flex>
    ))}
  </Box>
);

export default AgentWorkflowDiagram;
