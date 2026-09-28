import React from 'react';
import { Box, Button, Flex, Text } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext } from '../context';
import { useTranslation } from 'next-i18next';
import { useSandboxProxySession } from './useSandboxProxySession';

const SandboxIframe = () => {
  const sandboxEndpointUrl = useContextSelector(SkillDetailContext, (v) => v.sandboxEndpointUrl);
  const { t } = useTranslation();
  const { frameRef, requestUrl, state, renew } = useSandboxProxySession(sandboxEndpointUrl);
  if (!sandboxEndpointUrl) return null;

  return (
    <Flex w={'100%'} h={'100%'} flexDirection={'column'}>
      <Flex px={3} py={1} gap={2} alignItems={'center'} flexWrap={'wrap'} borderBottom={'base'}>
        <Text
          flex={1}
          fontSize={'xs'}
          color={state === 'failed' ? 'red.600' : 'myGray.600'}
          role={'status'}
          aria-live={'polite'}
        >
          {state === 'failed'
            ? t('skill:sandbox_session_failed')
            : state === 'renewing'
              ? t('skill:sandbox_session_renewing')
              : state === 'active'
                ? t('skill:sandbox_session_active')
                : t('skill:sandbox_session_connecting')}
        </Text>
        {state === 'failed' && (
          <Button
            as={'a'}
            href={'/login'}
            target={'_blank'}
            rel={'noopener noreferrer'}
            size={'xs'}
            variant={'whiteBase'}
          >
            {t('skill:sandbox_session_login')}
          </Button>
        )}
        <Button size={'xs'} variant={'whiteBase'} onClick={renew} isDisabled={state === 'renewing'}>
          {t('skill:sandbox_session_renew')}
        </Button>
      </Flex>
      <Box flex={1} minH={0}>
        <iframe
          src={sandboxEndpointUrl}
          onLoad={renew}
          title="Skill workspace editor"
          sandbox="allow-scripts allow-forms allow-popups allow-downloads allow-presentation allow-same-origin"
          referrerPolicy="no-referrer"
          style={{
            width: '100%',
            height: '100%',
            border: 'none'
          }}
        />
      </Box>
      {requestUrl && (
        <iframe
          ref={frameRef}
          src={requestUrl}
          title="Skill workspace authentication"
          hidden
          aria-hidden="true"
          tabIndex={-1}
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="same-origin"
        />
      )}
    </Flex>
  );
};

export default React.memo(SandboxIframe);
