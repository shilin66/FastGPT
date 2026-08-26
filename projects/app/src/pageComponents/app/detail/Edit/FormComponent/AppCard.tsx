import React, { useState } from 'react';
import { Box, Flex, Button, IconButton, HStack, Checkbox } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { type AppSchemaType } from '@fastgpt/global/core/app/type';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import TagsEditModal from '../../TagsEditModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useContextSelector } from 'use-context-selector';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { postTransition2Workflow } from '@/web/core/app/api/app';
import type { SimpleAppSnapshotType } from './useSnapshots';
import ExportConfigPopover from '@/pageComponents/app/detail/ExportConfigPopover';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import type { Form2WorkflowFnType } from './type';
import { OmniModalBody, OmniModalFooter } from '../../components/OmniModalLayout';
import { omniTheme } from '@/web/common/brand/theme';

const AppCard = ({
  appForm,
  setPast,
  form2WorkflowFn,
  configToWorkflow = true
}: {
  appForm: AppFormEditFormType;
  setPast: (value: React.SetStateAction<SimpleAppSnapshotType[]>) => void;
  form2WorkflowFn: Form2WorkflowFnType;
  configToWorkflow?: boolean;
}) => {
  const router = useRouter();
  const { t } = useTranslation();
  const onSaveApp = useContextSelector(AppContext, (v) => v.onSaveApp);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const onOpenInfoEdit = useContextSelector(AppContext, (v) => v.onOpenInfoEdit);
  const onDelApp = useContextSelector(AppContext, (v) => v.onDelApp);

  const appId = appDetail._id;
  const { feConfigs } = useSystemStore();
  const [TeamTagsSet, setTeamTagsSet] = useState<AppSchemaType>();
  const [filterSensitiveInfo, setFilterSensitiveInfo] = useState(true);

  // transition to workflow
  const [transitionCreateNew, setTransitionCreateNew] = useState<boolean>();
  const { runAsync: onTransition, loading: transiting } = useRequest(
    async () => {
      const { nodes, edges } = form2WorkflowFn(appForm, t);
      await onSaveApp({
        nodes,
        edges,
        chatConfig: appForm.chatConfig,
        isPublish: false,
        versionName: t('app:transition_to_workflow')
      });

      return postTransition2Workflow({ appId, createNew: transitionCreateNew });
    },
    {
      onSuccess: ({ id }) => {
        if (id) {
          router.replace({
            query: {
              appId: id
            }
          });
        } else {
          setPast([]);
          router.reload();
        }
      },
      successToast: t('common:Success')
    }
  );

  return (
    <>
      <Flex
        alignItems={'center'}
        gap={3}
        minH={'58px'}
        px={[4, 5]}
        py={2.5}
        bg={omniTheme.colors.surface}
        borderBottom={'1px solid'}
        borderColor={omniTheme.colors.border}
      >
        <Avatar src={appDetail.avatar} borderRadius={omniTheme.radii.md} w={'32px'} h={'32px'} />
        <Box flex={1} minW={0}>
          <Box color={omniTheme.colors.graphite} fontSize={'13px'} fontWeight={800} noOfLines={1}>
            {appDetail.name}
          </Box>
          <Box mt={0.5} color={omniTheme.colors.muted} fontSize={'11px'} noOfLines={1}>
            {appDetail.intro || t('common:core.app.tip.Add a intro to app')}
          </Box>
        </Box>

        <HStack spacing={1.5} flexShrink={0}>
          <IconButton
            variant={'whiteBase'}
            size={'smSquare'}
            icon={<MyIcon name={'core/chat/chatLight'} w={'16px'} />}
            aria-label={String(t('common:Open'))}
            onClick={() =>
              window.open(
                `/chat?appId=${appId}&pane=${ChatSidebarPaneEnum.RECENTLY_USED_APPS}`,
                '_blank'
              )
            }
          />
          {appDetail.permission.hasManagePer && (
            <IconButton
              variant={'whiteBase'}
              size={'smSquare'}
              icon={<MyIcon name={'common/settingLight'} w={'16px'} />}
              aria-label={String(t('common:Edit'))}
              onClick={onOpenInfoEdit}
            />
          )}
          {appDetail.permission.isOwner &&
            (configToWorkflow ? (
              <MyMenu
                size={'xs'}
                Button={
                  <IconButton
                    variant={'whiteBase'}
                    size={'smSquare'}
                    icon={<MyIcon name={'more'} w={'16px'} />}
                    aria-label={String(t('common:More'))}
                  />
                }
                menuList={[
                  {
                    children: [
                      {
                        label: (
                          <Flex>
                            <ExportConfigPopover
                              appName={appDetail.name}
                              appForm={appForm}
                              chatConfig={appDetail.chatConfig}
                              filterSensitiveInfo={filterSensitiveInfo}
                              onFilterSensitiveInfoChange={setFilterSensitiveInfo}
                            />
                          </Flex>
                        )
                      },
                      {
                        icon: 'core/app/type/workflow',
                        label: t('app:transition_to_workflow'),
                        onClick: () => setTransitionCreateNew(true)
                      },
                      ...(appDetail.permission.hasWritePer && feConfigs?.show_team_chat
                        ? [
                            {
                              icon: 'core/chat/fileSelect' as const,
                              label: t('app:team_tags_set'),
                              onClick: () => setTeamTagsSet(appDetail)
                            }
                          ]
                        : [])
                    ]
                  },
                  {
                    children: [
                      {
                        icon: 'delete',
                        type: 'danger' as const,
                        label: t('common:Delete'),
                        onClick: onDelApp
                      }
                    ]
                  }
                ]}
              />
            ) : (
              <IconButton
                variant={'whiteDanger'}
                size={'smSquare'}
                icon={<MyIcon name={'delete'} w={'16px'} />}
                aria-label={String(t('common:Delete'))}
                onClick={onDelApp}
              />
            ))}
        </HStack>
      </Flex>

      {TeamTagsSet && <TagsEditModal onClose={() => setTeamTagsSet(undefined)} />}
      {transitionCreateNew !== undefined && (
        <MyModal isOpen title={t('app:transition_to_workflow')} iconSrc={'core/app/type/workflow'}>
          <OmniModalBody
            icon={'core/app/type/workflow'}
            title={t('app:transition_to_workflow_create_new_placeholder')}
            desc={t('app:transition_to_workflow_create_new_tip')}
            minH={['auto', '260px']}
          >
            <HStack
              as={'button'}
              type={'button'}
              w={'full'}
              cursor={'pointer'}
              p={3}
              border={'1px solid'}
              borderColor={omniTheme.colors.border}
              borderRadius={omniTheme.radii.lg}
              bg={omniTheme.colors.surface}
              textAlign={'left'}
              _hover={{ borderColor: omniTheme.colors.saturatedBlue }}
              _focusVisible={{ boxShadow: `0 0 0 2px ${omniTheme.colors.saturatedBlueSoft}` }}
              onClick={() => setTransitionCreateNew((state) => !state)}
            >
              <Checkbox
                isChecked={transitionCreateNew}
                pointerEvents={'none'}
                icon={<MyIcon name={'common/check'} w={'12px'} />}
              />
              <Box color={omniTheme.colors.graphite} fontWeight={700}>
                {t('app:transition_to_workflow_create_new_placeholder')}
              </Box>
            </HStack>
          </OmniModalBody>
          <OmniModalFooter>
            <Button variant={'whiteBase'} onClick={() => setTransitionCreateNew(undefined)}>
              {t('common:Close')}
            </Button>
            <Button variant={'dangerFill'} isLoading={transiting} onClick={() => onTransition()}>
              {t('common:Confirm')}
            </Button>
          </OmniModalFooter>
        </MyModal>
      )}
    </>
  );
};

export default React.memo(AppCard);
