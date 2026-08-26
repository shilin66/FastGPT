'use client';
import { serviceSideProps } from '@/web/common/i18n/utils';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import TeamSelector from '@/pageComponents/account/TeamSelector';
import { useUserStore } from '@/web/support/user/useUserStore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { TeamContext, TeamModalContextProvider } from '@/pageComponents/account/team/context';
import dynamic from 'next/dynamic';
import { defaultForm } from '@/pageComponents/account/team/EditInfoModal';
import { omniTheme } from '@/web/common/brand/theme';

const MemberTable = dynamic(() => import('@/pageComponents/account/team/MemberTable'));
const PermissionManage = dynamic(
  () => import('@/pageComponents/account/team/PermissionManage/index')
);
const GroupManage = dynamic(() => import('@/pageComponents/account/team/GroupManage/index'));
const OrgManage = dynamic(() => import('@/pageComponents/account/team/OrgManage/index'));
const HandleInviteModal = dynamic(
  () => import('@/pageComponents/account/team/Invite/HandleInviteModal')
);

const TEAM_GOVERNANCE_COLLAPSED_KEY = 'omni_team_governance_collapsed';

export enum TeamTabEnum {
  member = 'member',
  org = 'org',
  group = 'group',
  permission = 'permission',
  audit = 'audit'
}

const Team = () => {
  const router = useRouter();

  const invitelinkid = useMemo(() => {
    const _id = router.query.invitelinkid;
    if (!_id && typeof _id !== 'string') {
      return '';
    } else {
      return _id as string;
    }
  }, [router.query.invitelinkid]);

  const { teamTab = TeamTabEnum.member } = router.query as { teamTab: `${TeamTabEnum}` };

  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const [isGovernanceCollapsed, setIsGovernanceCollapsed] = useState(false);

  const { setEditTeamData, teamSize } = useContextSelector(TeamContext, (v) => v);

  const navigation = useMemo(
    () => [
      {
        value: TeamTabEnum.member,
        label: t('account_team:member'),
        description: t('account_team:member_nav_desc'),
        icon: 'support/user/usersLight' as const,
        count: teamSize
      },
      {
        value: TeamTabEnum.org,
        label: t('account_team:org'),
        description: t('account_team:org_nav_desc'),
        icon: 'common/administrator' as const
      },
      {
        value: TeamTabEnum.group,
        label: t('account_team:group'),
        description: t('account_team:group_nav_desc'),
        icon: 'support/team/group' as const
      },
      {
        value: TeamTabEnum.permission,
        label: t('account_team:permission'),
        description: t('account_team:permission_nav_desc'),
        icon: 'support/permission/collaborator' as const
      }
    ],
    [t, teamSize]
  );

  const activeTeamTab = navigation.some((item) => item.value === teamTab)
    ? teamTab
    : TeamTabEnum.member;

  useEffect(() => {
    setIsGovernanceCollapsed(localStorage.getItem(TEAM_GOVERNANCE_COLLAPSED_KEY) === '1');
  }, []);

  const toggleGovernanceCollapsed = useCallback(() => {
    setIsGovernanceCollapsed((state) => {
      const nextState = !state;
      localStorage.setItem(TEAM_GOVERNANCE_COLLAPSED_KEY, nextState ? '1' : '0');
      return nextState;
    });
  }, []);

  const onChangeTab = (value: TeamTabEnum) => {
    router.replace(
      {
        query: {
          ...router.query,
          teamTab: value
        }
      },
      undefined,
      { shallow: true }
    );
  };

  return (
    <AccountContainer>
      <Flex h="100%" minW={0} flexDirection="column" bg={omniTheme.colors.pageBg}>
        <Flex
          minH="60px"
          px={{ base: 4, md: 5 }}
          py={2}
          align="center"
          justify="space-between"
          gap={4}
          bg={omniTheme.colors.surface}
          borderBottom="1px solid"
          borderColor={omniTheme.colors.border}
        >
          <Flex minW={0} align="center" gap={3}>
            <Flex
              w="34px"
              h="34px"
              flexShrink={0}
              align="center"
              justify="center"
              borderRadius={omniTheme.radii.md}
              bg={omniTheme.colors.graphite}
              color="white"
            >
              <MyIcon name="support/user/usersLight" w="17px" />
            </Flex>
            <Box minW={0}>
              <Box color={omniTheme.colors.text} fontWeight={700} fontSize="17px" lineHeight="22px">
                {t('account:team')}
              </Box>
              <Box
                mt="2px"
                color={omniTheme.colors.muted}
                fontSize="11px"
                lineHeight="16px"
                noOfLines={1}
              >
                {t('account_team:workspace_desc')}
              </Box>
            </Box>
          </Flex>

          <Flex flexShrink={0} align="center" gap={2}>
            <Box w={{ base: '150px', md: '190px' }}>
              <TeamSelector height="34px" />
            </Box>
            <Flex
              as="button"
              type="button"
              title={t('account_team:create_team')}
              aria-label={t('account_team:create_team')}
              w="34px"
              h="34px"
              align="center"
              justify="center"
              border="1px solid"
              borderColor={omniTheme.colors.border}
              borderRadius={omniTheme.radii.sm}
              bg={omniTheme.colors.surface}
              color={omniTheme.colors.graphite}
              _hover={{
                borderColor: omniTheme.colors.saturatedBlue,
                color: omniTheme.colors.saturatedBlue
              }}
              onClick={() => setEditTeamData(defaultForm)}
            >
              <MyIcon name="common/addCircleLight" w="17px" />
            </Flex>
            {userInfo?.team?.role === TeamMemberRoleEnum.owner && (
              <Flex
                as="button"
                type="button"
                title={t('account_team:edit_info')}
                aria-label={t('account_team:edit_info')}
                w="34px"
                h="34px"
                align="center"
                justify="center"
                border="1px solid"
                borderColor={omniTheme.colors.border}
                borderRadius={omniTheme.radii.sm}
                bg={omniTheme.colors.surface}
                color={omniTheme.colors.graphite}
                _hover={{
                  borderColor: omniTheme.colors.saturatedBlue,
                  color: omniTheme.colors.saturatedBlue
                }}
                onClick={() => {
                  if (!userInfo?.team) return;
                  setEditTeamData({
                    id: userInfo.team.teamId,
                    name: userInfo.team.teamName,
                    avatar: userInfo.team.teamAvatar,
                    notificationAccount: userInfo.team.notificationAccount
                  });
                }}
              >
                <MyIcon name="edit" w="17px" />
              </Flex>
            )}
            <Box
              ml={1}
              px={2.5}
              py={1.5}
              color={omniTheme.colors.graphite}
              fontSize="11px"
              fontWeight={600}
              borderRadius={omniTheme.radii.sm}
              bg={omniTheme.colors.activeBg}
              whiteSpace="nowrap"
            >
              {t('account_team:total_team_members', { amount: teamSize })}
            </Box>
          </Flex>
        </Flex>

        <Flex flex={1} minH={0} minW={0}>
          <Flex
            as="nav"
            aria-label={t('account_team:governance')}
            w={isGovernanceCollapsed ? '64px' : { base: '64px', lg: '220px' }}
            flexShrink={0}
            flexDirection="column"
            gap={1}
            px={isGovernanceCollapsed ? 1.5 : { base: 1.5, lg: 3 }}
            py={3}
            bg={omniTheme.colors.sidebarBg}
            borderRight="1px solid"
            borderColor={omniTheme.colors.border}
          >
            <Flex
              display={{ base: 'none', lg: 'flex' }}
              minH="32px"
              px={isGovernanceCollapsed ? 0 : 2}
              mb={1.5}
              align="center"
              justify={isGovernanceCollapsed ? 'center' : 'space-between'}
              gap={2}
            >
              {!isGovernanceCollapsed && (
                <Box
                  minW={0}
                  color={omniTheme.colors.muted}
                  fontSize="10px"
                  fontWeight={700}
                  lineHeight="16px"
                  textTransform="uppercase"
                  noOfLines={1}
                >
                  {t('account_team:governance')}
                </Box>
              )}
              <MyTooltip
                label={
                  isGovernanceCollapsed
                    ? t('account_team:expand_governance')
                    : t('account_team:collapse_governance')
                }
                placement="right"
                shouldWrapChildren={false}
              >
                <Flex
                  as="button"
                  type="button"
                  aria-label={
                    isGovernanceCollapsed
                      ? t('account_team:expand_governance')
                      : t('account_team:collapse_governance')
                  }
                  w="30px"
                  h="30px"
                  flexShrink={0}
                  align="center"
                  justify="center"
                  border="1px solid"
                  borderColor={omniTheme.colors.border}
                  borderRadius={omniTheme.radii.sm}
                  bg={omniTheme.colors.surface}
                  color={omniTheme.colors.muted}
                  _hover={{
                    borderColor: omniTheme.colors.saturatedBlue,
                    color: omniTheme.colors.saturatedBlue
                  }}
                  _focusVisible={{
                    outline: '2px solid',
                    outlineColor: omniTheme.colors.saturatedBlue,
                    outlineOffset: '2px'
                  }}
                  onClick={toggleGovernanceCollapsed}
                >
                  <MyIcon
                    name={isGovernanceCollapsed ? 'common/arrowRight' : 'common/arrowLeft'}
                    w="14px"
                  />
                </Flex>
              </MyTooltip>
            </Flex>

            {navigation.map((item) => {
              const isActive = activeTeamTab === item.value;
              const itemNode = (
                <Flex
                  as="button"
                  type="button"
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  minH="48px"
                  px={isGovernanceCollapsed ? 1 : { base: 1, lg: 2.5 }}
                  py={1.5}
                  align="center"
                  justify={isGovernanceCollapsed ? 'center' : { base: 'center', lg: 'flex-start' }}
                  gap={2.5}
                  textAlign="left"
                  border="1px solid"
                  borderColor={isActive ? omniTheme.colors.border : 'transparent'}
                  borderRadius={omniTheme.radii.md}
                  bg={isActive ? omniTheme.colors.surface : 'transparent'}
                  color={isActive ? omniTheme.colors.saturatedBlue : omniTheme.colors.graphite}
                  boxShadow={isActive ? omniTheme.shadows.active : 'none'}
                  _hover={{ bg: omniTheme.colors.surface }}
                  _focusVisible={{
                    outline: '2px solid',
                    outlineColor: omniTheme.colors.saturatedBlue,
                    outlineOffset: '1px'
                  }}
                  onClick={() => onChangeTab(item.value)}
                >
                  <Flex
                    w="30px"
                    h="30px"
                    flexShrink={0}
                    align="center"
                    justify="center"
                    borderRadius={omniTheme.radii.sm}
                    bg={isActive ? omniTheme.colors.saturatedBlueSoft : omniTheme.colors.activeBg}
                  >
                    <MyIcon name={item.icon} w="16px" />
                  </Flex>
                  <Box
                    display={isGovernanceCollapsed ? 'none' : { base: 'none', lg: 'block' }}
                    minW={0}
                    flex={1}
                  >
                    <Flex align="center" justify="space-between" gap={2}>
                      <Box fontSize="13px" fontWeight={isActive ? 700 : 600} lineHeight="18px">
                        {item.label}
                      </Box>
                      {item.count !== undefined && (
                        <Box color={omniTheme.colors.muted} fontSize="10px" fontWeight={600}>
                          {item.count}
                        </Box>
                      )}
                    </Flex>
                    <Box
                      mt="2px"
                      color={omniTheme.colors.muted}
                      fontSize="10px"
                      lineHeight="14px"
                      noOfLines={1}
                    >
                      {item.description}
                    </Box>
                  </Box>
                </Flex>
              );

              return isGovernanceCollapsed ? (
                <MyTooltip
                  key={item.value}
                  label={`${item.label}${
                    item.count !== undefined ? ` (${item.count})` : ''
                  }\n${item.description}`}
                  placement="right"
                  shouldWrapChildren={false}
                >
                  {itemNode}
                </MyTooltip>
              ) : (
                <React.Fragment key={item.value}>{itemNode}</React.Fragment>
              );
            })}
          </Flex>

          <Box flex={1} minW={0} overflow="hidden">
            {activeTeamTab === TeamTabEnum.member && <MemberTable />}
            {activeTeamTab === TeamTabEnum.org && <OrgManage />}
            {activeTeamTab === TeamTabEnum.group && <GroupManage />}
            {activeTeamTab === TeamTabEnum.permission && <PermissionManage />}
          </Box>
        </Flex>
      </Flex>
      {invitelinkid && <HandleInviteModal invitelinkid={invitelinkid} />}
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account', 'account_team', 'user']))
    }
  };
}

const Render = () => {
  const { userInfo } = useUserStore();

  return !!userInfo?.team ? (
    <TeamModalContextProvider>
      <Team />
    </TeamModalContextProvider>
  ) : null;
};

export default React.memo(Render);
