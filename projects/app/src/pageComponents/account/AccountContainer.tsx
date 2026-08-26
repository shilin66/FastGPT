import React from 'react';
import { Box } from '@chakra-ui/react';
import PageContainer from '@/components/PageContainer';

const AccountContainer = ({
  children,
  isLoading
}: {
  children: React.ReactNode;
  isLoading?: boolean;
}) => {
  return (
    <PageContainer isLoading={isLoading}>
      <Box h={'100%'} overflow={'auto'}>
        {children}
      </Box>
    </PageContainer>
  );
};

export default AccountContainer;
