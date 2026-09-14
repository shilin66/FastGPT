import { Box } from '@chakra-ui/react';
import type { ReactNode } from 'react';

type ListPageCardProps = {
  toolbar?: ReactNode;
  children: ReactNode;
  pagination: ReactNode;
};

export const ListPageCard = ({ toolbar, children, pagination }: ListPageCardProps) => (
  <Box
    h="calc(100dvh - 124px)"
    minH="440px"
    bg="white"
    border="1px solid"
    borderColor="var(--admin-border)"
    p={4}
    display="flex"
    flexDirection="column"
    overflow="hidden"
  >
    {toolbar ? <Box flexShrink={0}>{toolbar}</Box> : null}
    <Box
      flex="1"
      minH={0}
      overflow="auto"
      sx={{
        '& thead th': {
          position: 'sticky',
          top: 0,
          zIndex: 1,
          bg: 'white'
        }
      }}
    >
      {children}
    </Box>
    <Box flexShrink={0} pt={3} borderTop="1px solid" borderColor="var(--admin-border)">
      {pagination}
    </Box>
  </Box>
);
