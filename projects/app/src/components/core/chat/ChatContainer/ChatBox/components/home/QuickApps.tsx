import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../../Provider';
import { Box, Flex } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';

const QuickApps = () => {
  const quickAppList = useContextSelector(ChatBoxContext, (v) => v.quickAppList);
  const currentQuickAppId = useContextSelector(ChatBoxContext, (v) => v.currentQuickAppId);
  const onSwitchQuickApp = useContextSelector(ChatBoxContext, (v) => v.onSwitchQuickApp);

  return quickAppList && quickAppList.length > 0 ? (
    <Flex mb={2} alignItems="center" justifyContent={'center'} gap={2} flexWrap="wrap">
      {quickAppList.map((q) => (
        <Flex
          key={q._id}
          alignItems="center"
          gap={2}
          h={'36px'}
          border={'1px solid'}
          borderRadius={'6px'}
          px={3}
          cursor="pointer"
          transition={'background 0.15s ease, border-color 0.15s ease'}
          _hover={{ bg: 'myGray.50', borderColor: 'myGray.300' }}
          {...(currentQuickAppId === q._id
            ? {
                bg: 'primary.50',
                color: 'primary.600',
                borderColor: 'primary.200'
              }
            : {
                bg: 'white',
                color: 'myGray.600',
                borderColor: 'myGray.200'
              })}
          onClick={() => onSwitchQuickApp?.(q._id)}
        >
          <Avatar src={q.avatar} w={'20px'} borderRadius={'5px'} />
          <Box maxW={'180px'} fontSize="sm" fontWeight={600} userSelect="none" noOfLines={1}>
            {q.name}
          </Box>
        </Flex>
      ))}
    </Flex>
  ) : null;
};

export default QuickApps;
