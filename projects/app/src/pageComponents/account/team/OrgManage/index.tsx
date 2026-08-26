import { useUserStore } from '@/web/support/user/useUserStore';
import {
  Box,
  Button,
  HStack,
  Table,
  TableContainer,
  Tag,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import type { OrgListItemType } from '@fastgpt/global/support/user/team/org/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useMemo, useState } from 'react';
import MemberTag from '@/components/support/user/team/Info/MemberTag';
import { deleteOrg, deleteOrgMember } from '@/web/support/user/team/org/api';

import IconButton from './IconButton';
import { defaultOrgForm, type OrgFormType } from './OrgInfoModal';

import dynamic from 'next/dynamic';
import MyBox from '@fastgpt/web/components/common/MyBox';
import Path from '@/components/common/folder/Path';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { delRemoveMember } from '@/web/support/user/team/api';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import useOrg from '@/web/support/user/team/org/hooks/useOrg';
import { TeamSectionLayout } from '../TeamSectionLayout';
import { omniTheme } from '@/web/common/brand/theme';

const OrgInfoModal = dynamic(() => import('./OrgInfoModal'));
const OrgMemberManageModal = dynamic(() => import('./OrgMemberManageModal'));
const OrgMoveModal = dynamic(() => import('./OrgMoveModal'));

function OrgTable() {
  const { t } = useTranslation();
  const { userInfo, isTeamAdmin } = useUserStore();
  const { feConfigs } = useSystemStore();
  const isSyncMember = feConfigs.register_method?.includes('sync');
  const [editOrg, setEditOrg] = useState<OrgFormType>();
  const [manageMemberOrg, setManageMemberOrg] = useState<OrgListItemType>();
  const [movingOrg, setMovingOrg] = useState<OrgListItemType>();
  const {
    currentOrg,
    orgs,
    isLoading,
    paths,
    onClickOrg,
    members,
    MemberScrollData,
    onPathClick,
    refresh,
    updateCurrentOrg,
    setSearchKey,
    searchKey
  } = useOrg();

  // Delete org
  const { ConfirmModal: ConfirmDeleteOrgModal, openConfirm: openDeleteOrgModal } = useConfirm({
    type: 'delete',
    content: t('account_team:confirm_delete_org')
  });
  const deleteOrgHandler = (orgId: string) =>
    openDeleteOrgModal({ onConfirm: () => deleteOrgReq(orgId) })();
  const { runAsync: deleteOrgReq } = useRequest(deleteOrg, {
    onSuccess: refresh
  });

  // Delete member
  const { ConfirmModal: ConfirmDeleteMemberFromOrg, openConfirm: openDeleteMemberFromOrgModal } =
    useConfirm({
      type: 'delete'
    });

  const { ConfirmModal: ConfirmDeleteMemberFromTeam, openConfirm: openDeleteMemberFromTeamModal } =
    useConfirm({
      type: 'delete'
    });

  const { runAsync: deleteMemberReq } = useRequest(deleteOrgMember, {
    onSuccess: refresh
  });

  const { runAsync: deleteMemberFromTeamReq } = useRequest(delRemoveMember, {
    onSuccess: refresh
  });

  return (
    <>
      <TeamSectionLayout
        title={t('account_team:org')}
        description={t('account_team:org_manage_desc')}
        actions={
          <HStack minW={0} justify="flex-end" flexWrap={{ base: 'wrap', md: 'nowrap' }} gap={2}>
            <Box maxW="220px" minW={0} overflow="hidden">
              <Path
                paths={paths}
                rootName={userInfo?.team?.teamName}
                onClick={onPathClick}
                fontSize="xs"
              />
            </Box>
            <Box w={{ base: '180px', md: '220px' }} flexShrink={0}>
              <SearchInput
                placeholder={t('account_team:search_org')}
                value={searchKey}
                onChange={(e) => setSearchKey(e.target.value)}
              />
            </Box>
            {isTeamAdmin && !isSyncMember && (
              <>
                <Button
                  variant="whitePrimary"
                  size="md"
                  borderRadius={omniTheme.radii.sm}
                  leftIcon={<MyIcon name="common/administrator" w="15px" />}
                  onClick={() => setManageMemberOrg(currentOrg)}
                >
                  {t('account_team:manage_member')}
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  borderRadius={omniTheme.radii.sm}
                  leftIcon={<MyIcon name="common/add2" w="15px" />}
                  onClick={() =>
                    setEditOrg({
                      ...defaultOrgForm,
                      path: currentOrg.path
                    })
                  }
                >
                  {t('account_team:create_sub_org')}
                </Button>
                {currentOrg.path !== '' && (
                  <Box display="inline-flex">
                    <MyMenu
                      trigger="hover"
                      Button={<IconButton name="more" />}
                      menuList={[
                        {
                          children: [
                            {
                              icon: 'edit',
                              label: t('account_team:edit_info'),
                              onClick: () => setEditOrg(currentOrg)
                            },
                            {
                              icon: 'common/file/move',
                              label: t('account_team:move_org'),
                              onClick: () => setMovingOrg(currentOrg)
                            },
                            {
                              icon: 'delete',
                              label: t('account_team:delete_org'),
                              type: 'danger',
                              onClick: () => deleteOrgHandler(currentOrg._id)
                            }
                          ]
                        }
                      ]}
                    />
                  </Box>
                )}
              </>
            )}
          </HStack>
        }
      >
        <MyBox
          flex={1}
          minH={0}
          display="flex"
          overflow="hidden"
          p={0}
          border="none"
          borderRadius={0}
          boxShadow="none"
        >
          <MemberScrollData flex="1" isLoading={isLoading}>
            <TableContainer h="100%" overflowY="auto">
              <Table minW="560px">
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
                      {t('common:Name')}
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
                  {orgs
                    .filter((org) => org.path !== '')
                    .map((org) => (
                      <Tr
                        key={org._id}
                        overflow={'unset'}
                        transition="background-color 0.15s ease"
                        _hover={{ bg: omniTheme.colors.pageBg }}
                      >
                        <Td>
                          <HStack cursor={'pointer'} onClick={() => onClickOrg(org)}>
                            <MemberTag name={org.name} avatar={org.avatar} />
                            <Tag size="sm">{org.total}</Tag>
                            <MyIcon
                              name="core/chat/chevronRight"
                              w={'1rem'}
                              h={'1rem'}
                              color={'myGray.500'}
                            />
                          </HStack>
                        </Td>
                        <Td w="72px" minW="72px" textAlign="center">
                          {isTeamAdmin && !isSyncMember && (
                            <Box display="inline-flex">
                              <MyMenu
                                trigger="hover"
                                Button={<IconButton name="more" />}
                                menuList={[
                                  {
                                    children: [
                                      {
                                        icon: 'edit',
                                        label: t('account_team:edit_info'),
                                        onClick: () => setEditOrg(org)
                                      },
                                      {
                                        icon: 'common/file/move',
                                        label: t('common:Move'),
                                        onClick: () => setMovingOrg(org)
                                      },
                                      {
                                        icon: 'delete',
                                        label: t('account_team:delete'),
                                        type: 'danger',
                                        onClick: () => deleteOrgHandler(org._id)
                                      }
                                    ]
                                  }
                                ]}
                              />
                            </Box>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  {!searchKey &&
                    members.map((member) => {
                      return (
                        <Tr
                          key={member.tmbId}
                          transition="background-color 0.15s ease"
                          _hover={{ bg: omniTheme.colors.pageBg }}
                        >
                          <Td>
                            <MemberTag name={member.memberName} avatar={member.avatar} />
                          </Td>
                          <Td w="72px" minW="72px" textAlign="center">
                            {isTeamAdmin && (
                              <Box display="inline-flex">
                                <MyMenu
                                  trigger={'hover'}
                                  Button={<IconButton name="more" />}
                                  menuList={[
                                    {
                                      children: [
                                        {
                                          menuItemStyles: {
                                            _hover: {
                                              color: 'red.600',
                                              backgroundColor: 'red.50'
                                            }
                                          },
                                          label: t('account_team:delete_from_team', {
                                            username: member.memberName
                                          }),
                                          onClick: () => {
                                            openDeleteMemberFromTeamModal({
                                              onConfirm: () =>
                                                deleteMemberFromTeamReq(member.tmbId),
                                              customContent: t(
                                                'account_team:confirm_delete_from_team',
                                                {
                                                  username: member.memberName
                                                }
                                              )
                                            })();
                                          }
                                        },
                                        ...(isSyncMember
                                          ? []
                                          : [
                                              {
                                                menuItemStyles: {
                                                  _hover: {
                                                    color: 'red.600',
                                                    bgColor: 'red.50'
                                                  }
                                                },
                                                label: t('account_team:delete_from_org'),
                                                onClick: () =>
                                                  openDeleteMemberFromOrgModal({
                                                    onConfirm: () => {
                                                      if (currentOrg) {
                                                        return deleteMemberReq(
                                                          currentOrg._id,
                                                          member.tmbId
                                                        );
                                                      }
                                                    },
                                                    customContent: t(
                                                      'account_team:confirm_delete_from_org',
                                                      {
                                                        username: member.memberName
                                                      }
                                                    )
                                                  })()
                                              }
                                            ])
                                      ]
                                    }
                                  ]}
                                />
                              </Box>
                            )}
                          </Td>
                        </Tr>
                      );
                    })}
                </Tbody>
              </Table>
            </TableContainer>
          </MemberScrollData>
        </MyBox>
      </TeamSectionLayout>

      {!!editOrg && (
        <OrgInfoModal
          editOrg={editOrg}
          onClose={() => setEditOrg(undefined)}
          onSuccess={refresh}
          updateCurrentOrg={updateCurrentOrg}
          parentId={currentOrg._id}
        />
      )}
      {!!movingOrg && (
        <OrgMoveModal
          movingOrg={movingOrg}
          onClose={() => setMovingOrg(undefined)}
          onSuccess={refresh}
        />
      )}
      {!!manageMemberOrg && (
        <OrgMemberManageModal
          currentOrg={manageMemberOrg}
          refetchOrgs={refresh}
          onClose={() => setManageMemberOrg(undefined)}
        />
      )}

      <ConfirmDeleteOrgModal />
      <ConfirmDeleteMemberFromOrg />
      <ConfirmDeleteMemberFromTeam />
    </>
  );
}

export default OrgTable;
