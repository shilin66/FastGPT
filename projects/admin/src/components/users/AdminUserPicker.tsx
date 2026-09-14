import type { AdminUserListItem } from '@fastgpt/global/openapi/admin/manage/api';
import { Flex, Input, Select, Spinner } from '@chakra-ui/react';
import { apiRequest, buildQuery } from '@/web/api/client';
import { useEffect, useMemo, useState } from 'react';

type AdminUserPickerProps = {
  value: string;
  excludeUserIds?: readonly string[];
  onChange: (userId: string) => void;
};

type UserListResponse = { total: number; list: AdminUserListItem[] };

export const AdminUserPicker = ({ value, excludeUserIds = [], onChange }: AdminUserPickerProps) => {
  const [searchKey, setSearchKey] = useState('');
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const excluded = useMemo(() => new Set(excludeUserIds), [excludeUserIds]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await apiRequest<UserListResponse>(
          `/api/admin/users?${buildQuery({ pageNum: 1, pageSize: 100, searchKey, status: 'active' })}`
        );
        setUsers(result.list);
      } catch {
        setUsers([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchKey]);

  const options = users.filter((user) => !user.isRoot && !excluded.has(user.id));

  return (
    <Flex direction="column" gap={2}>
      <Input
        size="sm"
        value={searchKey}
        placeholder="输入用户名或联系方式筛选"
        onChange={(event) => setSearchKey(event.target.value)}
      />
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">请选择用户</option>
        {options.map((user) => (
          <option key={user.id} value={user.id}>
            {user.username}
          </option>
        ))}
      </Select>
      {loading ? <Spinner size="xs" color="gray.400" /> : null}
    </Flex>
  );
};
