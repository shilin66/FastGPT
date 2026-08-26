import React, { useCallback } from 'react';
import { Box, Button, ModalBody, ModalFooter, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

import { useContextSelector } from 'use-context-selector';
import { AppContext, TabEnum } from '../context';
import { useRouter } from 'next/router';

import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import PublishHistories from '../PublishHistoriesSlider';
import {
  WorkflowSnapshotContext,
  type WorkflowSnapshotsType
} from '../WorkflowComponents/context/workflowSnapshotContext';
import { WorkflowUtilsContext } from '../WorkflowComponents/context/workflowUtilsContext';
import { WorkflowModalContext } from '../WorkflowComponents/context/workflowModalContext';
import { WorkflowPersistenceContext } from '../WorkflowComponents/context/workflowPersistenceContext';
import WorkflowHeaderBar from './components/WorkflowHeaderBar';

const Header = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast: backSaveToast } = useToast({
    containerStyle: {
      mt: '60px'
    }
  });

  const { appDetail, onSaveApp, currentTab } = useContextSelector(AppContext, (v) => v);
  const isV2Workflow = appDetail?.version === 'v2';
  const {
    isOpen: isOpenBackConfirm,
    onOpen: onOpenBackConfirm,
    onClose: onCloseBackConfirm
  } = useDisclosure();

  const { flowData2StoreData, flowData2StoreDataAndCheck } = useContextSelector(
    WorkflowUtilsContext,
    (v) => v
  );

  const setWorkflowTestData = useContextSelector(
    WorkflowModalContext,
    (v) => v.setWorkflowTestData
  );
  const { past, setPast, onSwitchTmpVersion, onSwitchCloudVersion } = useContextSelector(
    WorkflowSnapshotContext,
    (v) => v
  );

  const { showHistoryModal, setShowHistoryModal } = useContextSelector(
    WorkflowModalContext,
    (v) => v
  );

  const { isSaved, leaveSaveSign } = useContextSelector(WorkflowPersistenceContext, (v) => v);

  const { lastAppListRouteType } = useSystemStore();

  const { runAsync: onClickSave, loading } = useRequest(
    async ({
      isPublish,
      versionName = formatTime2YMDHMS(new Date())
    }: {
      isPublish?: boolean;
      versionName?: string;
    }) => {
      const data = flowData2StoreData();
      if (data) {
        await onSaveApp({
          ...data,
          isPublish,
          versionName,
          chatConfig: appDetail.chatConfig,
          //@ts-ignore
          version: 'v2'
        });
        // Mark the current snapshot as saved
        setPast((prevPast) =>
          prevPast.map((item, index) =>
            index === 0
              ? {
                  ...item,
                  isSaved: true
                }
              : item
          )
        );
      }
    },
    {
      manual: true,
      refreshDeps: [onSaveApp, setPast, flowData2StoreData, appDetail.chatConfig]
    }
  );

  const onBack = useCallback(async () => {
    leaveSaveSign.current = false;
    router.push({
      pathname: '/dashboard/agent',
      query: {
        parentId: appDetail.parentId,
        type: lastAppListRouteType
      }
    });
  }, [appDetail.parentId, lastAppListRouteType, leaveSaveSign, router]);

  const onRunTest = useCallback(() => {
    const data = flowData2StoreDataAndCheck();
    if (data) {
      setWorkflowTestData(data);
    }
  }, [flowData2StoreDataAndCheck, setWorkflowTestData]);

  const onOpenHistory = useCallback(() => {
    setShowHistoryModal(true);
  }, [setShowHistoryModal]);

  return (
    <>
      <WorkflowHeaderBar
        isSaved={isSaved}
        isV2Workflow={isV2Workflow}
        currentTab={currentTab}
        showHistoryModal={showHistoryModal}
        isLoading={loading}
        onBack={isSaved ? onBack : onOpenBackConfirm}
        onRunTest={onRunTest}
        onOpenHistory={onOpenHistory}
        onClickSave={onClickSave}
        checkBeforePublish={() => !!flowData2StoreDataAndCheck()}
      />
      {showHistoryModal && isV2Workflow && currentTab === TabEnum.appEdit && (
        <PublishHistories<WorkflowSnapshotsType>
          onClose={() => {
            setShowHistoryModal(false);
          }}
          past={past}
          onSwitchCloudVersion={onSwitchCloudVersion}
          onSwitchTmpVersion={onSwitchTmpVersion}
        />
      )}

      <MyModal
        isOpen={isOpenBackConfirm}
        onClose={onCloseBackConfirm}
        iconSrc="common/warn"
        title={t('common:Exit')}
        w={'400px'}
      >
        <ModalBody>
          <Box>{t('workflow:workflow.exit_tips')}</Box>
        </ModalBody>
        <ModalFooter gap={3}>
          <Button variant={'whiteDanger'} onClick={onBack}>
            {t('common:exit_directly')}
          </Button>
          <Button
            isLoading={loading}
            onClick={async () => {
              try {
                await onClickSave({});
                onCloseBackConfirm();
                onBack();
                backSaveToast({
                  status: 'success',
                  title: t('app:saved_success'),
                  position: 'top-right'
                });
              } catch (error) {}
            }}
          >
            {t('common:Save_and_exit')}
          </Button>
        </ModalFooter>
      </MyModal>
    </>
  );
};

export default React.memo(Header);
