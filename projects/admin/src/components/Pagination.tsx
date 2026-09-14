import { Button, Flex, Text } from '@chakra-ui/react';

type PaginationProps = {
  pageNum: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
};

export const Pagination = ({ pageNum, pageSize, total, onChange }: PaginationProps) => {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <Flex align="center" justify="space-between">
      <Text fontSize="12px" color="var(--admin-muted)">
        共 {total} 条
      </Text>
      <Flex align="center" gap={2}>
        <Button size="sm" isDisabled={pageNum <= 1} onClick={() => onChange(pageNum - 1)}>
          上一页
        </Button>
        <Text minW="72px" textAlign="center" fontSize="12px">
          {pageNum} / {pageCount}
        </Text>
        <Button size="sm" isDisabled={pageNum >= pageCount} onClick={() => onChange(pageNum + 1)}>
          下一页
        </Button>
      </Flex>
    </Flex>
  );
};
