import React, { useMemo, useState } from 'react';
import { Box, Grid, IconButton, HStack, Flex, VStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { delAppById, putAppById, resumeInheritPer, changeOwner } from '@/web/core/app/api';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import PermissionIconText from '@/components/support/permission/IconText';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';
import {
  AppFolderTypeList,
  AppTypeEnum,
  AppTypeList,
  ToolTypeList
} from '@fastgpt/global/core/app/constants';
import { useFolderDrag } from '@/components/common/folder/useFolderDrag';
import dynamic from 'next/dynamic';
import type { EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';
import MyMenu, { type MenuItemType } from '@fastgpt/web/components/common/MyMenu';
import { AppRoleList } from '@fastgpt/global/support/permission/app/constant';
import {
  deleteAppCollaborators,
  getCollaboratorList,
  postUpdateAppCollaborators
} from '@/web/core/app/api/collaborator';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import AppTypeTag from './TypeTag';
import { postCopyApp } from '@/web/core/app/api/app';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { type RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import UserBox from '@fastgpt/web/components/common/UserBox';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { createAppTypeMap } from '@/pageComponents/app/constants';
import { useUserStore } from '@/web/support/user/useUserStore';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { omniTheme } from '@/web/common/brand/theme';

const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));
const ConfigPerModal = dynamic(() => import('@/components/support/permission/ConfigPerModal'));

const List = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { parentId = null } = router.query;
  const { isPc } = useSystem();
  const { toast } = useToast();
  const { userInfo } = useUserStore();

  const { openConfirm: openMoveConfirm, ConfirmModal: MoveConfirmModal } = useConfirm({
    type: 'common',
    title: t('common:move.confirm'),
    content: t('app:move.hint')
  });

  const {
    myApps,
    appType,
    loadMyApps,
    isFetchingApps,
    onUpdateApp,
    setMoveAppId,
    folderDetail,
    searchKey,
    setSearchKey
  } = useContextSelector(AppListContext, (v) => v);

  const hasCreatePer = folderDetail
    ? folderDetail.permission.hasWritePer && folderDetail?.type !== AppTypeEnum.httpPlugin
    : userInfo?.team.permission.hasAppCreatePer;

  const [editedApp, setEditedApp] = useState<EditResourceInfoFormType>();
  const [editPerAppId, setEditPerAppId] = useState<string>();

  const editPerApp = useMemo(
    () =>
      editPerAppId !== undefined
        ? myApps.find((item) => String(item._id) === String(editPerAppId))
        : undefined,
    [editPerAppId, myApps]
  );

  const parentApp = useMemo(() => myApps.find((item) => item._id === parentId), [parentId, myApps]);

  const { runAsync: onPutAppById } = useRequest(putAppById, {
    onSuccess() {
      loadMyApps();
    }
  });

  const { getBoxProps } = useFolderDrag({
    activeStyles: {
      borderColor: 'primary.600'
    },
    onDrop: (dragId: string, targetId: string) => {
      openMoveConfirm({ onConfirm: async () => onPutAppById(dragId, { parentId: targetId }) })();
    }
  });

  const { openConfirm: openConfirmDel, ConfirmModal: DelConfirmModal } = useConfirm({
    type: 'delete'
  });

  const { lastChatAppId, setLastChatAppId } = useChatStore();
  const { runAsync: onclickDelApp } = useRequest(
    (id: string) => {
      if (id === lastChatAppId) {
        setLastChatAppId('');
      }
      return delAppById(id);
    },
    {
      onSuccess(data) {
        data.forEach((appId) => {
          localStorage.removeItem(`app_log_keys_${appId}`);
        });
        loadMyApps();
      },
      successToast: t('common:delete_success'),
      errorToast: t('common:delete_failed')
    }
  );

  const { openConfirm: openConfirmCopy, ConfirmModal: ConfirmCopyModal } = useConfirm({
    content: t('app:confirm_copy_app_tip')
  });
  const { runAsync: onclickCopy } = useRequest(postCopyApp, {
    onSuccess({ appId }) {
      router.push(`/app/detail?appId=${appId}`);
      loadMyApps();
    },
    successToast: t('app:create_copy_success')
  });

  const { runAsync: onResumeInheritPermission } = useRequest(
    () => {
      return resumeInheritPer(editPerApp!._id);
    },
    {
      manual: true,
      errorToast: t('common:permission.Resume InheritPermission Failed'),
      onSuccess() {
        loadMyApps();
      }
    }
  );
  if (myApps.length === 0 && isFetchingApps) return null;

  return (
    <>
      {myApps.length === 0 && !folderDetail ? (
        searchKey ? (
          <EmptyTip />
        ) : isPc && hasCreatePer ? (
          <CreateButton appType={appType} />
        ) : (
          <Grid
            py={4}
            gridTemplateColumns={
              folderDetail
                ? ['1fr', 'repeat(2,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']
                : ['1fr', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)', 'repeat(4,1fr)']
            }
            gridGap={4}
            alignItems={'stretch'}
          >
            {hasCreatePer ? <ListCreateButton appType={appType} /> : <ForbiddenCreateButton />}
          </Grid>
        )
      ) : (
        <Grid
          py={4}
          gridTemplateColumns={
            folderDetail
              ? ['1fr', 'repeat(2,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']
              : ['1fr', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)', 'repeat(4,1fr)']
          }
          gridGap={4}
          alignItems={'stretch'}
        >
          {hasCreatePer ? <ListCreateButton appType={appType} /> : <ForbiddenCreateButton />}
          {myApps.map((app, index) => {
            const isAgent = AppTypeList.includes(app.type);
            const isTool = ToolTypeList.includes(app.type);
            const isFolder = AppFolderTypeList.includes(app.type);
            return (
              <MyTooltip
                key={app._id}
                label={
                  app.type === AppTypeEnum.folder
                    ? t('common:open_folder')
                    : app.permission.hasWritePer || app.permission.hasReadChatLogPer
                      ? t('app:edit_app')
                      : t('app:go_to_chat')
                }
              >
                <MyBox
                  pt={3}
                  pb={3}
                  pl={5}
                  pr={4}
                  cursor={'pointer'}
                  border={'1px solid'}
                  borderColor={omniTheme.colors.border}
                  bg={'white'}
                  borderRadius={'12px'}
                  position={'relative'}
                  overflow={'hidden'}
                  minH={'156px'}
                  display={'flex'}
                  flexDirection={'column'}
                  transition={'all 0.18s ease'}
                  _hover={{
                    borderColor: omniTheme.colors.saturatedBlue,
                    boxShadow: omniTheme.shadows.card,
                    transform: 'translateY(-1px)',
                    '& .more': {
                      opacity: 1,
                      pointerEvents: 'auto'
                    },
                    '& .time': {
                      display: ['flex', 'none']
                    }
                  }}
                  onClick={() => {
                    if (AppFolderTypeList.includes(app.type)) {
                      setSearchKey('');
                      router.push({
                        query: {
                          ...router.query,
                          parentId: app._id
                        }
                      });
                    } else if (app.permission.hasWritePer || app.permission.hasReadChatLogPer) {
                      router.push(`/app/detail?appId=${app._id}`);
                    } else {
                      window.open(
                        `/chat?appId=${app._id}&pane=${ChatSidebarPaneEnum.RECENTLY_USED_APPS}`,
                        '_blank'
                      );
                    }
                  }}
                  {...getBoxProps({
                    dataId: app._id,
                    isFolder: app.type === AppTypeEnum.folder || app.type === AppTypeEnum.toolFolder
                  })}
                >
                  <Flex
                    position={'relative'}
                    zIndex={1}
                    alignItems={'center'}
                    gap={3}
                    pb={2.5}
                    borderBottom={'1px solid #EDF1F6'}
                  >
                    <Box minW={0} flex={1}>
                      <Box
                        color={omniTheme.colors.text}
                        fontWeight={800}
                        fontSize={'sm'}
                        minWidth={0}
                        overflow="hidden"
                      >
                        <Box className={'textEllipsis'}>{app.name}</Box>
                      </Box>
                      <Box mt={1}>
                        <AppTypeTag type={app.type} />
                      </Box>
                    </Box>
                    <Avatar
                      src={app.avatar}
                      borderRadius={'8px'}
                      w={'30px'}
                      h={'30px'}
                      flexShrink={0}
                    />
                  </Flex>
                  <Box
                    position={'relative'}
                    zIndex={1}
                    flex={'0 0 38px'}
                    mt={3}
                    textAlign={'justify'}
                    wordBreak={'break-all'}
                    fontSize={'xs'}
                    color={omniTheme.colors.muted}
                  >
                    <Box className={'textEllipsis2'} whiteSpace={'pre-wrap'} lineHeight={1.45}>
                      {app.intro || t('common:no_intro')}
                    </Box>
                  </Box>
                  <Grid
                    position={'relative'}
                    zIndex={1}
                    mt={'auto'}
                    pt={2.5}
                    borderTop={'1px solid #EDF1F6'}
                    gridTemplateColumns={'repeat(3, minmax(0, 1fr))'}
                    gap={2}
                  >
                    <Box minW={0} minH={'28px'} alignContent={'center'} px={0}>
                      <UserBox
                        sourceMember={app.sourceMember}
                        fontSize="xs"
                        avatarSize="1rem"
                        spacing={0.5}
                      />
                    </Box>
                    <Box minW={0} minH={'28px'} alignContent={'center'} px={0}>
                      <PermissionIconText
                        private={app.private}
                        color={'myGray.500'}
                        iconColor={'myGray.400'}
                        w={'0.875rem'}
                      />
                    </Box>
                    <HStack minW={0} minH={'28px'} px={0} justifyContent={'space-between'}>
                      {isPc && (
                        <Box minW={0}>
                          <HStack spacing={0.5} className="time">
                            <MyIcon name={'history'} w={'0.85rem'} color={'myGray.400'} />
                            <Box color={'myGray.500'} fontSize={'xs'} className={'textEllipsis'}>
                              {t(formatTimeToChatTime(app.updateTime) as any).replace('#', ':')}
                            </Box>
                          </HStack>
                        </Box>
                      )}
                      {(AppFolderTypeList.includes(app.type)
                        ? app.permission.hasManagePer
                        : app.permission.hasWritePer || app.permission.hasReadChatLogPer) && (
                        <Box
                          className="more"
                          display={'block'}
                          opacity={[1, 0]}
                          pointerEvents={['auto', 'none']}
                          flexShrink={0}
                          transition={'opacity 0.15s ease'}
                          _focusWithin={{
                            opacity: 1,
                            pointerEvents: 'auto'
                          }}
                        >
                          <MyMenu
                            trigger={'click'}
                            placement={'bottom-end'}
                            width={176}
                            offset={[0, 8]}
                            usePortal
                            menuListStyles={{
                              p: 2,
                              border: '1px solid',
                              borderColor: omniTheme.colors.border,
                              borderRadius: '12px',
                              boxShadow: '0 18px 44px -28px rgba(31, 41, 55, 0.26)',
                              bg: 'white',
                              zIndex: 1600
                            }}
                            menuItemStyles={{
                              minH: '36px',
                              borderRadius: '10px',
                              px: 3,
                              fontWeight: 700,
                              _hover: {
                                bg: '#EEF4FF'
                              },
                              _focus: {
                                bg: '#EEF4FF'
                              }
                            }}
                            Button={
                              <IconButton
                                size={'xsSquare'}
                                variant={'transparentBase'}
                                icon={<MyIcon name={'more'} w={'0.875rem'} color={'myGray.500'} />}
                                aria-label={''}
                              />
                            }
                            menuList={[
                              ...([
                                AppTypeEnum.simple,
                                AppTypeEnum.workflow,
                                AppTypeEnum.chatAgent
                              ].includes(app.type)
                                ? [
                                    {
                                      children: [
                                        {
                                          icon: 'core/chat/chatLight',
                                          type: 'grayBg' as MenuItemType,
                                          label: t('app:go_to_chat'),
                                          onClick: () => {
                                            window.open(
                                              `/chat?appId=${app._id}&pane=${ChatSidebarPaneEnum.RECENTLY_USED_APPS}`,
                                              '_blank'
                                            );
                                          }
                                        }
                                      ]
                                    }
                                  ]
                                : []),
                              ...([AppTypeEnum.workflowTool].includes(app.type)
                                ? [
                                    {
                                      children: [
                                        {
                                          icon: 'core/chat/chatLight',
                                          type: 'grayBg' as MenuItemType,
                                          label: t('app:go_to_run'),
                                          onClick: () => {
                                            window.open(
                                              `/chat?appId=${app._id}&pane=${ChatSidebarPaneEnum.RECENTLY_USED_APPS}`,
                                              '_blank'
                                            );
                                          }
                                        }
                                      ]
                                    }
                                  ]
                                : []),
                              ...(app.permission.hasManagePer
                                ? [
                                    {
                                      children: [
                                        {
                                          icon: 'edit',
                                          type: 'grayBg' as MenuItemType,
                                          label: t('common:dataset.Edit Info'),
                                          onClick: () => {
                                            if (app.type === AppTypeEnum.httpPlugin) {
                                              toast({
                                                title: t('app:type.Http plugin_deprecated'),
                                                status: 'warning'
                                              });
                                            }
                                            setEditedApp({
                                              id: app._id,
                                              avatar: app.avatar,
                                              name: app.name,
                                              intro: app.intro
                                            });
                                          }
                                        },
                                        ...(folderDetail?.type === AppTypeEnum.httpPlugin &&
                                        !(parentApp ? parentApp.permission : app.permission)
                                          .hasManagePer
                                          ? []
                                          : [
                                              {
                                                icon: 'common/file/move',
                                                type: 'grayBg' as MenuItemType,
                                                label: t('common:move_to'),
                                                onClick: () => setMoveAppId(app._id)
                                              }
                                            ]),
                                        ...(app.permission.hasManagePer
                                          ? [
                                              {
                                                icon: 'key',
                                                type: 'grayBg' as MenuItemType,
                                                label: t('common:permission.Permission'),
                                                onClick: () => setEditPerAppId(app._id)
                                              }
                                            ]
                                          : [])
                                      ]
                                    }
                                  ]
                                : []),
                              ...(!app.permission?.hasWritePer ||
                              app.type === AppTypeEnum.mcpToolSet ||
                              app.type === AppTypeEnum.folder ||
                              app.type === AppTypeEnum.httpToolSet ||
                              app.type === AppTypeEnum.httpPlugin
                                ? []
                                : [
                                    {
                                      children: [
                                        {
                                          icon: 'copy',
                                          type: 'grayBg' as MenuItemType,
                                          label: t('app:copy_one_app'),
                                          onClick: () =>
                                            openConfirmCopy({
                                              onConfirm: () => onclickCopy({ appId: app._id })
                                            })()
                                        }
                                      ]
                                    }
                                  ]),
                              ...(app.permission.isOwner
                                ? [
                                    {
                                      children: [
                                        {
                                          type: 'danger' as 'danger',
                                          icon: 'delete',
                                          label: t('common:Delete'),
                                          onClick: () =>
                                            openConfirmDel({
                                              onConfirm: () => onclickDelApp(app._id),
                                              inputConfirmText: app.name,
                                              customContent: (() => {
                                                if (isFolder)
                                                  return t('app:confirm_delete_folder_tip');
                                                if (isAgent) return t('app:confirm_del_app_tip');
                                                if (isTool) return t('app:confirm_del_tool_tip');
                                                return t('app:confirm_del_app_tip');
                                              })()
                                            })()
                                        }
                                      ]
                                    }
                                  ]
                                : [])
                            ]}
                          />
                        </Box>
                      )}
                    </HStack>
                  </Grid>
                </MyBox>
              </MyTooltip>
            );
          })}
        </Grid>
      )}
      <DelConfirmModal />
      <ConfirmCopyModal />
      {!!editedApp && (
        <EditResourceModal
          {...editedApp}
          title={t('common:core.app.edit_content')}
          onClose={() => {
            setEditedApp(undefined);
          }}
          onEdit={({ id, ...data }) => onUpdateApp(id, data)}
        />
      )}
      {!!editPerApp && (
        <ConfigPerModal
          {...(editPerApp.permission.isOwner && {
            onChangeOwner: (tmbId: string) =>
              changeOwner({
                appId: editPerApp._id,
                ownerId: tmbId
              }).then(() => loadMyApps())
          })}
          refetchResource={loadMyApps}
          hasParent={Boolean(parentId)}
          resumeInheritPermission={onResumeInheritPermission}
          isInheritPermission={editPerApp.inheritPermission}
          avatar={editPerApp.avatar}
          name={editPerApp.name}
          managePer={{
            defaultRole: ReadRoleVal,
            permission: editPerApp.permission,
            onGetCollaboratorList: () => getCollaboratorList(editPerApp._id),
            roleList: AppRoleList,
            onUpdateCollaborators: (props) =>
              postUpdateAppCollaborators({
                ...props,
                appId: editPerApp._id
              }),
            onDelOneCollaborator: async (
              props: RequireOnlyOne<{
                tmbId?: string;
                groupId?: string;
                orgId?: string;
              }>
            ) =>
              deleteAppCollaborators({
                ...props,
                appId: editPerApp._id
              }),
            refreshDeps: [editPerApp.inheritPermission]
          }}
          onClose={() => setEditPerAppId(undefined)}
        />
      )}
      <MoveConfirmModal />
    </>
  );
};

const CreateButton = ({ appType }: { appType: AppTypeEnum | 'all' }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const parentId = router.query.parentId;
  const createAppType =
    appType !== 'all' && appType in createAppTypeMap
      ? createAppTypeMap[appType as keyof typeof createAppTypeMap].type
      : router.pathname.includes('/agent')
        ? AppTypeEnum.workflow
        : AppTypeEnum.workflowTool;
  const isToolType = ToolTypeList.includes(createAppType);

  return (
    <Box
      position="relative"
      width="100%"
      minH={'164px'}
      overflow="hidden"
      rounded={'12px'}
      cursor={'pointer'}
      border={'1px solid'}
      borderColor={omniTheme.colors.border}
      bg={'white'}
      onClick={() => {
        router.push(
          `/dashboard/create?appType=${createAppType}${parentId ? `&parentId=${parentId}` : ''}`
        );
      }}
      transition={'all 0.18s ease'}
      _hover={{
        borderColor: omniTheme.colors.saturatedBlue,
        boxShadow: omniTheme.shadows.card,
        transform: 'translateY(-1px)'
      }}
      userSelect={'none'}
      mt={4}
    >
      <Box
        position={'absolute'}
        inset={0}
        bg={`linear-gradient(135deg, ${omniTheme.colors.saturatedBlueSoft} 0%, rgba(255,255,255,0) 42%), linear-gradient(180deg, #FFFFFF 0%, ${omniTheme.colors.pageBg} 100%)`}
      />
      <VStack
        position="absolute"
        top="50%"
        left="50%"
        transform="translate(-50%, -50%)"
        color={omniTheme.colors.text}
        fontSize="30px"
        fontWeight={800}
        w={'100%'}
        px={6}
      >
        <Flex gap={2.5} alignItems={'center'}>
          <MyIcon name={'core/app/create'} w={8} color={omniTheme.colors.saturatedBlue} />
          {isToolType ? t('app:create_your_first_tool') : t('app:create_your_first_agent')}
        </Flex>
        <Box
          mt={4}
          h={14}
          w={'330px'}
          display={'flex'}
          alignItems={'center'}
          justifyContent={'center'}
          border={'1px dashed'}
          borderColor={omniTheme.colors.saturatedBlue}
          borderRadius={'12px'}
          bg={'rgba(255,255,255,0.72)'}
        >
          <MyIcon name={'common/addLight'} w={8} color={omniTheme.colors.saturatedBlue} />
        </Box>
      </VStack>
    </Box>
  );
};
const ListCreateButton = ({ appType }: { appType: AppTypeEnum | 'all' }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const parentId = router.query.parentId;
  const createAppType =
    appType !== 'all' && appType in createAppTypeMap
      ? createAppTypeMap[appType as keyof typeof createAppTypeMap].type
      : router.pathname.includes('/agent')
        ? AppTypeEnum.workflow
        : AppTypeEnum.workflowTool;

  return (
    <MyBox
      pt={3}
      pb={3}
      pl={5}
      pr={4}
      cursor={'pointer'}
      border={'1px solid'}
      borderColor={omniTheme.colors.border}
      bg={'white'}
      borderRadius={'12px'}
      position={'relative'}
      overflow={'hidden'}
      minH={'156px'}
      display={'flex'}
      flexDirection={'column'}
      transition={'all 0.18s ease'}
      _hover={{
        borderColor: omniTheme.colors.saturatedBlue,
        boxShadow: omniTheme.shadows.card,
        transform: 'translateY(-1px)',
        '& .create-box': {
          display: 'flex'
        }
      }}
      onClick={() => {
        router.push(
          `/dashboard/create?appType=${createAppType}${parentId ? `&parentId=${parentId}` : ''}`
        );
      }}
    >
      <Flex
        position={'relative'}
        zIndex={1}
        alignItems={'center'}
        justifyContent={'space-between'}
        gap={3}
        pb={2.5}
        borderBottom={'1px solid #EDF1F6'}
      >
        <Box minW={0}>
          <Box color={omniTheme.colors.text} fontSize={'sm'} fontWeight={800}>
            {t('common:new_create')}
          </Box>
          <Box mt={1} color={omniTheme.colors.saturatedBlue} fontSize={'11px'} fontWeight={800}>
            {router.pathname.includes('/agent') ? 'Agent' : 'Tool'}
          </Box>
        </Box>
        <Flex
          w={'34px'}
          h={'34px'}
          alignItems={'center'}
          justifyContent={'center'}
          flexShrink={0}
          borderRadius={'10px'}
          bg={omniTheme.colors.saturatedBlueSoft}
        >
          <MyIcon name={'common/addLight'} w={5} color={omniTheme.colors.saturatedBlue} />
        </Flex>
      </Flex>
      <Box
        mt={3}
        mb={2}
        h={'100%'}
        w={'100%'}
        display={'flex'}
        alignItems={'center'}
        justifyContent={'center'}
        position={'relative'}
        flex={'1 0 56px'}
      >
        <Box
          className="create-box"
          display={'none'}
          position={'absolute'}
          top={'1px'}
          left={'1px'}
          right={'1px'}
          bottom={'1px'}
          bg={omniTheme.colors.saturatedBlueSoft}
          borderRadius={'14px'}
        />
        <Box
          w={'100%'}
          h={'100%'}
          display={'flex'}
          alignItems={'center'}
          justifyContent={'center'}
          border={'1px dashed'}
          borderColor={omniTheme.colors.saturatedBlue}
          borderRadius={'12px'}
        >
          <MyIcon
            name={'common/addLight'}
            w={8}
            color={omniTheme.colors.saturatedBlue}
            zIndex={1}
          />
        </Box>
      </Box>
    </MyBox>
  );
};
const ForbiddenCreateButton = () => {
  const { t } = useTranslation();
  return (
    <MyBox
      pt={3}
      pb={3}
      pl={5}
      pr={4}
      cursor={'not-allowed'}
      border={'1px solid'}
      borderColor={omniTheme.colors.border}
      bg={'white'}
      borderRadius={'12px'}
      position={'relative'}
      overflow={'hidden'}
      minH={'156px'}
      display={'flex'}
      flexDirection={'column'}
    >
      <Flex
        position={'relative'}
        zIndex={1}
        alignItems={'center'}
        justifyContent={'space-between'}
        gap={3}
        pb={2.5}
        borderBottom={'1px solid #EDF1F6'}
      >
        <Box minW={0}>
          <Box color={omniTheme.colors.text} fontSize={'sm'} fontWeight={800}>
            {t('common:new_create')}
          </Box>
          <Box mt={1} color={omniTheme.colors.muted} fontSize={'11px'} fontWeight={800}>
            Disabled
          </Box>
        </Box>
        <Flex
          w={'34px'}
          h={'34px'}
          alignItems={'center'}
          justifyContent={'center'}
          flexShrink={0}
          borderRadius={'10px'}
          bg={'myGray.50'}
        >
          <MyIcon name={'common/disable'} w={5} color={'#DFE2EA'} />
        </Flex>
      </Flex>
      <Box
        mt={3}
        mb={2}
        h={'100%'}
        w={'100%'}
        display={'flex'}
        alignItems={'center'}
        justifyContent={'center'}
        position={'relative'}
        flex={'1 0 56px'}
      >
        <Box
          position={'absolute'}
          top={'1px'}
          left={'1px'}
          right={'1px'}
          bottom={'1px'}
          bg={'myGray.50'}
          borderRadius={'14px'}
        />
        <Box
          w={'100%'}
          h={'100%'}
          display={'flex'}
          flexDirection={'column'}
          alignItems={'center'}
          justifyContent={'center'}
          border={'1px dashed'}
          borderColor={omniTheme.colors.border}
          borderRadius={'12px'}
        >
          <MyIcon name={'common/disable'} w={'34px'} color={'#DFE2EA'} zIndex={1} />
          <Box color={'myGray.500'} fontSize={'11px'} fontWeight={'medium'} zIndex={1}>
            {t('app:has_no_create_per')}
          </Box>
        </Box>
      </Box>
    </MyBox>
  );
};

export default List;
