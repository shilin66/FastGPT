import {
  AtSignIcon,
  CalendarIcon,
  CheckCircleIcon,
  CopyIcon,
  SettingsIcon,
  SmallCloseIcon,
  TimeIcon
} from '@chakra-ui/icons';
import { Box, Button, Flex, Icon, Spinner, Text, Tooltip } from '@chakra-ui/react';
import { useAdminSession } from '@/web/hooks/useAdminSession';
import { apiRequest } from '@/web/api/client';
import { useRouter } from 'next/router';
import type { ReactNode } from 'react';

type AdminLayoutProps = {
  children: ReactNode;
};

const navigation = [
  { href: '/users', label: '用户管理', icon: AtSignIcon },
  { href: '/teams', label: '团队管理', icon: SettingsIcon },
  { href: '/apps', label: '应用查询', icon: CopyIcon },
  { href: '/datasets', label: '知识库查询', icon: CalendarIcon },
  { href: '/tasks', label: '任务中心', icon: TimeIcon },
  { href: '/audits', label: '操作审计', icon: CheckCircleIcon }
] as const;

export const AdminLayout = ({ children }: AdminLayoutProps) => {
  const state = useAdminSession();
  const router = useRouter();

  if (state === 'error') {
    return (
      <Box minH="100vh" display="grid" placeItems="center">
        <Text color="red.600">管理后台暂时无法连接，请稍后刷新页面</Text>
      </Box>
    );
  }

  if (state !== 'authenticated') {
    return (
      <Box minH="100vh" display="grid" placeItems="center">
        <Spinner color="blue.500" />
      </Box>
    );
  }

  return (
    <Flex minH="100vh" bg="var(--admin-canvas)">
      <Box
        position="fixed"
        inset="0 auto 0 0"
        w="224px"
        bg="var(--admin-navigation)"
        borderRight="1px solid"
        borderColor="var(--admin-border)"
        px={3}
        py={4}
      >
        <Flex h="48px" px={3} align="center" gap={3} mb={4}>
          <Box>
            <Text fontSize="14px" fontWeight="700" color="var(--admin-graphite)">
              FastGPT Admin
            </Text>
            <Text fontSize="11px" color="var(--admin-muted)">
              平台运营控制台
            </Text>
          </Box>
        </Flex>
        <Flex direction="column" gap={1}>
          {navigation.map((item) => {
            const active = router.pathname.startsWith(item.href);
            return (
              <Button
                key={item.href}
                justifyContent="flex-start"
                h="40px"
                px={3}
                leftIcon={<Icon as={item.icon} boxSize="16px" />}
                variant="ghost"
                bg={active ? 'white' : 'transparent'}
                color={active ? 'blue.600' : 'gray.700'}
                border="1px solid"
                borderColor={active ? 'var(--admin-border)' : 'transparent'}
                borderRadius="6px"
                fontSize="13px"
                onClick={() => router.push(item.href)}
              >
                {item.label}
              </Button>
            );
          })}
        </Flex>
        <Tooltip label="退出管理后台" placement="right">
          <Button
            position="absolute"
            bottom={4}
            left={3}
            right={3}
            h="40px"
            justifyContent="flex-start"
            leftIcon={<SmallCloseIcon />}
            variant="ghost"
            fontSize="13px"
            onClick={async () => {
              await apiRequest('/api/admin/auth/logout', { method: 'POST' });
              await router.replace('/login');
            }}
          >
            退出登录
          </Button>
        </Tooltip>
      </Box>
      <Box ml="224px" w="calc(100% - 224px)" minW={0} p={6}>
        {children}
      </Box>
    </Flex>
  );
};
