import AvatarGroup from '@fastgpt/web/components/common/Avatar/AvatarGroup';
import {
  Box,
  Button,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useDisclosure
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyMenu, { type MenuItemType } from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { deleteGroup, getGroupList } from '@/web/support/user/team/group/api';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import MemberTag from '../../../../components/support/user/team/Info/MemberTag';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import IconButton from '../OrgManage/IconButton';
import { type MemberGroupListItemType } from '@fastgpt/global/support/permission/memberGroup/type';
import { TeamSectionLayout } from '../TeamSectionLayout';
import { omniTheme } from '@/web/common/brand/theme';

const ChangeOwnerModal = dynamic(() => import('./GroupTransferOwnerModal'));
const GroupInfoModal = dynamic(() => import('./GroupInfoModal'));
const GroupManageMember = dynamic(() => import('./GroupManageMember'));

function MemberTable() {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();

  const {
    data: groups = [],
    loading: isLoadingGroups,
    refresh: refetchGroups
  } = useRequest(() => getGroupList<true>({ withMembers: true }), {
    manual: false,
    refreshDeps: [userInfo?.team?.teamId]
  });

  const [editGroup, setEditGroup] = useState<MemberGroupListItemType<true>>();

  const {
    isOpen: isOpenGroupInfo,
    onOpen: onOpenGroupInfo,
    onClose: onCloseGroupInfo
  } = useDisclosure();
  const onEditGroupInfo = (e: MemberGroupListItemType<true>) => {
    setEditGroup(e);
    onOpenGroupInfo();
  };

  const { ConfirmModal: ConfirmDeleteGroupModal, openConfirm: openDeleteGroupModal } = useConfirm({
    type: 'delete',
    content: t('account_team:confirm_delete_group')
  });
  const { runAsync: delDeleteGroup } = useRequest(deleteGroup, {
    onSuccess: () => {
      refetchGroups();
    }
  });

  const {
    isOpen: isOpenManageGroupMember,
    onOpen: onOpenManageGroupMember,
    onClose: onCloseManageGroupMember
  } = useDisclosure();
  const onManageMember = (e: MemberGroupListItemType<true>) => {
    setEditGroup(e);
    onOpenManageGroupMember();
  };

  const {
    isOpen: isOpenChangeOwner,
    onOpen: onOpenChangeOwner,
    onClose: onCloseChangeOwner
  } = useDisclosure();
  const onChangeOwner = (e: MemberGroupListItemType<true>) => {
    setEditGroup(e);
    onOpenChangeOwner();
  };

  return (
    <>
      <TeamSectionLayout
        title={t('account_team:group')}
        description={t('account_team:group_manage_desc')}
        actions={
          userInfo?.team.permission.hasManagePer && (
            <Button
              variant="primary"
              size="md"
              borderRadius={omniTheme.radii.sm}
              leftIcon={<MyIcon name="support/permission/collaborator" w="14px" />}
              onClick={onOpenGroupInfo}
            >
              {t('user:team.group.create')}
            </Button>
          )
        }
      >
        <MyBox
          flex={1}
          minH={0}
          overflow="auto"
          p={0}
          isLoading={isLoadingGroups}
          border="none"
          borderRadius={0}
          boxShadow="none"
        >
          <TableContainer overflow={'unset'} fontSize={'sm'}>
            <Table minW="720px" overflow={'unset'}>
              <Thead>
                <Tr>
                  <Th
                    position="sticky"
                    top={0}
                    zIndex={2}
                    bg={omniTheme.colors.sidebarBg}
                    borderBottom="1px solid"
                    borderColor={omniTheme.colors.border}
                  >
                    {t('account_team:group_name')}
                  </Th>
                  <Th
                    position="sticky"
                    top={0}
                    zIndex={2}
                    bg={omniTheme.colors.sidebarBg}
                    borderBottom="1px solid"
                    borderColor={omniTheme.colors.border}
                  >
                    {t('account_team:owner')}
                  </Th>
                  <Th
                    position="sticky"
                    top={0}
                    zIndex={2}
                    bg={omniTheme.colors.sidebarBg}
                    borderBottom="1px solid"
                    borderColor={omniTheme.colors.border}
                  >
                    {t('account_team:member')}
                  </Th>
                  <Th
                    position="sticky"
                    top={0}
                    zIndex={2}
                    w="72px"
                    minW="72px"
                    bg={omniTheme.colors.sidebarBg}
                    borderBottom="1px solid"
                    borderColor={omniTheme.colors.border}
                    textAlign="center"
                  >
                    {t('common:Action')}
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {groups?.map((group) => (
                  <Tr
                    key={group._id}
                    overflow={'unset'}
                    transition="background-color 0.15s ease"
                    _hover={{ bg: omniTheme.colors.pageBg }}
                  >
                    <Td>
                      <MemberTag
                        name={
                          group.name === DefaultGroupName
                            ? userInfo?.team.teamName ?? ''
                            : group.name
                        }
                        avatar={group.avatar}
                      />
                    </Td>
                    <Td>
                      <MemberTag name={group.owner?.name} avatar={group.owner?.avatar} />
                    </Td>
                    <Td>
                      <MyTooltip
                        label={
                          group.permission?.hasManagePer ? t('account_team:manage_member') : ''
                        }
                      >
                        <Box
                          {...(group.permission?.hasManagePer
                            ? {
                                cursor: 'pointer',
                                onClick: () => onManageMember(group)
                              }
                            : {})}
                        >
                          <AvatarGroup
                            avatars={group?.members.map((v) => v.avatar)}
                            total={group.count}
                          />
                        </Box>
                      </MyTooltip>
                    </Td>
                    <Td w="72px" minW="72px" textAlign="center">
                      {group.permission?.hasManagePer && (
                        <Box display="inline-flex">
                          <MyMenu
                            Button={<IconButton name={'more'} />}
                            menuList={[
                              {
                                children: [
                                  {
                                    label: t('account_team:edit_info'),
                                    icon: 'edit',
                                    onClick: () => {
                                      onEditGroupInfo(group);
                                    }
                                  },
                                  {
                                    label: t('account_team:manage_member'),
                                    icon: 'support/team/group',
                                    onClick: () => {
                                      onManageMember(group);
                                    }
                                  },
                                  ...(group.permission?.isOwner
                                    ? [
                                        {
                                          label: t('account_team:transfer_ownership'),
                                          icon: 'modal/changePer',
                                          onClick: () => {
                                            onChangeOwner(group);
                                          },
                                          type: 'primary' as MenuItemType
                                        },
                                        {
                                          label: t('common:Delete'),
                                          icon: 'delete',
                                          onClick: () => {
                                            openDeleteGroupModal({
                                              onConfirm: () => delDeleteGroup(group._id)
                                            })();
                                          },
                                          type: 'danger' as MenuItemType
                                        }
                                      ]
                                    : [])
                                ]
                              }
                            ]}
                          />
                        </Box>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </MyBox>
      </TeamSectionLayout>

      <ConfirmDeleteGroupModal />

      {isOpenGroupInfo && (
        <GroupInfoModal
          editGroup={editGroup}
          onSuccess={refetchGroups}
          onClose={() => {
            onCloseGroupInfo();
            setEditGroup(undefined);
          }}
        />
      )}
      {isOpenChangeOwner && editGroup && (
        <ChangeOwnerModal
          group={editGroup}
          onClose={onCloseChangeOwner}
          onSuccess={refetchGroups}
        />
      )}

      {isOpenManageGroupMember && editGroup && (
        <GroupManageMember
          group={editGroup}
          onClose={() => {
            onCloseManageGroupMember();
            setEditGroup(undefined);
          }}
          onSuccess={refetchGroups}
        />
      )}
    </>
  );
}

export default MemberTable;
