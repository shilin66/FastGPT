import React, { useMemo } from 'react';
import { Button, Flex, HStack, useDisclosure, type ButtonProps } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { AppContext, TabEnum } from '../../context';
import SaveAndPublishModal from '../../WorkflowComponents/Flow/components/SaveAndPublish';

type SaveOptions = {
  isPublish?: boolean;
  versionName?: string;
};

type PublishSaveOptions = {
  isPublish: boolean;
  versionName: string;
};

type Props = {
  currentTab: TabEnum;
  showHistoryModal: boolean;
  isWorkflowEdit: boolean;
  isLoading: boolean;
  onRunTest: () => void;
  onOpenHistory: () => void;
  onClickSave: (options: SaveOptions) => Promise<void>;
  checkBeforePublish: () => boolean;
};

type ModeItem = {
  label: string;
  icon: IconNameType;
  active: boolean;
  onClick: () => void;
};

const steelBlue = '#2563EB';

const ToolbarButton = (props: ButtonProps) => (
  <Button
    h={'34px'}
    px={3}
    borderRadius={'7px'}
    fontSize={'12px'}
    fontWeight={800}
    flexShrink={0}
    {...props}
  />
);

const WorkflowHeaderActions = ({
  currentTab,
  showHistoryModal,
  isWorkflowEdit,
  isLoading,
  onRunTest,
  onOpenHistory,
  onClickSave,
  checkBeforePublish
}: Props) => {
  const { t } = useTranslation();
  const { appDetail, route2Tab } = useContextSelector(AppContext, (v) => v);
  const { toast } = useToast({
    containerStyle: {
      mt: '60px',
      fontSize: 'sm'
    }
  });
  const {
    isOpen: isSaveAndPublishOpen,
    onOpen: onOpenSaveAndPublish,
    onClose: onCloseSaveAndPublish
  } = useDisclosure();

  const modeItems = useMemo(
    () =>
      [
        appDetail.permission.hasWritePer && {
          label: t('common:Config'),
          icon: 'common/settingLight',
          active: currentTab === TabEnum.appEdit,
          onClick: () => route2Tab(TabEnum.appEdit)
        },
        appDetail.permission.hasManagePer && {
          label: t('app:publish_channel'),
          icon: 'core/workflow/publish',
          active: currentTab === TabEnum.publish,
          onClick: () => route2Tab(TabEnum.publish)
        },
        appDetail.permission.hasReadChatLogPer && {
          label: t('app:chat_logs'),
          icon: 'core/app/logsLight',
          active: currentTab === TabEnum.logs,
          onClick: () => route2Tab(TabEnum.logs)
        }
      ].filter(Boolean) as ModeItem[],
    [
      appDetail.permission.hasManagePer,
      appDetail.permission.hasReadChatLogPer,
      appDetail.permission.hasWritePer,
      currentTab,
      route2Tab,
      t
    ]
  );

  const onSaveDraft = async () => {
    await onClickSave({});
    toast({
      status: 'success',
      title: t('app:saved_success'),
      position: 'top-right',
      isClosable: true
    });
  };

  const onOpenPublish = () => {
    if (checkBeforePublish()) {
      onOpenSaveAndPublish();
    }
  };

  const onPublishSave = (data: PublishSaveOptions) => onClickSave(data);

  return (
    <>
      <Flex h={'64px'} alignItems={'stretch'} gap={0.5} overflowX={'auto'} maxW={['100%', 'none']}>
        {modeItems.map((item) => (
          <Button
            key={item.label}
            aria-current={item.active ? 'page' : undefined}
            leftIcon={<MyIcon name={item.icon} w={'14px'} />}
            position={'relative'}
            h={'64px'}
            minW={'58px'}
            px={2.5}
            borderRadius={0}
            fontSize={'12px'}
            fontWeight={850}
            color={item.active ? steelBlue : '#526075'}
            bg={'transparent'}
            _after={
              item.active
                ? {
                    content: '""',
                    position: 'absolute',
                    right: 2.5,
                    bottom: 0,
                    left: 2.5,
                    h: '3px',
                    borderRadius: '3px 3px 0 0',
                    bg: steelBlue
                  }
                : undefined
            }
            _hover={{
              bg: '#EFF6FF',
              color: steelBlue
            }}
            onClick={item.onClick}
          >
            {item.label}
          </Button>
        ))}
      </Flex>

      {isWorkflowEdit && (
        <HStack spacing={2} flexShrink={0}>
          {!showHistoryModal && (
            <MyTooltip label={t('workflow:version_history')}>
              <ToolbarButton
                aria-label={t('workflow:version_history')}
                minW={'34px'}
                px={0}
                variant={'whiteBase'}
                border={'1px solid #DFE5EE'}
                bg={'white'}
                onClick={onOpenHistory}
              >
                <MyIcon name={'history'} w={'15px'} />
              </ToolbarButton>
            </MyTooltip>
          )}
          {!showHistoryModal && (
            <>
              {appDetail.permission.hasWritePer && (
                <ToolbarButton
                  leftIcon={<MyIcon name={'core/workflow/debug'} w={'15px'} />}
                  variant={'whiteBase'}
                  border={'1px solid rgba(37, 99, 235, 0.24)'}
                  color={steelBlue}
                  bg={'#EFF6FF'}
                  _hover={{ bg: '#DBEAFE', borderColor: 'rgba(37, 99, 235, 0.38)' }}
                  onClick={onRunTest}
                >
                  {t('common:core.workflow.Debug')}
                </ToolbarButton>
              )}
              <ToolbarButton
                variant={'whiteBase'}
                border={'1px solid #DFE5EE'}
                bg={'white'}
                isLoading={isLoading}
                onClick={onSaveDraft}
              >
                {t('common:core.workflow.Save to cloud')}
              </ToolbarButton>
              <ToolbarButton
                leftIcon={<MyIcon name={'core/workflow/publish'} w={'15px'} />}
                color={'white'}
                bg={steelBlue}
                _hover={{ bg: '#1D4ED8' }}
                isLoading={isLoading}
                onClick={onOpenPublish}
              >
                {t('common:core.workflow.Save and publish')}
              </ToolbarButton>
            </>
          )}
        </HStack>
      )}

      {isSaveAndPublishOpen && (
        <SaveAndPublishModal
          isLoading={isLoading}
          onClose={onCloseSaveAndPublish}
          onClickSave={onPublishSave}
        />
      )}
    </>
  );
};

export default React.memo(WorkflowHeaderActions);
