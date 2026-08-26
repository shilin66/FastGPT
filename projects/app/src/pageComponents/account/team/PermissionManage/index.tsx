import React, { useMemo, useState } from 'react';
import {
  Box,
  Checkbox,
  HStack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Text,
  Tr,
  Button
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  deleteMemberPermission,
  getTeamClbs,
  updateMemberPermission,
  updateOneMemberPermission
} from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MemberTag from '../../../../components/support/user/team/Info/MemberTag';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import {
  TeamApikeyCreatePermissionVal,
  TeamApikeyCreateRoleVal,
  TeamAppCreatePermissionVal,
  TeamAppCreateRoleVal,
  TeamDatasetCreatePermissionVal,
  TeamDatasetCreateRoleVal,
  TeamManagePermissionVal,
  TeamManageRoleVal,
  TeamSkillCreatePermissionVal,
  TeamSkillCreateRoleVal,
  TeamRoleList
} from '@fastgpt/global/support/permission/user/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { useToggle } from 'ahooks';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyBox from '@fastgpt/web/components/common/MyBox';
import CollaboratorContextProvider, {
  CollaboratorContext
} from '@/components/support/permission/MemberManager/context';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { GetSearchUserGroupOrg } from '@/web/support/user/api';
import { type PermissionValueType } from '@fastgpt/global/support/permission/type';
import { type CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import type { Permission } from '@fastgpt/global/support/permission/controller';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { TeamSectionLayout } from '../TeamSectionLayout';
import { omniTheme } from '@/web/common/brand/theme';

function PermissionManage({ onOpenAddMember }: { onOpenAddMember: () => void }) {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { feConfigs } = useSystemStore();
  const showSkill = !!feConfigs?.show_skill;

  const collaboratorList = useContextSelector(
    CollaboratorContext,
    (state) => state.collaboratorList
  );
  const onDelOneCollaborator = useContextSelector(
    CollaboratorContext,
    (state) => state.onDelOneCollaborator
  );
  const refetchCollaborators = useContextSelector(
    CollaboratorContext,
    (state) => state.refetchCollaboratorList
  );

  const [isExpandMember, setExpandMember] = useToggle(true);
  const [isExpandGroup, setExpandGroup] = useToggle(true);
  const [isExpandOrg, setExpandOrg] = useToggle(true);

  const [searchKey, setSearchKey] = useState('');

  const { data: searchResult } = useRequest(() => GetSearchUserGroupOrg(searchKey), {
    manual: false,
    throttleWait: 500,
    debounceWait: 200,
    refreshDeps: [searchKey]
  });

  const { tmbList, groupList, orgList } = useMemo(() => {
    const tmbList = collaboratorList.filter(
      (item) =>
        Object.keys(item).includes('tmbId') &&
        (!searchKey || searchResult?.members.find((member) => member.tmbId === item.tmbId))
    );
    const groupList = collaboratorList.filter(
      (item) =>
        Object.keys(item).includes('groupId') &&
        (!searchKey || searchResult?.groups.find((group) => group._id === item.groupId))
    );
    const orgList = collaboratorList.filter(
      (item) =>
        Object.keys(item).includes('orgId') &&
        (!searchKey || searchResult?.orgs.find((org) => org._id === item.orgId))
    );

    return {
      tmbList,
      groupList,
      orgList
    };
  }, [collaboratorList, searchResult, searchKey]);

  const { runAsync: onUpdatePermission, loading: addLoading } = useRequest(
    async ({ id, type, per }: { id: string; type: 'add' | 'remove'; per: PermissionValueType }) => {
      const clb = collaboratorList.find(
        (clb) => clb.tmbId === id || clb.groupId === id || clb.orgId === id
      );

      if (!clb) return;

      const permission = new TeamPermission({ role: clb.permission.role });
      if (type === 'add') {
        permission.addRole(per);
      } else {
        permission.removeRole(per);
      }

      return updateOneMemberPermission({
        tmbId: clb.tmbId,
        groupId: clb.groupId,
        orgId: clb.orgId,
        permission: permission.role
      });
    },
    {
      onSuccess: refetchCollaborators
    }
  );

  const { runAsync: onDeleteMemberPermission, loading: deleteLoading } = useRequest(
    async (props) => {
      if (onDelOneCollaborator) {
        return await onDelOneCollaborator(props);
      }
      return Promise.resolve();
    }
  );

  const userManage = userInfo?.permission.hasManagePer;
  const permissionColumnCount = showSkill ? 7 : 6;
  const hasDeletePer = (per: Permission) => {
    if (userInfo?.permission.isOwner) return true;
    if (userManage && !per.hasManagePer) return true;
    return false;
  };

  function PermissionCheckBox({
    isDisabled,
    role,
    clbPer,
    id
  }: {
    isDisabled: boolean;
    role: PermissionValueType;
    clbPer: Permission;
    id: string;
  }) {
    return (
      <Td>
        <Box mx="auto" w="fit-content">
          <Checkbox
            isDisabled={isDisabled}
            isChecked={clbPer.checkRole(role)}
            onChange={(e) =>
              e.target.checked
                ? onUpdatePermission({
                    id,
                    type: 'add',
                    per: role
                  })
                : onUpdatePermission({
                    id,
                    type: 'remove',
                    per: role
                  })
            }
          />
        </Box>
      </Td>
    );
  }

  return (
    <TeamSectionLayout
      title={t('account_team:permission')}
      description={t('account_team:permission_manage_desc')}
      actions={
        <HStack justify="flex-end" flexWrap={{ base: 'wrap', md: 'nowrap' }} gap={2}>
          <SearchInput
            placeholder={t('user:search_group_org_user')}
            w={{ base: '200px', md: '240px' }}
            flexShrink={0}
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
          />
          {userInfo?.team.permission.hasManagePer && (
            <Button
              variant="primary"
              size="md"
              flexShrink={0}
              borderRadius={omniTheme.radii.sm}
              leftIcon={<MyIcon name="support/permission/collaborator" w="15px" />}
              onClick={onOpenAddMember}
            >
              {t('account_team:manage_per')}
            </Button>
          )}
        </HStack>
      }
    >
      <MyBox
        isLoading={addLoading || deleteLoading}
        flex={1}
        minH={0}
        overflow="hidden"
        p={0}
        border="none"
        borderRadius={0}
        boxShadow="none"
      >
        <TableContainer h="100%" overflowY="auto" fontSize="sm">
          <Table minW="900px">
            <Thead>
              <Tr>
                <Th
                  position="sticky"
                  top={0}
                  left={0}
                  zIndex={4}
                  bg={omniTheme.colors.sidebarBg}
                  borderBottom="1px solid"
                  borderColor={omniTheme.colors.border}
                  minW="220px"
                >
                  {`${t('user:team.group.members')} / ${t('user:team.org.org')} / ${t('user:team.group.group')}`}
                  <QuestionTip ml="1" label={t('user:team.group.permission_tip')} />
                </Th>
                <Th
                  position="sticky"
                  top={0}
                  zIndex={3}
                  minW="132px"
                  bg={omniTheme.colors.sidebarBg}
                  borderBottom="1px solid"
                  borderColor={omniTheme.colors.border}
                >
                  <Box mx="auto" w="fit-content">
                    {t('account_team:permission_appCreate')}
                    <QuestionTip ml="1" label={t('account_team:permission_appCreate_tip')} />
                  </Box>
                </Th>
                {showSkill && (
                  <Th
                    position="sticky"
                    top={0}
                    zIndex={3}
                    minW="132px"
                    bg={omniTheme.colors.sidebarBg}
                    borderBottom="1px solid"
                    borderColor={omniTheme.colors.border}
                  >
                    <Box mx="auto" w="fit-content">
                      {t('account_team:permission_skillCreate')}
                      <QuestionTip ml="1" label={t('account_team:permission_skillCreate_Tip')} />
                    </Box>
                  </Th>
                )}
                <Th
                  position="sticky"
                  top={0}
                  zIndex={3}
                  minW="132px"
                  bg={omniTheme.colors.sidebarBg}
                  borderBottom="1px solid"
                  borderColor={omniTheme.colors.border}
                >
                  <Box mx="auto" w="fit-content">
                    {t('account_team:permission_datasetCreate')}
                    <QuestionTip ml="1" label={t('account_team:permission_datasetCreate_Tip')} />
                  </Box>
                </Th>
                <Th
                  position="sticky"
                  top={0}
                  zIndex={3}
                  minW="132px"
                  bg={omniTheme.colors.sidebarBg}
                  borderBottom="1px solid"
                  borderColor={omniTheme.colors.border}
                >
                  <Box mx="auto" w="fit-content">
                    {t('account_team:permission_apikeyCreate')}
                    <QuestionTip ml="1" label={t('account_team:permission_apikeyCreate_Tip')} />
                  </Box>
                </Th>
                <Th
                  position="sticky"
                  top={0}
                  zIndex={3}
                  minW="132px"
                  bg={omniTheme.colors.sidebarBg}
                  borderBottom="1px solid"
                  borderColor={omniTheme.colors.border}
                >
                  <Box mx="auto" w="fit-content">
                    {t('account_team:permission_manage')}
                    <QuestionTip ml="1" label={t('account_team:permission_manage_tip')} />
                  </Box>
                </Th>
                <Th
                  position="sticky"
                  top={0}
                  zIndex={3}
                  w="72px"
                  minW="72px"
                  bg={omniTheme.colors.sidebarBg}
                  borderBottom="1px solid"
                  borderColor={omniTheme.colors.border}
                >
                  <Box mx="auto" w="fit-content">
                    {t('common:Action')}
                  </Box>
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              <>
                <Tr userSelect="none">
                  <Td colSpan={permissionColumnCount} p={0} bg={omniTheme.colors.pageBg}>
                    <HStack px={3} py={2.5}>
                      <MyIconButton
                        icon={isExpandMember ? 'common/downArrowFill' : 'common/rightArrowFill'}
                        onClick={setExpandMember.toggle}
                      />
                      <Box color={omniTheme.colors.graphite} fontWeight={700}>
                        {t('user:team.group.members')}
                      </Box>
                      <Box color={omniTheme.colors.muted} fontSize="xs">
                        {tmbList.length}
                      </Box>
                    </HStack>
                  </Td>
                </Tr>
                {isExpandMember &&
                  tmbList.map((member) => (
                    <Tr
                      key={member.tmbId}
                      transition="background-color 0.15s ease"
                      _hover={{ bg: omniTheme.colors.pageBg }}
                    >
                      <Td position="sticky" left={0} zIndex={1} pl={10} bg="white">
                        <HStack>
                          <Avatar src={member.avatar} w="1.5rem" borderRadius={'50%'} />
                          <Box>{member.name}</Box>
                        </HStack>
                      </Td>
                      <PermissionCheckBox
                        isDisabled={member.permission.hasManagePer && !userInfo?.permission.isOwner}
                        role={TeamAppCreateRoleVal}
                        clbPer={member.permission}
                        id={member.tmbId!}
                      />
                      {showSkill && (
                        <PermissionCheckBox
                          isDisabled={
                            member.permission.hasManagePer && !userInfo?.permission.isOwner
                          }
                          role={TeamSkillCreateRoleVal}
                          clbPer={member.permission}
                          id={member.tmbId!}
                        />
                      )}
                      <PermissionCheckBox
                        isDisabled={member.permission.hasManagePer && !userInfo?.permission.isOwner}
                        role={TeamDatasetCreateRoleVal}
                        clbPer={member.permission}
                        id={member.tmbId!}
                      />
                      <PermissionCheckBox
                        isDisabled={member.permission.hasManagePer && !userInfo?.permission.isOwner}
                        role={TeamApikeyCreateRoleVal}
                        clbPer={member.permission}
                        id={member.tmbId!}
                      />
                      <PermissionCheckBox
                        isDisabled={!userInfo?.permission.isOwner}
                        role={TeamManageRoleVal}
                        clbPer={member.permission}
                        id={member.tmbId!}
                      />
                      <Td w="72px" minW="72px" textAlign="center">
                        {hasDeletePer(member.permission) &&
                          userInfo?.team.tmbId !== member.tmbId && (
                            <Box mx="auto" w="fit-content">
                              <MyIconButton
                                icon="common/trash"
                                onClick={() =>
                                  onDeleteMemberPermission({ tmbId: String(member.tmbId) })
                                }
                              />
                            </Box>
                          )}
                      </Td>
                    </Tr>
                  ))}
              </>
              <>
                <Tr userSelect="none">
                  <Td colSpan={permissionColumnCount} p={0} bg={omniTheme.colors.pageBg}>
                    <HStack px={3} py={2.5}>
                      <MyIconButton
                        icon={isExpandOrg ? 'common/downArrowFill' : 'common/rightArrowFill'}
                        onClick={setExpandOrg.toggle}
                      />
                      <Text color={omniTheme.colors.graphite} fontWeight={700}>
                        {t('user:team.org.org')}
                      </Text>
                      <Box color={omniTheme.colors.muted} fontSize="xs">
                        {orgList.length}
                      </Box>
                    </HStack>
                  </Td>
                </Tr>
                {isExpandOrg &&
                  orgList.map((org) => (
                    <Tr
                      key={org.orgId}
                      transition="background-color 0.15s ease"
                      _hover={{ bg: omniTheme.colors.pageBg }}
                    >
                      <Td position="sticky" left={0} zIndex={1} pl={10} bg="white">
                        <MemberTag name={org.name} avatar={org.avatar} />
                      </Td>
                      <PermissionCheckBox
                        isDisabled={org.permission.isOwner || !userManage}
                        role={TeamAppCreatePermissionVal}
                        clbPer={org.permission}
                        id={org.orgId!}
                      />
                      {showSkill && (
                        <PermissionCheckBox
                          isDisabled={org.permission.isOwner || !userManage}
                          role={TeamSkillCreatePermissionVal}
                          clbPer={org.permission}
                          id={org.orgId!}
                        />
                      )}
                      <PermissionCheckBox
                        isDisabled={org.permission.isOwner || !userManage}
                        role={TeamDatasetCreatePermissionVal}
                        clbPer={org.permission}
                        id={org.orgId!}
                      />
                      <PermissionCheckBox
                        isDisabled={org.permission.isOwner || !userManage}
                        role={TeamApikeyCreatePermissionVal}
                        clbPer={org.permission}
                        id={org.orgId!}
                      />
                      <PermissionCheckBox
                        isDisabled={org.permission.isOwner || !userInfo?.permission.isOwner}
                        role={TeamManagePermissionVal}
                        clbPer={org.permission}
                        id={org.orgId!}
                      />
                      <Td w="72px" minW="72px" textAlign="center">
                        {hasDeletePer(org.permission) && (
                          <Box mx="auto" w="fit-content">
                            <MyIconButton
                              icon="common/trash"
                              onClick={() => onDeleteMemberPermission({ orgId: org.orgId! })}
                            />
                          </Box>
                        )}
                      </Td>
                    </Tr>
                  ))}
              </>

              <>
                <Tr userSelect="none">
                  <Td colSpan={permissionColumnCount} p={0} bg={omniTheme.colors.pageBg}>
                    <HStack px={3} py={2.5}>
                      <MyIconButton
                        icon={isExpandGroup ? 'common/downArrowFill' : 'common/rightArrowFill'}
                        onClick={setExpandGroup.toggle}
                      />
                      <Text color={omniTheme.colors.graphite} fontWeight={700}>
                        {t('user:team.group.group')}
                      </Text>
                      <Box color={omniTheme.colors.muted} fontSize="xs">
                        {groupList.length}
                      </Box>
                    </HStack>
                  </Td>
                </Tr>
                {isExpandGroup &&
                  groupList.map((group) => (
                    <Tr
                      key={group.groupId}
                      transition="background-color 0.15s ease"
                      _hover={{ bg: omniTheme.colors.pageBg }}
                    >
                      <Td position="sticky" left={0} zIndex={1} pl={10} bg="white">
                        <MemberTag
                          name={
                            group.name === DefaultGroupName
                              ? userInfo?.team.teamName ?? ''
                              : group.name
                          }
                          avatar={group.avatar}
                        />
                      </Td>
                      <PermissionCheckBox
                        isDisabled={group.permission.isOwner || !userManage}
                        role={TeamAppCreatePermissionVal}
                        clbPer={group.permission}
                        id={group.groupId!}
                      />
                      {showSkill && (
                        <PermissionCheckBox
                          isDisabled={group.permission.isOwner || !userManage}
                          role={TeamSkillCreatePermissionVal}
                          clbPer={group.permission}
                          id={group.groupId!}
                        />
                      )}
                      <PermissionCheckBox
                        isDisabled={group.permission.isOwner || !userManage}
                        role={TeamDatasetCreatePermissionVal}
                        clbPer={group.permission}
                        id={group.groupId!}
                      />
                      <PermissionCheckBox
                        isDisabled={group.permission.isOwner || !userManage}
                        role={TeamApikeyCreatePermissionVal}
                        clbPer={group.permission}
                        id={group.groupId!}
                      />
                      <PermissionCheckBox
                        isDisabled={group.permission.isOwner || !userInfo?.permission.isOwner}
                        role={TeamManagePermissionVal}
                        clbPer={group.permission}
                        id={group.groupId!}
                      />
                      <Td w="72px" minW="72px" textAlign="center">
                        {hasDeletePer(group.permission) && (
                          <Box mx="auto" w="fit-content">
                            <MyIconButton
                              icon="common/trash"
                              onClick={() => onDeleteMemberPermission({ groupId: group.groupId! })}
                            />
                          </Box>
                        )}
                      </Td>
                    </Tr>
                  ))}
              </>
            </Tbody>
          </Table>
        </TableContainer>
      </MyBox>
    </TeamSectionLayout>
  );
}

export const Render = () => {
  const { userInfo } = useUserStore();

  return userInfo?.team ? (
    <CollaboratorContextProvider
      defaultRole={ReadRoleVal}
      permission={userInfo?.team.permission}
      roleList={TeamRoleList}
      onGetCollaboratorList={getTeamClbs}
      onUpdateCollaborators={updateMemberPermission}
      onDelOneCollaborator={deleteMemberPermission}
      refreshDeps={[userInfo?.team.teamId]}
      addPermissionOnly={true}
    >
      {({ onOpenManageModal }) => <PermissionManage onOpenAddMember={onOpenManageModal} />}
    </CollaboratorContextProvider>
  ) : null;
};

export default Render;
