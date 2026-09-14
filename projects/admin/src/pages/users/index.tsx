import type { AdminUserListItem } from '@fastgpt/global/openapi/admin/manage/api';
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
import { ResetPasswordModal } from '@/components/users/ResetPasswordModal';
import { TransferResourceModal } from '@/components/users/TransferResourceModal';
import { UserFormModal, type UserFormValue } from '@/components/users/UserFormModal';
import { apiRequest, buildQuery } from '@/web/api/client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { hashStr } from '@fastgpt/global/common/string/tools';

type ListResponse = { total: number; list: AdminUserListItem[] };

export default function UsersPage() {
  const toast = useToast();
  const router = useRouter();
  const createModal = useDisclosure();
  const editModal = useDisclosure();
  const resetModal = useDisclosure();
  const transferModal = useDisclosure();
  const deleteModal = useDisclosure();
  const freezeModal = useDisclosure();
  const [data, setData] = useState<ListResponse>({ total: 0, list: [] });
  const [selected, setSelected] = useState<AdminUserListItem>();
  const [searchKey, setSearchKey] = useState('');
  const [status, setStatus] = useState('');
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const query = buildQuery({ pageNum, pageSize: 20, searchKey, status: status || undefined });
      const result = await apiRequest<ListResponse>(`/api/admin/users?${query}`);
      setData(result);
    } catch (error) {
      toast({ status: 'error', title: error instanceof Error ? error.message : '加载用户失败' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [pageNum, status]);

  const runAction = async (body: Record<string, string>) => {
    setSubmitting(true);
    try {
      const result = await apiRequest<{ taskId?: string }>('/api/admin/users/action', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      toast({ status: 'success', title: result.taskId ? '任务已提交' : '操作成功' });
      resetModal.onClose();
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

  const saveUser = async (value: UserFormValue) => {
    setSubmitting(true);
    try {
      await apiRequest('/api/admin/users', {
        method: selected ? 'PUT' : 'POST',
        body: JSON.stringify(
          selected
            ? { id: selected.id, ...value }
            : { ...value, password: value.password ? hashStr(value.password) : value.password }
        )
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

  return (
    <AdminLayout>
      <PageHeader
        title="用户管理"
        description="管理平台用户状态、密码、资源归属和生命周期"
        action={
          <Button
            leftIcon={<AddIcon />}
            colorScheme="blue"
            onClick={() => {
              setSelected(undefined);
              createModal.onOpen();
            }}
          >
            创建用户
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
                placeholder="搜索用户名或联系方式"
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
              <option value="forbidden">已冻结</option>
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
                <Th>用户</Th>
                <Th>状态</Th>
                <Th>团队</Th>
                <Th>应用</Th>
                <Th>知识库</Th>
                <Th>注册时间</Th>
                <Th textAlign="right">操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.list.map((user) => (
                <Tr key={user.id}>
                  <Td>
                    <Text fontWeight="600">{user.username}</Text>
                    <Text fontSize="11px" color="gray.500">
                      {user.contact || user.id}
                    </Text>
                  </Td>
                  <Td>
                    <StatusBadge status={user.status} />
                  </Td>
                  <Td>{user.teamCount}</Td>
                  <Td>{user.appCount}</Td>
                  <Td>{user.datasetCount}</Td>
                  <Td>{new Date(user.createTime).toLocaleString()}</Td>
                  <Td textAlign="right">
                    <Menu>
                      <MenuButton as={Button} size="sm" rightIcon={<ChevronDownIcon />}>
                        操作
                      </MenuButton>
                      <Portal>
                        <MenuList>
                          <MenuItem onClick={() => router.push(`/users/${user.id}`)}>
                            查看详情
                          </MenuItem>
                          {!user.isRoot ? (
                            <MenuItem
                              onClick={() => {
                                setSelected(user);
                                editModal.onOpen();
                              }}
                            >
                              编辑
                            </MenuItem>
                          ) : null}
                          {!user.isRoot ? (
                            <MenuItem
                              onClick={() => {
                                if (user.status === 'active') {
                                  setSelected(user);
                                  freezeModal.onOpen();
                                } else {
                                  void runAction({ action: 'unfreeze', userId: user.id });
                                }
                              }}
                            >
                              {user.status === 'active' ? '冻结' : '解冻'}
                            </MenuItem>
                          ) : null}
                          {!user.isRoot ? (
                            <MenuItem
                              onClick={() => {
                                setSelected(user);
                                resetModal.onOpen();
                              }}
                            >
                              重置密码
                            </MenuItem>
                          ) : null}
                          {!user.isRoot ? (
                            <MenuItem
                              onClick={() => {
                                setSelected(user);
                                transferModal.onOpen();
                              }}
                            >
                              转移资源
                            </MenuItem>
                          ) : null}
                          {!user.isRoot ? (
                            <MenuItem
                              color="red.600"
                              onClick={() => {
                                setSelected(user);
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
                  <Td colSpan={7} py={12} textAlign="center" color="gray.500">
                    暂无用户
                  </Td>
                </Tr>
              ) : null}
            </Tbody>
          </Table>
        )}
      </ListPageCard>
      <UserFormModal
        isOpen={createModal.isOpen}
        mode="create"
        submitting={submitting}
        onClose={createModal.onClose}
        onSubmit={saveUser}
      />
      {selected ? (
        <UserFormModal
          isOpen={editModal.isOpen}
          mode="edit"
          initialValue={{ contact: selected.contact }}
          submitting={submitting}
          onClose={editModal.onClose}
          onSubmit={saveUser}
        />
      ) : null}
      {selected ? (
        <ResetPasswordModal
          isOpen={resetModal.isOpen}
          username={selected.username}
          submitting={submitting}
          onClose={resetModal.onClose}
          onSubmit={(password) =>
            void runAction({
              action: 'resetPassword',
              userId: selected.id,
              password: hashStr(password)
            })
          }
        />
      ) : null}
      {selected ? (
        <ConfirmActionModal
          isOpen={freezeModal.isOpen}
          title="冻结用户？"
          description={`冻结后，用户「${selected.username}」的现有登录会话将立即失效，且无法再次登录。用户数据不会被删除，可随时解冻。`}
          submitting={submitting}
          onClose={freezeModal.onClose}
          onConfirm={() =>
            void runAction({ action: 'freeze', userId: selected.id }).then(freezeModal.onClose)
          }
        />
      ) : null}
      {selected ? (
        <TransferResourceModal
          isOpen={transferModal.isOpen}
          sourceUser={selected}
          submitting={submitting}
          onClose={transferModal.onClose}
          onSubmit={(targetUserId) =>
            void runAction({ action: 'transfer', userId: selected.id, targetUserId })
          }
        />
      ) : null}
      {selected ? (
        <ConfirmNameModal
          isOpen={deleteModal.isOpen}
          title="永久删除用户？"
          name={selected.username}
          submitting={submitting}
          description={`即将删除用户「${selected.username}」。此操作会同时删除该用户拥有的团队、应用、知识库及相关业务数据，并移除其在其他团队中的成员身份和权限。删除后无法恢复。\n\n如需保留该用户的资源，请取消当前操作，并先使用“转移资源”功能。`}
          onClose={deleteModal.onClose}
          onConfirm={() =>
            void runAction({
              action: 'delete',
              userId: selected.id,
              confirmName: selected.username
            })
          }
        />
      ) : null}
    </AdminLayout>
  );
}
