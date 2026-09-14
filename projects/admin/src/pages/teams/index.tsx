import type { AdminTeamListItem } from '@fastgpt/global/openapi/admin/manage/api';
import { AddIcon, ChevronDownIcon, SearchIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  Flex,
  Input,
  InputGroup,
  InputLeftElement,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Portal,
  Select,
  Spinner,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useDisclosure,
  useToast
} from '@chakra-ui/react';
import { AdminLayout } from '@/components/AdminLayout';
import { ConfirmNameModal } from '@/components/ConfirmNameModal';
import { ConfirmActionModal } from '@/components/ConfirmActionModal';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { ListPageCard } from '@/components/ListPageCard';
import { StatusBadge } from '@/components/StatusBadge';
import { TeamFormModal, type TeamFormValue } from '@/components/teams/TeamFormModal';
import { TransferTeamOwnerModal } from '@/components/teams/TransferTeamOwnerModal';
import { apiRequest, buildQuery } from '@/web/api/client';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

type TeamListResponse = { total: number; list: AdminTeamListItem[] };

export default function TeamsPage() {
  const router = useRouter();
  const toast = useToast();
  const createModal = useDisclosure();
  const editModal = useDisclosure();
  const transferModal = useDisclosure();
  const deleteModal = useDisclosure();
  const freezeModal = useDisclosure();
  const [data, setData] = useState<TeamListResponse>({ total: 0, list: [] });
  const [selected, setSelected] = useState<AdminTeamListItem>();
  const [searchKey, setSearchKey] = useState('');
  const [status, setStatus] = useState('');
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const teams = await apiRequest<TeamListResponse>(
        `/api/admin/teams?${buildQuery({ pageNum, pageSize: 20, searchKey, status: status || undefined })}`
      );
      setData(teams);
    } catch (error) {
      toast({ status: 'error', title: error instanceof Error ? error.message : '加载团队失败' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [pageNum, status]);

  const save = async (value: TeamFormValue) => {
    setSubmitting(true);
    try {
      await apiRequest('/api/admin/teams', {
        method: selected ? 'PUT' : 'POST',
        body: JSON.stringify(selected ? { id: selected.id, ...value } : value)
      });
      toast({ status: 'success', title: '保存成功' });
      createModal.onClose();
      editModal.onClose();
      setSelected(undefined);
      await load();
    } catch (error) {
      toast({ status: 'error', title: error instanceof Error ? error.message : '保存失败' });
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = async (body: Record<string, string>) => {
    setSubmitting(true);
    try {
      const result = await apiRequest<{ taskId?: string }>('/api/admin/teams/action', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      toast({ status: 'success', title: result.taskId ? '删除任务已提交' : '操作成功' });
      transferModal.onClose();
      deleteModal.onClose();
      await load();
      if (result.taskId) await router.push(`/tasks/${result.taskId}`);
    } catch (error) {
      toast({ status: 'error', title: error instanceof Error ? error.message : '操作失败' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminLayout>
      <PageHeader
        title="团队管理"
        description="管理团队生命周期、所有者、成员和资源状态"
        action={
          <Button
            leftIcon={<AddIcon />}
            colorScheme="blue"
            onClick={() => {
              setSelected(undefined);
              createModal.onOpen();
            }}
          >
            创建团队
          </Button>
        }
      />
      <ListPageCard
        toolbar={
          <Flex gap={3} mb={4}>
            <InputGroup maxW="340px">
              <InputLeftElement>
                <SearchIcon color="gray.400" />
              </InputLeftElement>
              <Input
                value={searchKey}
                placeholder="搜索团队名称"
                onChange={(event) => setSearchKey(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void load()}
              />
            </InputGroup>
            <Select
              w="150px"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPageNum(1);
              }}
            >
              <option value="">全部状态</option>
              <option value="active">正常</option>
              <option value="frozen">已冻结</option>
            </Select>
            <Button onClick={() => void load()}>查询</Button>
          </Flex>
        }
        pagination={
          <Pagination pageNum={pageNum} pageSize={20} total={data.total} onChange={setPageNum} />
        }
      >
        {loading ? (
          <Box py={16} textAlign="center">
            <Spinner />
          </Box>
        ) : (
          <Table size="sm">
            <Thead>
              <Tr>
                <Th>团队</Th>
                <Th>所有者</Th>
                <Th>状态</Th>
                <Th>成员</Th>
                <Th>应用</Th>
                <Th>知识库</Th>
                <Th>创建时间</Th>
                <Th textAlign="right">操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.list.map((team) => (
                <Tr key={team.id}>
                  <Td>
                    <Text fontWeight="600">{team.name}</Text>
                    <Text fontSize="11px" color="gray.500">
                      {team.id}
                    </Text>
                  </Td>
                  <Td>{team.ownerName}</Td>
                  <Td>
                    <StatusBadge status={team.status} />
                  </Td>
                  <Td>{team.memberCount}</Td>
                  <Td>{team.appCount}</Td>
                  <Td>{team.datasetCount}</Td>
                  <Td>{new Date(team.createTime).toLocaleString()}</Td>
                  <Td textAlign="right">
                    <Menu>
                      <MenuButton as={Button} size="sm" rightIcon={<ChevronDownIcon />}>
                        操作
                      </MenuButton>
                      <Portal>
                        <MenuList>
                          <MenuItem onClick={() => router.push(`/teams/${team.id}`)}>
                            查看详情
                          </MenuItem>
                          <MenuItem
                            onClick={() => {
                              setSelected(team);
                              editModal.onOpen();
                            }}
                          >
                            编辑
                          </MenuItem>
                          {team.ownerName !== 'root' ? (
                            <MenuItem
                              onClick={() => {
                                if (team.status === 'active') {
                                  setSelected(team);
                                  freezeModal.onOpen();
                                } else {
                                  void runAction({ action: 'unfreeze', teamId: team.id });
                                }
                              }}
                            >
                              {team.status === 'active' ? '冻结' : '解冻'}
                            </MenuItem>
                          ) : null}
                          <MenuItem
                            onClick={() => {
                              setSelected(team);
                              transferModal.onOpen();
                            }}
                          >
                            转移所有权
                          </MenuItem>
                          {team.ownerName !== 'root' ? (
                            <MenuItem
                              color="red.600"
                              onClick={() => {
                                setSelected(team);
                                deleteModal.onOpen();
                              }}
                            >
                              永久删除
                            </MenuItem>
                          ) : null}
                        </MenuList>
                      </Portal>
                    </Menu>
                  </Td>
                </Tr>
              ))}
              {!data.list.length ? (
                <Tr>
                  <Td colSpan={8} py={12} textAlign="center" color="gray.500">
                    暂无团队
                  </Td>
                </Tr>
              ) : null}
            </Tbody>
          </Table>
        )}
      </ListPageCard>
      <TeamFormModal
        isOpen={createModal.isOpen}
        mode="create"
        submitting={submitting}
        onClose={createModal.onClose}
        onSubmit={save}
      />
      {selected ? (
        <TeamFormModal
          isOpen={editModal.isOpen}
          mode="edit"
          team={selected}
          submitting={submitting}
          onClose={editModal.onClose}
          onSubmit={save}
        />
      ) : null}
      {selected ? (
        <TransferTeamOwnerModal
          isOpen={transferModal.isOpen}
          team={selected}
          submitting={submitting}
          onClose={transferModal.onClose}
          onSubmit={(targetUserId) =>
            void runAction({ action: 'transferOwner', teamId: selected.id, targetUserId })
          }
        />
      ) : null}
      {selected ? (
        <ConfirmActionModal
          isOpen={freezeModal.isOpen}
          title="冻结团队？"
          description={`冻结团队「${selected.name}」后，该团队的 OpenAPI 调用和资源写操作将被阻止，成员仍可登录并使用其他团队。`}
          submitting={submitting}
          onClose={freezeModal.onClose}
          onConfirm={() =>
            void runAction({ action: 'freeze', teamId: selected.id }).then(freezeModal.onClose)
          }
        />
      ) : null}
      {selected ? (
        <ConfirmNameModal
          isOpen={deleteModal.isOpen}
          title="永久删除团队？"
          name={selected.name}
          description={`即将永久删除团队「${selected.name}」及其应用、知识库、成员、权限和关联业务数据。删除后无法恢复。`}
          submitting={submitting}
          onClose={deleteModal.onClose}
          onConfirm={() =>
            void runAction({ action: 'delete', teamId: selected.id, confirmName: selected.name })
          }
        />
      ) : null}
    </AdminLayout>
  );
}
