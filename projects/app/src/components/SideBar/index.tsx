import React, { useState, useEffect, useRef } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import type { BoxProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

interface Props extends BoxProps {
  externalTrigger?: boolean;
}

const SideBar = (e?: Props) => {
  const { w = ['100%', '0 0 268px'], children, externalTrigger, ...props } = e || {};

  const [isFolded, setIsFolded] = useState(false);

  // 保存上一次折叠状态
  const preFoledStatus = useRef(false);

  useEffect(() => {
    if (externalTrigger) {
      setIsFolded(true);
      preFoledStatus.current = isFolded;
    } else {
      setIsFolded(preFoledStatus.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalTrigger]);

  return (
    <Box
      position={'relative'}
      flex={isFolded ? '0 0 0' : w}
      w={['100%', 0]}
      h={'100%'}
      zIndex={1}
      transition={'flex-basis 0.16s ease'}
      _hover={{
        '& > div': { visibility: 'visible', opacity: 1 }
      }}
      {...props}
    >
      <Flex
        position={'absolute'}
        right={'1px'}
        top={'50%'}
        transform={'translate(50%,-50%)'}
        alignItems={'center'}
        justifyContent={'center'}
        w={'28px'}
        h={'44px'}
        borderRadius={'6px'}
        border={'base'}
        bg={'white'}
        boxShadow={'0 6px 16px rgba(15, 23, 42, 0.08)'}
        cursor={'pointer'}
        transition={'0.2s'}
        {...(isFolded
          ? {
              opacity: 1
            }
          : {
              visibility: 'hidden',
              opacity: 0
            })}
        onClick={() => setIsFolded(!isFolded)}
      >
        <MyIcon
          name={'common/backLight'}
          transform={isFolded ? 'rotate(180deg)' : ''}
          w={'14px'}
          color={'myGray.600'}
        />
      </Flex>
      <Box position={'relative'} h={'100%'} overflow={isFolded ? 'hidden' : 'visible'}>
        {children}
      </Box>
    </Box>
  );
};

export default SideBar;
