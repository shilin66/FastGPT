import React from 'react';
import { Box, Button, Flex, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { SkillDetailContext } from './context';

const WorkspaceStatus = () => {
  const { t } = useTranslation();
  const { skillDetail, sandboxState, resetWorkspace, isResettingWorkspace, startSandbox } =
    useContextSelector(SkillDetailContext, (v) => v);
  const { openConfirm, ConfirmModal } = useConfirm({
    title: t('skill:workspace_reset'),
    content: t('skill:workspace_reset_confirm'),
    type: 'delete'
  });
  const workspace = skillDetail?.workspace;
  const hasReadyDraft =
    workspace &&
    ['running', 'stopped', 'paused'].includes(workspace.status) &&
    (workspace.baseVersionId || workspace.stale);
  if (!skillDetail?.permission.hasWritePer) return null;

  return (
    <Flex
      role="status"
      gap={3}
      px={4}
      py={3}
      alignItems="center"
      borderBottom="1px solid"
      borderColor="myGray.200"
      bg={hasReadyDraft && workspace?.stale ? 'yellow.50' : 'myGray.50'}
    >
      <Box flex={1} minW={0}>
        <Text fontSize="sm" fontWeight="medium">
          {t('skill:workspace_title')} ·{' '}
          {t(`skill:workspace_status_${workspace?.status ?? 'absent'}`)}
        </Text>
        <Text fontSize="xs" color="myGray.600" mt={1}>
          {sandboxState === 'replaced'
            ? t('skill:workspace_replaced')
            : hasReadyDraft
              ? workspace?.stale
                ? t('skill:workspace_stale')
                : t('skill:workspace_preserved')
              : t('skill:workspace_not_ready')}
        </Text>
        {workspace?.operation?.failureDisposition === 'unknown' && (
          <Text fontSize="xs" color="red.600" mt={1}>
            {t('skill:workspace_recovery_required')}
          </Text>
        )}
      </Box>
      {sandboxState === 'replaced' && (
        <Button size="sm" onClick={startSandbox} isDisabled={isResettingWorkspace}>
          {t('skill:workspace_reopen')}
        </Button>
      )}
      {skillDetail.permission.hasManagePer && workspace && (
        <Button
          size="sm"
          variant="whitePrimary"
          isLoading={isResettingWorkspace}
          isDisabled={!workspace.resetAvailable}
          title={!workspace.resetAvailable ? t('skill:workspace_reset_unavailable') : undefined}
          onClick={() =>
            openConfirm({
              inputConfirmText: skillDetail.name,
              onConfirm: () => resetWorkspace(workspace)
            })()
          }
        >
          {t('skill:workspace_reset')}
        </Button>
      )}
      <ConfirmModal />
    </Flex>
  );
};
export default React.memo(WorkspaceStatus);
