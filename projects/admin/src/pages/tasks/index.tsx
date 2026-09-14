import type { AdminTask } from '@fastgpt/global/openapi/admin/manage/api';
import {
  Box,
  Button,
  Flex,
  Input,
  Progress,
  Select,
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useToast
} from '@chakra-ui/react';
import { AdminLayout } from '@/components/AdminLayout';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { ListPageCard } from '@/components/ListPageCard';
import { StatusBadge } from '@/components/StatusBadge';
import { apiRequest, buildQuery } from '@/web/api/client';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

type ListResponse = { total: number; list: AdminTask[] };
export default function TasksPage() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<ListResponse>({ total: 0, list: [] });
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchKey, setSearchKey] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const load = async () => {
    setLoading(true);
    try {
      setData(
        await apiRequest<ListResponse>(
          `/api/admin/tasks?${buildQuery({ pageNum, pageSize: 20, searchKey, status, type })}`
        )
      );
    } catch (error) {
      toast({ status: 'error', title: error instanceof Error ? error.message : '加载任务失败' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [pageNum]);
  return (
    <AdminLayout>
      <PageHeader title="任务中心" description="查看资源转移和级联删除任务的执行状态" />
      <ListPageCard
        toolbar={
          <Flex gap={3} mb={4}>
            <Input
              maxW="280px"
              value={searchKey}
              placeholder="任务类型或目标名称"
              onChange={(event) => setSearchKey(event.target.value)}
            />
            <Input
              maxW="220px"
              value={type}
              placeholder="任务类型"
              onChange={(event) => setType(event.target.value)}
            />
            <Select maxW="180px" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">全部状态</option>
              <option value="queued">排队中</option>
              <option value="running">执行中</option>
              <option value="succeeded">成功</option>
              <option value="failed">失败</option>
            </Select>
            <Button
              onClick={() => {
                setPageNum(1);
                void load();
              }}
            >
              查询
            </Button>
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
                <Th>任务</Th>
                <Th>目标</Th>
                <Th>状态</Th>
                <Th>进度</Th>
                <Th>创建时间</Th>
                <Th textAlign="right">操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.list.map((task) => (
                <Tr key={task.id}>
                  <Td>{task.type}</Td>
                  <Td>{task.targetName}</Td>
                  <Td>
                    <StatusBadge status={task.status} />
                  </Td>
                  <Td w="220px">
                    <Progress
                      value={task.progress}
                      size="sm"
                      colorScheme={task.status === 'failed' ? 'red' : 'blue'}
                    />
                  </Td>
                  <Td>{new Date(task.createdAt).toLocaleString()}</Td>
                  <Td textAlign="right">
                    <Button size="sm" onClick={() => router.push(`/tasks/${task.id}`)}>
                      详情
                    </Button>
                  </Td>
                </Tr>
              ))}
              {!data.list.length ? (
                <Tr>
                  <Td colSpan={6} py={12} textAlign="center" color="gray.500">
                    暂无任务
                  </Td>
                </Tr>
              ) : null}
            </Tbody>
          </Table>
        )}
      </ListPageCard>
    </AdminLayout>
  );
}
