import { LockIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
  InputGroup,
  InputLeftElement,
  Text,
  useToast
} from '@chakra-ui/react';
import { apiRequest } from '@/web/api/client';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { useRouter } from 'next/router';
import type { FormEvent } from 'react';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'root', password: hashStr(password) })
      });
      const requestedRedirect =
        typeof router.query.redirect === 'string' ? router.query.redirect : '/users';
      const redirect =
        requestedRedirect.startsWith('/') && !requestedRedirect.startsWith('//')
          ? requestedRedirect
          : '/users';
      await router.replace(redirect);
    } catch (error) {
      toast({
        status: 'error',
        title: error instanceof Error ? error.message : '登录失败'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box minH="100vh" display="grid" placeItems="center" bg="var(--admin-canvas)">
      <Box w="400px" bg="white" border="1px solid" borderColor="var(--admin-border)" p={8}>
        <Heading fontSize="22px" letterSpacing="0">
          FastGPT 管理后台
        </Heading>
        <Text mt={2} fontSize="13px" color="var(--admin-muted)">
          仅允许 root 账号登录
        </Text>
        <form onSubmit={submit}>
          <FormControl mt={6}>
            <FormLabel fontSize="12px">账号</FormLabel>
            <Input value="root" isReadOnly />
          </FormControl>
          <FormControl mt={4}>
            <FormLabel fontSize="12px">密码</FormLabel>
            <InputGroup>
              <InputLeftElement pointerEvents="none">
                <LockIcon color="gray.400" />
              </InputLeftElement>
              <Input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </InputGroup>
          </FormControl>
          <Button
            type="submit"
            w="full"
            mt={6}
            colorScheme="blue"
            isDisabled={!password}
            isLoading={submitting}
          >
            登录
          </Button>
        </form>
      </Box>
    </Box>
  );
}
