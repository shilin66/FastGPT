import React, { type ReactNode } from 'react';
import { Box, Button, Flex, Spinner, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useSandboxProxySession } from './useSandboxProxySession';
import PaneActionButton from '@/components/common/PaneActionButton';
import { omniTheme } from '@/web/common/brand/theme';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useWorkbenchLoading } from './useWorkbenchLoading';

const sessionStyles = {
  idle: {
    label: 'skill:sandbox_status_connecting',
    message: 'skill:sandbox_session_connecting',
    color: 'myGray.600',
    bg: 'myGray.100'
  },
  renewing: {
    label: 'skill:sandbox_status_renewing',
    message: 'skill:sandbox_session_renewing',
    color: 'primary.600',
    bg: 'primary.50'
  },
  active: {
    label: 'skill:sandbox_status_active',
    message: 'skill:sandbox_session_active',
    color: 'green.600',
    bg: 'green.50'
  },
  failed: {
    label: 'skill:sandbox_status_failed',
    message: 'skill:sandbox_session_failed',
    color: 'red.600',
    bg: 'red.50'
  }
} as const;

const SandboxIDE = ({
  entryUrl,
  title,
  toolbar,
  actions
}: {
  readonly entryUrl: string;
  readonly title: string;
  readonly toolbar?: ReactNode;
  readonly actions?: ReactNode;
}) => {
  const { t } = useTranslation();
  const { frameRef, requestUrl, state, renew, fail } = useSandboxProxySession(entryUrl);
  const { editorRef, phase, onDocumentLoad, onError } = useWorkbenchLoading(entryUrl);
  const isLoading = phase === 'loading' || phase === 'starting' || phase === 'slow';
  const status =
    state === 'active' && isLoading
      ? ({
          label: 'skill:sandbox_status_loading',
          message: 'skill:sandbox_editor_starting_description',
          color: 'primary.600',
          bg: 'primary.50'
        } as const)
      : sessionStyles[state];

  return (
    <Flex w={'full'} h={'full'} direction={'column'} minW={0} minH={0}>
      <Flex
        px={4}
        py={2}
        gap={3}
        align={'center'}
        flexWrap={'wrap'}
        borderBottom={'base'}
        bg={'myGray.50'}
        sx={
          toolbar
            ? { '@container (max-width: 540px)': { '& > :first-of-type': { flexBasis: '100%' } } }
            : undefined
        }
      >
        {toolbar}
        <Flex ml={'auto'} gap={2} align={'center'} flexShrink={0}>
          <MyTooltip label={t(status.message)} shouldWrapChildren={false}>
            <Flex
              gap={2}
              align={'center'}
              px={2.5}
              py={1}
              borderRadius={'full'}
              bg={status.bg}
              color={status.color}
              role={'status'}
              aria-live={'polite'}
            >
              <Box w={'6px'} h={'6px'} borderRadius={'full'} bg={'currentColor'} aria-hidden />
              <Text fontSize={'xs'} fontWeight={500} whiteSpace={'nowrap'}>
                {t(status.label)}
              </Text>
            </Flex>
          </MyTooltip>
          <PaneActionButton
            action={'refresh'}
            label={String(t('skill:sandbox_session_renew'))}
            onClick={renew}
            isDisabled={state === 'renewing'}
          />
          {actions}
        </Flex>
      </Flex>
      {state === 'failed' && (
        <Flex
          px={4}
          py={2}
          gap={3}
          align={'center'}
          flexWrap={'wrap'}
          bg={'red.50'}
          borderBottom={'base'}
          role={'alert'}
        >
          <Text
            flex={1}
            minW={'200px'}
            fontSize={'xs'}
            lineHeight={omniTheme.typography.bodyLineHeight}
            color={'red.600'}
            sx={{ textWrap: 'pretty' }}
          >
            {t('skill:sandbox_session_failed')}
          </Text>
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
        </Flex>
      )}
      <Box flex={1} minH={0} position={'relative'}>
        <iframe
          ref={editorRef}
          src={entryUrl}
          title={title}
          onLoad={() => {
            onDocumentLoad();
            renew();
          }}
          onError={() => {
            onError();
            fail();
          }}
          sandbox="allow-scripts allow-forms allow-popups allow-downloads allow-presentation allow-same-origin"
          referrerPolicy="no-referrer"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
        {isLoading && (
          <Flex
            position={'absolute'}
            inset={0}
            bg={'myGray.50'}
            align={'center'}
            justify={'center'}
            direction={'column'}
            gap={4}
            px={6}
            role={'status'}
            aria-live={'polite'}
          >
            <Flex
              w={'56px'}
              h={'56px'}
              align={'center'}
              justify={'center'}
              bg={'white'}
              border={'base'}
              borderRadius={'16px'}
              boxShadow={'sm'}
            >
              <Spinner size={'md'} color={'primary.500'} thickness={'2px'} speed={'0.8s'} />
            </Flex>
            <Box textAlign={'center'} maxW={'360px'}>
              <Text fontSize={'md'} fontWeight={600} color={'myGray.900'} mb={2}>
                {t(
                  phase === 'slow'
                    ? 'skill:sandbox_editor_slow'
                    : phase === 'starting' || state === 'active'
                      ? 'skill:sandbox_editor_starting'
                      : 'skill:sandbox_editor_loading'
                )}
              </Text>
              <Text fontSize={'sm'} color={'myGray.600'} lineHeight={'1.7'}>
                {t(
                  phase === 'slow'
                    ? 'skill:sandbox_editor_slow_description'
                    : phase === 'starting' || state === 'active'
                      ? 'skill:sandbox_editor_starting_description'
                      : 'skill:sandbox_editor_loading_description'
                )}
              </Text>
            </Box>
            {phase === 'slow' && (
              <Button
                as={'a'}
                href={entryUrl}
                target={'_blank'}
                rel={'noopener noreferrer'}
                variant={'whiteBase'}
                size={'sm'}
              >
                {t('skill:sandbox_editor_open_tab')}
              </Button>
            )}
          </Flex>
        )}
      </Box>
      {requestUrl && (
        <iframe
          ref={frameRef}
          src={requestUrl}
          title={title.replace('editor', 'authentication')}
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

export default React.memo(SandboxIDE);
