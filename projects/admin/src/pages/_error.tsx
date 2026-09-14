import { Box, Button, Heading, Text } from '@chakra-ui/react';
import type { NextPageContext } from 'next';
import { useRouter } from 'next/router';

type ErrorPageProps = {
  statusCode: number;
};

function ErrorPage({ statusCode }: ErrorPageProps) {
  const router = useRouter();

  return (
    <Box minH="100vh" display="grid" placeItems="center" bg="var(--admin-canvas)">
      <Box textAlign="center">
        <Heading size="xl">{statusCode}</Heading>
        <Text mt={3} color="var(--admin-muted)">
          {statusCode === 404 ? '页面不存在' : '页面加载失败'}
        </Text>
        <Button mt={6} colorScheme="blue" onClick={() => router.push('/')}>
          返回管理后台
        </Button>
      </Box>
    </Box>
  );
}

ErrorPage.getInitialProps = async ({ res, err }: NextPageContext): Promise<ErrorPageProps> => ({
  statusCode: res?.statusCode ?? err?.statusCode ?? 404
});

export default ErrorPage;
