import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { LoginContainer } from '@/pageComponents/login';
import I18nLngSelector from '@/components/Select/I18nLngSelector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { type LoginSuccessResponseType } from '@fastgpt/global/openapi/support/user/account/login/api';
import { OMNICOCKPIT_NAME } from '@/web/common/brand/constants';
import { useTranslation } from 'next-i18next';
import AgentWorkflowVisual from './AgentWorkflowVisual';
import { omniTheme } from '@/web/common/brand/theme';

const loginTheme = omniTheme.login;
const desktopContentScale = {
  base: 'scale(1)',
  lg: `scale(${loginTheme.layout.desktopScaleLg})`,
  xl: `scale(${loginTheme.layout.desktopScaleXl})`
} as const;

type LoginModalProps = {
  onSuccess: (e: LoginSuccessResponseType) => any;
};

const LoginModal = ({ onSuccess }: LoginModalProps) => {
  const { isPc } = useSystem();
  const { t } = useTranslation();

  return (
    <Flex
      w="100%"
      minH="100dvh"
      alignItems="center"
      justifyContent="center"
      overflow={isPc ? 'hidden' : 'visible'}
      bg={loginTheme.surfaceGradient}
      userSelect="none"
    >
      <Flex
        position="relative"
        alignItems="stretch"
        w="100%"
        minW={0}
        minH="100dvh"
        overflow={isPc ? 'hidden' : 'visible'}
        bg={omniTheme.colors.surface}
      >
        {isPc && (
          <Flex
            flex={`0 0 ${loginTheme.layout.brandBasis}`}
            minW="0"
            position="relative"
            alignItems="center"
            justifyContent="center"
            overflow="hidden"
            px="58px"
            background={loginTheme.brandGradient}
            color={omniTheme.colors.surface}
          >
            <Box
              position="absolute"
              right="-190px"
              top="-230px"
              w="520px"
              h="520px"
              borderRadius="full"
              background={loginTheme.brandBlueGlow}
            />
            <Box
              position="absolute"
              left="-150px"
              bottom="-220px"
              w="400px"
              h="400px"
              borderRadius="full"
              background={loginTheme.brandGoldGlow}
            />
            <Box
              position="relative"
              zIndex={1}
              w={loginTheme.layout.brandContentWidth}
              flex="none"
              transform={desktopContentScale}
              transformOrigin="center"
            >
              <Box
                color={loginTheme.blueLight}
                fontSize="10px"
                fontWeight={750}
                lineHeight="14px"
                letterSpacing="0.15em"
              >
                AI AGENT &amp; KNOWLEDGE WORKSPACE
              </Box>
              <Box
                mt="13px"
                color={omniTheme.colors.surface}
                fontSize="38px"
                lineHeight="53.5px"
                fontWeight={820}
                letterSpacing="-0.025em"
              >
                {OMNICOCKPIT_NAME}
              </Box>
              <Box mt="12px" color={loginTheme.onPanelMuted} fontSize="13px" lineHeight={1.7}>
                {t('login:brand_desc')}
              </Box>
              <AgentWorkflowVisual />
            </Box>
          </Flex>
        )}

        <Flex
          position="relative"
          flex="1"
          minW={0}
          alignItems="center"
          justifyContent="center"
          px={isPc ? 0 : loginTheme.layout.mobileSidePadding}
          background={loginTheme.surfaceGradient}
        >
          {isPc && (
            <Box position="absolute" top="24px" right="28px" zIndex={10}>
              <I18nLngSelector />
            </Box>
          )}
          <Box
            w={isPc ? loginTheme.layout.formWidth : '100%'}
            transform={isPc ? desktopContentScale : 'none'}
            transformOrigin="center"
          >
            <LoginContainer onSuccess={onSuccess} />
          </Box>
        </Flex>
      </Flex>
    </Flex>
  );
};

export default LoginModal;
