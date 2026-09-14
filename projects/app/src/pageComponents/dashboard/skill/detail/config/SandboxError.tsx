import React from 'react';
import { Flex, Box, Button } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext } from '../context';
import MyIcon from '@fastgpt/web/components/common/Icon';

const SandboxError = () => {
  const { t } = useTranslation();
  const { sandboxError, startSandbox, requiresRecovery } = useContextSelector(
    SkillDetailContext,
    (v) => ({
      sandboxError: v.sandboxError,
      startSandbox: v.startSandbox,
      requiresRecovery: v.skillDetail?.workspace?.operation?.failureDisposition === 'unknown'
    })
  );

  let errorMessage = sandboxError;
  if (requiresRecovery || sandboxError === 'workspace_recovery_required') {
    errorMessage = t('skill:workspace_recovery_required');
  } else if (sandboxError === 'sandbox_unavailable') {
    errorMessage = t('skill:workspace_unavailable');
  }

  return (
    <Flex h={'100%'} alignItems={'center'} justifyContent={'center'} flexDirection={'column'}>
      <MyIcon name={'common/errorFill'} w={'48px'} h={'48px'} color={'red.500'} />
      <Box mt={'16px'} fontSize={'md'} fontWeight={'bold'} color={'myGray.900'}>
        {t('skill:sandbox_error_title')}
      </Box>
      {errorMessage && (
        <Box mt={'8px'} fontSize={'sm'} color={'myGray.500'} maxW={'400px'} textAlign={'center'}>
          {errorMessage}
        </Box>
      )}
      <Button
        mt={'20px'}
        variant={'primary'}
        size={'sm'}
        onClick={startSandbox}
        isDisabled={requiresRecovery}
      >
        {t('skill:sandbox_retry')}
      </Button>
    </Flex>
  );
};

export default React.memo(SandboxError);
