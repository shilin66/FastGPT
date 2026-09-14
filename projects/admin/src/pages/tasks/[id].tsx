import type { AdminTask } from '@fastgpt/global/openapi/admin/manage/api';
import { ArrowBackIcon } from '@chakra-ui/icons';
import { Box, Button, Progress, SimpleGrid, Spinner, Text, useToast } from '@chakra-ui/react';
import { AdminLayout } from '@/components/AdminLayout';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { apiRequest } from '@/web/api/client';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
export default function TaskDetailPage() {
  const router = useRouter();
  const toast = useToast();
  const [task, setTask] = useState<AdminTask>();
  const [retrying, setRetrying] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  useEffect(() => {
    if (typeof router.query.id !== 'string') return;
    let timer: number | undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const result = await apiRequest<AdminTask>(`/api/admin/tasks/${router.query.id}`);
        if (cancelled) return;
        setTask(result);
        if (result.status === 'queued' || result.status === 'running') {
          timer = window.setTimeout(() => void load(), 3000);
        }
      } catch (error) {
        toast({ status: 'error', title: error instanceof Error ? error.message : '加载失败' });
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [router.query.id, retryVersion, toast]);
  const retryTask = async () => {
    if (!task) return;
    setRetrying(true);
    try {
      await apiRequest('/api/admin/tasks/action', {
        method: 'POST',
        body: JSON.stringify({ action: 'retry', taskId: task.id })
      });
      setTask({
        ...task,
        status: 'queued',
        progress: 0,
        currentStep: '等待重新执行',
        error: undefined
      });
      setRetryVersion((version) => version + 1);
      toast({ status: 'success', title: '任务已重新提交' });
    } catch (error) {
      toast({ status: 'error', title: error instanceof Error ? error.message : '重试失败' });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <AdminLayout>
      <PageHeader
        title="任务详情"
        action={
          <Box display="flex" gap={2}>
            {task?.status === 'failed' ? (
              <Button colorScheme="blue" isLoading={retrying} onClick={() => void retryTask()}>
                重试任务
              </Button>
            ) : null}
            <Button leftIcon={<ArrowBackIcon />} onClick={() => router.push('/tasks')}>
              返回列表
            </Button>
          </Box>
        }
      />
      {!task ? (
        <Box py={20} textAlign="center">
          <Spinner />
        </Box>
      ) : (
        <Box bg="white" border="1px solid" borderColor="var(--admin-border)" p={5}>
          <SimpleGrid columns={2} gap={5}>
            <Box>
              <Text fontSize="12px" color="gray.500">
                任务类型
              </Text>
              <Text mt={1}>{task.type}</Text>
            </Box>
            <Box>
              <Text fontSize="12px" color="gray.500">
                状态
              </Text>
              <Box mt={1}>
                <StatusBadge status={task.status} />
              </Box>
            </Box>
            <Box>
              <Text fontSize="12px" color="gray.500">
                目标
              </Text>
              <Text mt={1}>{task.targetName}</Text>
            </Box>
            <Box>
              <Text fontSize="12px" color="gray.500">
                当前步骤
              </Text>
              <Text mt={1}>{task.currentStep || '-'}</Text>
            </Box>
          </SimpleGrid>
          <Progress
            mt={6}
            value={task.progress}
            colorScheme={task.status === 'failed' ? 'red' : 'blue'}
          />
          <Text mt={2} fontSize="12px" color="gray.500">
            {task.progress}%
          </Text>
          {task.error ? (
            <Box mt={5} p={3} bg="red.50" color="red.700">
              {task.error}
            </Box>
          ) : null}
        </Box>
      )}
    </AdminLayout>
  );
}
