import type { AdminTeamDetail } from '@fastgpt/global/openapi/admin/manage/api';
import { ArrowBackIcon, AddIcon, CheckIcon, DeleteIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  Flex,
  Input,
  IconButton,
  Select,
  SimpleGrid,
  Spinner,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Table,
  Tabs,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  Tooltip,
  useToast
} from '@chakra-ui/react';
import { AdminLayout } from '@/components/AdminLayout';
import { ConfirmActionModal } from '@/components/ConfirmActionModal';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { AdminUserPicker } from '@/components/users/AdminUserPicker';
import { apiRequest } from '@/web/api/client';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

type TeamAction = (body: Record<string, unknown>) => Promise<boolean>;

const OrgRow = ({
  org,
  orgs,
  members,
  onAction,
  onDelete
}: {
  org: AdminTeamDetail['orgs'][number];
  orgs: AdminTeamDetail['orgs'];
  members: AdminTeamDetail['members'];
  onAction: TeamAction;
  onDelete: () => void;
}) => {
  const [name, setName] = useState(org.name);
  const [tmbIds, setTmbIds] = useState(org.tmbIds);
  const isRoot = org.path === '';
  const parentPathId = org.path.split('/').filter(Boolean).at(-1);
  const currentParent = orgs.find((item) => item.pathId === parentPathId)?.id ?? '';
  const [parentOrgId, setParentOrgId] = useState(currentParent);
  const childPrefix = `${org.path}/${org.pathId}`;
  const parentOptions = orgs.filter(
    (item) =>
      item.id !== org.id && item.path !== childPrefix && !item.path.startsWith(`${childPrefix}/`)
  );

  return (
    <Tr>
      <Td>
        <Input
          size="sm"
          value={name}
          isDisabled={isRoot}
          onChange={(event) => setName(event.target.value)}
        />
      </Td>
      <Td>
        <Select
          size="sm"
          value={parentOrgId}
          isDisabled={isRoot}
          onChange={(event) => setParentOrgId(event.target.value)}
        >
          {parentOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.path === '' ? '根组织' : item.name}
            </option>
          ))}
        </Select>
      </Td>
      <Td>
        <Select
          size="sm"
          multiple
          h="72px"
          value={tmbIds}
          onChange={(event) =>
            setTmbIds(Array.from(event.currentTarget.selectedOptions).map((option) => option.value))
          }
        >
          {members.map((member) => (
            <option key={member.tmbId} value={member.tmbId}>
              {member.memberName}
            </option>
          ))}
        </Select>
      </Td>
      <Td textAlign="right">
        <Flex justify="flex-end" gap={1}>
          <Tooltip label="保存组织">
            <IconButton
              aria-label="保存组织"
              icon={<CheckIcon />}
              size="sm"
              isDisabled={!name || isRoot || !parentOrgId}
              onClick={() =>
                void (async () => {
                  const saved = await onAction({
                    action: 'updateOrg',
                    orgId: org.id,
                    name,
                    tmbIds
                  });
                  if (saved && parentOrgId !== currentParent)
                    await onAction({ action: 'moveOrg', orgId: org.id, parentOrgId });
                })()
              }
            />
          </Tooltip>
          <Tooltip label="删除组织">
            <IconButton
              aria-label="删除组织"
              icon={<DeleteIcon />}
              size="sm"
              variant="ghost"
              colorScheme="red"
              isDisabled={isRoot}
              onClick={onDelete}
            />
          </Tooltip>
        </Flex>
      </Td>
    </Tr>
  );
};

const GroupRow = ({
  group,
  members,
  onAction,
  onDelete
}: {
  group: AdminTeamDetail['groups'][number];
  members: AdminTeamDetail['members'];
  onAction: TeamAction;
  onDelete: () => void;
}) => {
  const [name, setName] = useState(group.name);
  const [groupMembers, setGroupMembers] = useState(group.members);
  const isDefault = group.name === 'DEFAULT_GROUP';
  const tmbIds = groupMembers.map((member) => member.tmbId);

  return (
    <Tr>
      <Td>
        <Input
          size="sm"
          value={isDefault ? '默认分组' : name}
          isDisabled={isDefault}
          onChange={(event) => setName(event.target.value)}
        />
      </Td>
      <Td>
        <Select
          size="sm"
          multiple
          h="76px"
          value={tmbIds}
          isDisabled={isDefault}
          onChange={(event) => {
            const selected = Array.from(event.currentTarget.selectedOptions).map(
              (option) => option.value
            );
            setGroupMembers(
              selected.map(
                (tmbId) =>
                  groupMembers.find((member) => member.tmbId === tmbId) ?? {
                    tmbId,
                    role: 'member' as const
                  }
              )
            );
          }}
        >
          {members.map((member) => (
            <option key={member.tmbId} value={member.tmbId}>
              {member.memberName}
            </option>
          ))}
        </Select>
        <Flex mt={2} gap={2} wrap="wrap">
          {groupMembers.map((groupMember) => (
            <Box key={groupMember.tmbId}>
              <Text fontSize="11px" color="gray.500" mb={1}>
                {members.find((member) => member.tmbId === groupMember.tmbId)?.memberName}
              </Text>
              <Select
                size="xs"
                w="150px"
                value={groupMember.role}
                isDisabled={isDefault}
                onChange={(event) =>
                  setGroupMembers((current) =>
                    current.map((item) =>
                      item.tmbId === groupMember.tmbId
                        ? { ...item, role: event.target.value as 'owner' | 'admin' | 'member' }
                        : item
                    )
                  )
                }
              >
                <option value="owner">所有者</option>
                <option value="admin">管理员</option>
                <option value="member">成员</option>
              </Select>
            </Box>
          ))}
        </Flex>
      </Td>
      <Td textAlign="right">
        <Flex justify="flex-end" gap={1}>
          <Tooltip label="保存用户组">
            <IconButton
              aria-label="保存用户组"
              icon={<CheckIcon />}
              size="sm"
              isDisabled={!name || isDefault}
              onClick={() =>
                void onAction({
                  action: 'updateGroup',
                  groupId: group.id,
                  name,
                  members: groupMembers
                })
              }
            />
          </Tooltip>
          <Tooltip label="删除用户组">
            <IconButton
              aria-label="删除用户组"
              icon={<DeleteIcon />}
              size="sm"
              variant="ghost"
              colorScheme="red"
              isDisabled={isDefault}
              onClick={onDelete}
            />
          </Tooltip>
        </Flex>
      </Td>
    </Tr>
  );
};

export default function TeamDetailPage() {
  const router = useRouter();
  const toast = useToast();
  const [team, setTeam] = useState<AdminTeamDetail>();
  const [newMemberId, setNewMemberId] = useState('');
  const [newOrgName, setNewOrgName] = useState('');
  const [parentOrgId, setParentOrgId] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [balance, setBalance] = useState('0');
  const [pendingAction, setPendingAction] = useState<{
    title: string;
    description: string;
    body: Record<string, unknown>;
  }>();
  const [submitting, setSubmitting] = useState(false);
  const teamId = typeof router.query.id === 'string' ? router.query.id : '';

  const load = async () => {
    if (!teamId) return;
    try {
      const detail = await apiRequest<AdminTeamDetail>(`/api/admin/teams/${teamId}`);
      setTeam(detail);
      setBalance(String(detail.balance ?? 0));
    } catch (error) {
      toast({ status: 'error', title: error instanceof Error ? error.message : '加载团队失败' });
    }
  };
  useEffect(() => {
    void load();
  }, [teamId]);

  const action = async (body: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      await apiRequest('/api/admin/teams/action', {
        method: 'POST',
        body: JSON.stringify({ teamId, ...body })
      });
      toast({ status: 'success', title: '操作成功' });
      await load();
      return true;
    } catch (error) {
      toast({ status: 'error', title: error instanceof Error ? error.message : '操作失败' });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const confirmPendingAction = async () => {
    if (!pendingAction) return;
    if (await action(pendingAction.body)) setPendingAction(undefined);
  };

  if (!team)
    return (
      <AdminLayout>
        <Box py={20} textAlign="center">
          <Spinner />
        </Box>
      </AdminLayout>
    );
  const memberUserIds = team.members.map((member) => member.userId);

  return (
    <AdminLayout>
      <PageHeader
        title={team.name}
        description={`团队 ID：${team.id}`}
        action={
          <Button leftIcon={<ArrowBackIcon />} onClick={() => router.push('/teams')}>
            返回列表
          </Button>
        }
      />
      <SimpleGrid columns={4} gap={4} mb={5}>
        {[
          ['状态', <StatusBadge key="status" status={team.status} />],
          ['成员', team.memberCount],
          ['应用', team.appCount],
          ['知识库', team.datasetCount]
        ].map(([label, value]) => (
          <Box
            key={String(label)}
            bg="white"
            border="1px solid"
            borderColor="var(--admin-border)"
            p={4}
          >
            <Text fontSize="12px" color="gray.500">
              {label}
            </Text>
            <Box mt={2} fontSize="18px" fontWeight="600">
              {value}
            </Box>
          </Box>
        ))}
      </SimpleGrid>
      <Box bg="white" border="1px solid" borderColor="var(--admin-border)">
        <Tabs colorScheme="blue" isLazy>
          <TabList px={4}>
            <Tab>基本信息</Tab>
            <Tab>成员</Tab>
            <Tab>组织架构</Tab>
            <Tab>用户组</Tab>
            <Tab>额度</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              <SimpleGrid columns={2} gap={5} maxW="760px">
                <Box>
                  <Text fontSize="12px" color="gray.500">
                    所有者
                  </Text>
                  <Text mt={1}>{team.ownerName}</Text>
                </Box>
                <Box>
                  <Text fontSize="12px" color="gray.500">
                    创建时间
                  </Text>
                  <Text mt={1}>{new Date(team.createTime).toLocaleString()}</Text>
                </Box>
                <Box>
                  <Text fontSize="12px" color="gray.500">
                    团队域名
                  </Text>
                  <Text mt={1}>{team.teamDomain || '-'}</Text>
                </Box>
                <Box>
                  <Text fontSize="12px" color="gray.500">
                    团队 ID
                  </Text>
                  <Text mt={1}>{team.id}</Text>
                </Box>
                <Flex gap={2}>
                  <Button size="sm" onClick={() => router.push(`/apps?teamId=${team.id}`)}>
                    查看应用
                  </Button>
                  <Button size="sm" onClick={() => router.push(`/datasets?teamId=${team.id}`)}>
                    查看知识库
                  </Button>
                </Flex>
              </SimpleGrid>
            </TabPanel>
            <TabPanel>
              <Flex gap={2} mb={4} align="end">
                <Box w="340px">
                  <AdminUserPicker
                    value={newMemberId}
                    excludeUserIds={memberUserIds}
                    onChange={setNewMemberId}
                  />
                </Box>
                <Button
                  leftIcon={<AddIcon />}
                  isDisabled={!newMemberId}
                  onClick={() =>
                    void action({ action: 'addMember', userId: newMemberId }).then(() =>
                      setNewMemberId('')
                    )
                  }
                >
                  添加成员
                </Button>
              </Flex>
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th>成员</Th>
                    <Th>状态</Th>
                    <Th>身份</Th>
                    <Th>加入时间</Th>
                    <Th textAlign="right">操作</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {team.members.map((member) => (
                    <Tr key={member.tmbId}>
                      <Td>
                        <Input
                          size="sm"
                          maxW="220px"
                          defaultValue={member.memberName}
                          onBlur={(event) => {
                            const name = event.target.value.trim();
                            if (name && name !== member.memberName)
                              void action({ action: 'updateMember', tmbId: member.tmbId, name });
                          }}
                        />
                        <Text fontSize="11px" color="gray.500">
                          {member.username}
                        </Text>
                      </Td>
                      <Td>
                        <StatusBadge status={member.status} />
                      </Td>
                      <Td>{member.isOwner ? '所有者' : '成员'}</Td>
                      <Td>{new Date(member.createTime).toLocaleString()}</Td>
                      <Td textAlign="right">
                        {!member.isOwner ? (
                          <Flex justify="flex-end" gap={2}>
                            <Button
                              size="xs"
                              onClick={() =>
                                void action({
                                  action: 'updateMemberStatus',
                                  tmbId: member.tmbId,
                                  status: member.status === 'active' ? 'forbidden' : 'active'
                                })
                              }
                            >
                              {member.status === 'active' ? '停用' : '启用'}
                            </Button>
                            <Button
                              size="xs"
                              colorScheme="red"
                              variant="ghost"
                              onClick={() =>
                                setPendingAction({
                                  title: '移除团队成员？',
                                  description: `成员「${member.memberName}」拥有的团队内资源将转交给团队所有者，成员身份和权限将被移除。`,
                                  body: { action: 'removeMember', tmbId: member.tmbId }
                                })
                              }
                            >
                              移除
                            </Button>
                          </Flex>
                        ) : null}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TabPanel>
            <TabPanel>
              <Flex gap={2} mb={4}>
                <Input
                  maxW="260px"
                  placeholder="组织名称"
                  value={newOrgName}
                  onChange={(event) => setNewOrgName(event.target.value)}
                />
                <Select
                  maxW="260px"
                  value={parentOrgId}
                  onChange={(event) => setParentOrgId(event.target.value)}
                >
                  <option value="">根级组织</option>
                  {team.orgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </Select>
                <Button
                  leftIcon={<AddIcon />}
                  isDisabled={!newOrgName}
                  onClick={() =>
                    void action({
                      action: 'createOrg',
                      name: newOrgName,
                      parentOrgId: parentOrgId || undefined
                    }).then(() => {
                      setNewOrgName('');
                      setParentOrgId('');
                    })
                  }
                >
                  创建组织
                </Button>
              </Flex>
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th>组织</Th>
                    <Th>上级组织</Th>
                    <Th>成员</Th>
                    <Th textAlign="right">操作</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {team.orgs.map((org) => (
                    <OrgRow
                      key={org.id}
                      org={org}
                      orgs={team.orgs}
                      members={team.members}
                      onAction={action}
                      onDelete={() =>
                        setPendingAction({
                          title: '删除组织？',
                          description: `组织「${org.name}」及其子组织会被删除，相关组织权限和成员关系将一并移除。`,
                          body: { action: 'deleteOrg', orgId: org.id }
                        })
                      }
                    />
                  ))}
                </Tbody>
              </Table>
            </TabPanel>
            <TabPanel>
              <Flex gap={2} mb={4}>
                <Input
                  maxW="300px"
                  placeholder="用户组名称"
                  value={newGroupName}
                  onChange={(event) => setNewGroupName(event.target.value)}
                />
                <Button
                  leftIcon={<AddIcon />}
                  isDisabled={!newGroupName}
                  onClick={() =>
                    void action({ action: 'createGroup', name: newGroupName, members: [] }).then(
                      (success) => {
                        if (success) setNewGroupName('');
                      }
                    )
                  }
                >
                  创建用户组
                </Button>
              </Flex>
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th>用户组</Th>
                    <Th>成员</Th>
                    <Th textAlign="right">操作</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {team.groups.map((group) => (
                    <GroupRow
                      key={group.id}
                      group={group}
                      members={team.members}
                      onAction={action}
                      onDelete={() =>
                        setPendingAction({
                          title: '删除用户组？',
                          description: `用户组「${group.name}」及其成员关系和资源权限将被移除。`,
                          body: { action: 'deleteGroup', groupId: group.id }
                        })
                      }
                    />
                  ))}
                </Tbody>
              </Table>
            </TabPanel>
            <TabPanel>
              <Flex align="end" gap={3} maxW="420px">
                <Box flex={1}>
                  <Text fontSize="12px" mb={2}>
                    团队余额
                  </Text>
                  <Input
                    type="number"
                    value={balance}
                    onChange={(event) => setBalance(event.target.value)}
                  />
                </Box>
                <Button
                  colorScheme="blue"
                  onClick={() => void action({ action: 'updateBalance', balance: Number(balance) })}
                >
                  保存额度
                </Button>
              </Flex>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Box>
      <ConfirmActionModal
        isOpen={!!pendingAction}
        title={pendingAction?.title ?? ''}
        description={pendingAction?.description ?? ''}
        submitting={submitting}
        onClose={() => setPendingAction(undefined)}
        onConfirm={() => void confirmPendingAction()}
      />
    </AdminLayout>
  );
}
