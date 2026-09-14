import { Spinner, Box } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    void router.replace('/users');
  }, [router]);
  return (
    <Box minH="100vh" display="grid" placeItems="center">
      <Spinner color="blue.500" />
    </Box>
  );
}
