import { ArrowBackIcon } from '@chakra-ui/icons';
import { Box, Button, SimpleGrid, Spinner, Text, useToast } from '@chakra-ui/react';
import { AdminLayout } from '@/components/AdminLayout';
import { PageHeader } from '@/components/PageHeader';
import { apiRequest } from '@/web/api/client';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

type DatasetDetail = {
  id: string;
  name: string;
  intro: string;
  type: string;
  status?: string;
  teamName: string;
  ownerName: string;
  updateTime: Date;
  vectorModel?: string;
  agentModel?: string;
  collectionCount: number;
  dataCount: number;
};
export default function DatasetDetailPage() {
  const router = useRouter();
  const toast = useToast();
  const [dataset, setDataset] = useState<DatasetDetail>();
  useEffect(() => {
    if (typeof router.query.id !== 'string') return;
    apiRequest<DatasetDetail>(`/api/admin/datasets/${router.query.id}`)
      .then(setDataset)
      .catch((error: unknown) =>
        toast({ status: 'error', title: error instanceof Error ? error.message : '加载失败' })
      );
  }, [router.query.id, toast]);
  return (
    <AdminLayout>
      <PageHeader
        title={dataset?.name ?? '知识库详情'}
        description="只读详情"
        action={
          <Button leftIcon={<ArrowBackIcon />} onClick={() => router.push('/datasets')}>
            返回列表
          </Button>
        }
      />
      {!dataset ? (
        <Box py={20} textAlign="center">
          <Spinner />
        </Box>
      ) : (
        <Box bg="white" border="1px solid" borderColor="var(--admin-border)" p={5}>
          <SimpleGrid columns={3} gap={5}>
            {[
              ['知识库 ID', dataset.id],
              ['类型', dataset.type],
              ['状态', dataset.status || '-'],
              ['团队', dataset.teamName],
              ['所有者', dataset.ownerName],
              ['更新时间', new Date(dataset.updateTime).toLocaleString()],
              ['向量模型', dataset.vectorModel || '-'],
              ['Agent 模型', dataset.agentModel || '-'],
              ['集合 / 数据', `${dataset.collectionCount} / ${dataset.dataCount}`]
            ].map(([label, value]) => (
              <Box key={String(label)}>
                <Text fontSize="12px" color="gray.500">
                  {label}
                </Text>
                <Text mt={1}>{value}</Text>
              </Box>
            ))}
          </SimpleGrid>
          <Box mt={6}>
            <Text fontSize="12px" color="gray.500">
              简介
            </Text>
            <Text mt={1}>{dataset.intro || '-'}</Text>
          </Box>
        </Box>
      )}
    </AdminLayout>
  );
}
