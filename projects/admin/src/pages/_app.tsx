import '@/styles/globals.css';
import { ChakraProvider } from '@chakra-ui/react';
import { theme } from '@fastgpt/web/styles/theme';
import type { AppProps } from 'next/app';
import Head from 'next/head';

export default function AdminApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>FastGPT 管理后台</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <ChakraProvider
        theme={theme}
        toastOptions={{ defaultOptions: { position: 'top', duration: 3000, isClosable: true } }}
      >
        <Component {...pageProps} />
      </ChakraProvider>
    </>
  );
}
