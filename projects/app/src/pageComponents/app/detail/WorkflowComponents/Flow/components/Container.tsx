import React from 'react';
import { Flex } from '@chakra-ui/react';
import { type BoxProps } from '@chakra-ui/react';

const Container = ({ children, ...props }: BoxProps) => {
  return (
    <Flex
      flexDirection={'column'}
      mx={3}
      px={0}
      py={0}
      position={'relative'}
      bg={'transparent'}
      border={'0'}
      borderRadius={0}
      boxShadow={'none'}
      {...props}
    >
      {children}
    </Flex>
  );
};

export default React.memo(Container);
