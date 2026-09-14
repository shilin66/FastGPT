import type { AdminDatasetListItem } from '@fastgpt/global/openapi/admin/manage/api';
import { SearchIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  Flex,
  Input,
  InputGroup,
  InputLeftElement,
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
import { Pagination } from '@/components/Pagination';
import { ListPageCard } from '@/components/ListPageCard';
import { apiRequest, buildQuery } from '@/web/api/client';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

type ListResponse = { total: number; list: AdminDatasetListItem[] };
export default function DatasetsPage() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<ListResponse>({ total: 0, list: [] });
  const [searchKey, setSearchKey] = useState('');
  const [teamId, setTeamId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [type, setType] = useState('');
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(true);
  const [queryHydrated, setQueryHydrated] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    setTeamId(typeof router.query.teamId === 'string' ? router.query.teamId : '');
    setOwnerId(typeof router.query.ownerId === 'string' ? router.query.ownerId : '');
    setQueryHydrated(true);
  }, [router.isReady, router.query.ownerId, router.query.teamId]);

  const load = async () => {
    setLoading(true);
    try {
      setData(
        await apiRequest<ListResponse>(
          `/api/admin/datasets?${buildQuery({ pageNum, pageSize: 20, searchKey, teamId, ownerId, type })}`
        )
      );
    } catch (error) {
      toast({ status: 'error', title: error instanceof Error ? error.message : '加载知识库失败' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (queryHydrated) void load();
  }, [pageNum, queryHydrated]);

  return (
    <AdminLayout>
      <PageHeader title="知识库查询" description="跨团队查看知识库规模和状态，本页面不提供写操作" />
      <ListPageCard
        toolbar={
          <Flex gap={3} mb={4} wrap="wrap">
            <InputGroup maxW="300px">
              <InputLeftElement>
                <SearchIcon color="gray.400" />
              </InputLeftElement>
              <Input
                value={searchKey}
                placeholder="名称或知识库 ID"
                onChange={(event) => setSearchKey(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void load()}
              />
            </InputGroup>
            <Input
              maxW="250px"
              value={teamId}
              placeholder="团队 ID"
              onChange={(event) => setTeamId(event.target.value)}
            />
            <Input
              maxW="250px"
              value={ownerId}
              placeholder="所有者用户 ID"
              onChange={(event) => setOwnerId(event.target.value)}
            />
            <Input
              maxW="180px"
              value={type}
              placeholder="知识库类型"
              onChange={(event) => setType(event.target.value)}
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
                <Th>知识库</Th>
                <Th>类型</Th>
                <Th>团队</Th>
                <Th>所有者</Th>
                <Th>集合</Th>
                <Th>数据量</Th>
                <Th>索引数</Th>
                <Th>更新时间</Th>
                <Th textAlign="right">操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.list.map((dataset) => (
                <Tr key={dataset.id}>
                  <Td>
                    <Text fontWeight="600">{dataset.name}</Text>
                    <Text fontSize="11px" color="gray.500">
                      {dataset.id}
                    </Text>
                  </Td>
                  <Td>{dataset.type}</Td>
                  <Td>{dataset.teamName}</Td>
                  <Td>{dataset.ownerName}</Td>
                  <Td>{dataset.collectionCount}</Td>
                  <Td>{dataset.dataCount}</Td>
                  <Td>{dataset.indexSize}</Td>
                  <Td>{new Date(dataset.updateTime).toLocaleString()}</Td>
                  <Td textAlign="right">
                    <Button size="sm" onClick={() => router.push(`/datasets/${dataset.id}`)}>
                      查看
                    </Button>
                  </Td>
                </Tr>
              ))}
              {!data.list.length ? (
                <Tr>
                  <Td colSpan={9} py={12} textAlign="center" color="gray.500">
                    暂无知识库
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
