import type { AdminAudit } from '@fastgpt/global/openapi/admin/manage/api';
import {
  Box,
  Button,
  Flex,
  Input,
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
import { useEffect, useState } from 'react';
type ListResponse = { total: number; list: AdminAudit[] };
export default function AuditsPage() {
  const toast = useToast();
  const [data, setData] = useState<ListResponse>({ total: 0, list: [] });
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchKey, setSearchKey] = useState('');
  const [event, setEvent] = useState('');
  const [targetType, setTargetType] = useState('');
  const [success, setSuccess] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const load = async () => {
    setLoading(true);
    try {
      setData(
        await apiRequest<ListResponse>(
          `/api/admin/audits?${buildQuery({ pageNum, pageSize: 20, searchKey, event, targetType, success, startTime: startTime || undefined, endTime: endTime || undefined })}`
        )
      );
    } catch (error) {
      toast({ status: 'error', title: error instanceof Error ? error.message : '加载审计失败' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [pageNum]);
  return (
    <AdminLayout>
      <PageHeader title="操作审计" description="平台管理写操作独立留痕，不随团队删除" />
      <ListPageCard
        toolbar={
          <Flex gap={3} mb={4} wrap="wrap">
            <Input
              maxW="240px"
              value={searchKey}
              placeholder="事件或目标名称"
              onChange={(e) => setSearchKey(e.target.value)}
            />
            <Input
              maxW="180px"
              value={event}
              placeholder="事件类型"
              onChange={(e) => setEvent(e.target.value)}
            />
            <Select maxW="150px" value={targetType} onChange={(e) => setTargetType(e.target.value)}>
              <option value="">全部目标</option>
              <option value="user">用户</option>
              <option value="team">团队</option>
            </Select>
            <Select maxW="150px" value={success} onChange={(e) => setSuccess(e.target.value)}>
              <option value="">全部结果</option>
              <option value="true">成功</option>
              <option value="false">失败</option>
            </Select>
            <Input
              maxW="190px"
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
            <Input
              maxW="190px"
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
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
                <Th>事件</Th>
                <Th>目标类型</Th>
                <Th>目标</Th>
                <Th>结果</Th>
                <Th>IP</Th>
                <Th>时间</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.list.map((audit) => (
                <Tr key={audit.id}>
                  <Td>{audit.event}</Td>
                  <Td>{audit.targetType}</Td>
                  <Td>{audit.targetName}</Td>
                  <Td>
                    <StatusBadge status={audit.success ? 'succeeded' : 'failed'} />
                  </Td>
                  <Td>{audit.ip || '-'}</Td>
                  <Td>{new Date(audit.createdAt).toLocaleString()}</Td>
                </Tr>
              ))}
              {!data.list.length ? (
                <Tr>
                  <Td colSpan={6} py={12} textAlign="center" color="gray.500">
                    暂无审计记录
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
