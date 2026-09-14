import { Badge } from '@chakra-ui/react';

const statusConfig: Record<string, { label: string; colorScheme: string }> = {
  active: { label: '正常', colorScheme: 'green' },
  forbidden: { label: '已冻结', colorScheme: 'orange' },
  frozen: { label: '已冻结', colorScheme: 'orange' },
  queued: { label: '等待中', colorScheme: 'gray' },
  running: { label: '执行中', colorScheme: 'blue' },
  succeeded: { label: '已完成', colorScheme: 'green' },
  failed: { label: '失败', colorScheme: 'red' }
};

export const StatusBadge = ({ status }: { status: string }) => {
  const config = statusConfig[status] ?? { label: status, colorScheme: 'gray' };
  return (
    <Badge colorScheme={config.colorScheme} borderRadius="4px" px={2} py={0.5} fontWeight="500">
      {config.label}
    </Badge>
  );
};
