import React from 'react';
import { Box, Button, Flex, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { SkillDetailContext } from './context';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { workspaceLayout } from './workspaceLayout';

const WorkspaceStatus = () => {
  const { t } = useTranslation();
  const {
    skillDetail,
    sandboxState,
    resetWorkspace,
    isResettingWorkspace,
    startSandbox,
    chatRunning
  } = useContextSelector(SkillDetailContext, (v) => v);
  const { openConfirm, ConfirmModal } = useConfirm({
    title: t('skill:workspace_reset'),
    content: t('skill:workspace_reset_confirm'),
    type: 'delete'
  });
  const workspace = skillDetail?.workspace;
  const activeDebug =
    chatRunning && workspace?.operation?.type === 'debug' && !workspace.operation.errorCode;
  const hasReadyDraft =
    workspace &&
    (activeDebug || ['running', 'stopped', 'paused'].includes(workspace.status)) &&
    (workspace.baseVersionId || workspace.stale);
  if (!skillDetail?.permission.hasWritePer) return null;
  const recoveryRequired = !activeDebug && workspace?.operation?.failureDisposition === 'unknown';
  const hint = recoveryRequired
    ? t('skill:workspace_recovery_required')
    : sandboxState === 'replaced'
      ? t('skill:workspace_replaced')
      : hasReadyDraft
        ? workspace?.stale
          ? t('skill:workspace_stale')
          : t('skill:workspace_preserved')
        : t('skill:workspace_not_ready');
  const needsAttention =
    recoveryRequired || sandboxState === 'replaced' || !hasReadyDraft || workspace?.stale;

  return (
    <Flex
      role="status"
      gap={2}
      px={4}
      h={workspaceLayout.headerHeight}
      flexShrink={0}
      alignItems="center"
      borderBottom="1px solid"
      borderColor="myGray.200"
      bg="white"
    >
      <MyIcon name="code" w="18px" color="primary.500" flexShrink={0} aria-hidden />
      <Text fontSize="sm" fontWeight="600" flexShrink={0}>
        {t('skill:workspace_files')}
      </Text>
      <Flex
        align="center"
        gap={1.5}
        fontSize="xs"
        color={needsAttention ? 'orange.600' : 'myGray.500'}
        flexShrink={0}
      >
        <Box
          w="6px"
          h="6px"
          borderRadius="full"
          bg={
            needsAttention
              ? 'orange.400'
              : workspace?.status === 'running'
                ? 'green.500'
                : 'myGray.400'
          }
          aria-hidden
        />
        {activeDebug
          ? t('skill:chat_run_running')
          : t(`skill:workspace_status_${workspace?.status ?? 'absent'}`)}
      </Flex>
      {needsAttention && (
        <Text
          flex={1}
          minW={0}
          fontSize="xs"
          color={recoveryRequired ? 'red.600' : 'orange.600'}
          isTruncated
          title={hint}
        >
          {hint}
        </Text>
      )}
      <MyTooltip label={hint} shouldWrapChildren={false}>
        <Button
          size="xs"
          variant="ghost"
          ml={needsAttention ? 0 : 'auto'}
          flexShrink={0}
          aria-label={t('skill:workspace_title')}
        >
          <MyIcon name="common/info" w="16px" aria-hidden />
        </Button>
      </MyTooltip>
      {(sandboxState === 'replaced' || workspace?.status === 'stopped') && (
        <Button
          size="xs"
          flexShrink={0}
          onClick={startSandbox}
          isDisabled={isResettingWorkspace || sandboxState === 'loading' || sandboxState === 'idle'}
        >
          {t('skill:workspace_reopen')}
        </Button>
      )}
      {skillDetail.permission.hasManagePer && workspace && (
        <Button
          size="xs"
          flexShrink={0}
          variant="whiteBase"
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
