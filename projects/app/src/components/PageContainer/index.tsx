import React from 'react';
import { type BoxProps } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';

const PageContainer = ({
  children,
  isLoading,
  insertProps = {},
  ...props
}: BoxProps & { isLoading?: boolean; insertProps?: BoxProps }) => {
  return (
    <MyBox h={'100%'} {...props}>
      <MyBox
        isLoading={isLoading}
        h={'100%'}
        borderWidth={0}
        boxShadow={'none'}
        overflow={'overlay'}
        bg={'myGray.25'}
        borderRadius={0}
        overflowX={'hidden'}
        {...insertProps}
      >
        {children}
      </MyBox>
    </MyBox>
  );
};

export default PageContainer;
