import { ArrowBackIcon } from '@chakra-ui/icons';
import { Box, Button, SimpleGrid, Spinner, Text, useToast } from '@chakra-ui/react';
import { AdminLayout } from '@/components/AdminLayout';
import { PageHeader } from '@/components/PageHeader';
import { apiRequest } from '@/web/api/client';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

type AppDetail = {
  id: string;
  name: string;
  intro: string;
  type: string;
  version?: string;
  teamName: string;
  ownerName: string;
  updateTime: Date;
  parentId?: string;
  inheritPermission?: boolean;
};
export default function AppDetailPage() {
  const router = useRouter();
  const toast = useToast();
  const [app, setApp] = useState<AppDetail>();
  useEffect(() => {
    if (typeof router.query.id !== 'string') return;
    apiRequest<AppDetail>(`/api/admin/apps/${router.query.id}`)
      .then(setApp)
      .catch((error: unknown) =>
        toast({ status: 'error', title: error instanceof Error ? error.message : '加载失败' })
      );
  }, [router.query.id, toast]);
  return (
    <AdminLayout>
      <PageHeader
        title={app?.name ?? '应用详情'}
        description="只读详情"
        action={
          <Button leftIcon={<ArrowBackIcon />} onClick={() => router.push('/apps')}>
            返回列表
          </Button>
        }
      />
      {!app ? (
        <Box py={20} textAlign="center">
          <Spinner />
        </Box>
      ) : (
        <Box bg="white" border="1px solid" borderColor="var(--admin-border)" p={5}>
          <SimpleGrid columns={2} gap={5}>
            {[
              ['应用 ID', app.id],
              ['类型', app.type],
              ['版本', app.version || '-'],
              ['团队', app.teamName],
              ['所有者', app.ownerName],
              ['更新时间', new Date(app.updateTime).toLocaleString()],
              ['父级 ID', app.parentId || '-'],
              ['继承权限', app.inheritPermission ? '是' : '否']
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
            <Text mt={1}>{app.intro || '-'}</Text>
          </Box>
        </Box>
      )}
    </AdminLayout>
  );
}
