import type { AdminUserDetail } from '@fastgpt/global/openapi/admin/manage/api';
import { ArrowBackIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  SimpleGrid,
  Spinner,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useToast
} from '@chakra-ui/react';
import { AdminLayout } from '@/components/AdminLayout';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { apiRequest } from '@/web/api/client';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function UserDetailPage() {
  const router = useRouter();
  const toast = useToast();
  const [user, setUser] = useState<AdminUserDetail>();
  useEffect(() => {
    if (typeof router.query.id !== 'string') return;
    apiRequest<AdminUserDetail>(`/api/admin/users/${router.query.id}`)
      .then(setUser)
      .catch((error: unknown) =>
        toast({ status: 'error', title: error instanceof Error ? error.message : '加载失败' })
      );
  }, [router.query.id, toast]);
  return (
    <AdminLayout>
      <PageHeader
        title={user?.username ?? '用户详情'}
        action={
          <Button leftIcon={<ArrowBackIcon />} onClick={() => router.push('/users')}>
            返回列表
          </Button>
        }
      />
      {!user ? (
        <Box py={20} textAlign="center">
          <Spinner />
        </Box>
      ) : (
        <>
          <SimpleGrid columns={4} gap={4} mb={5}>
            {[
              ['状态', <StatusBadge key="status" status={user.status} />],
              ['团队数量', user.teamCount],
              ['应用数量', user.appCount],
              ['知识库数量', user.datasetCount]
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
          <Box bg="white" border="1px solid" borderColor="var(--admin-border)" p={4}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
              <Text fontWeight="600">所属团队</Text>
              <Box display="flex" gap={2}>
                <Button size="sm" onClick={() => router.push(`/apps?ownerId=${user.id}`)}>
                  查看应用
                </Button>
                <Button size="sm" onClick={() => router.push(`/datasets?ownerId=${user.id}`)}>
                  查看知识库
                </Button>
              </Box>
            </Box>
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>团队</Th>
                  <Th>成员名</Th>
                  <Th>状态</Th>
                  <Th>身份</Th>
                  <Th textAlign="right">操作</Th>
                </Tr>
              </Thead>
              <Tbody>
                {user.teams.map((team) => (
                  <Tr key={team.tmbId}>
                    <Td>{team.teamName}</Td>
                    <Td>{team.memberName}</Td>
                    <Td>{team.status}</Td>
                    <Td>{team.isOwner ? '所有者' : '成员'}</Td>
                    <Td textAlign="right">
                      <Button size="xs" onClick={() => router.push(`/teams/${team.teamId}`)}>
                        查看团队
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        </>
      )}
    </AdminLayout>
  );
}
