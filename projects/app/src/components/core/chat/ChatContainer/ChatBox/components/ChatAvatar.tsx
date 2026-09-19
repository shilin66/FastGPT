import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Flex } from '@chakra-ui/react';
import React from 'react';
import type { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';

const ChatAvatar = ({ src, type }: { src?: string; type: `${ChatRoleEnum}` }) => {
  const isHuman = type === 'Human';

  return (
    <Flex
      w={'28px'}
      h={'28px'}
      flexShrink={0}
      align={'center'}
      justify={'center'}
      p={src ? '2px' : 0}
      borderRadius={'6px'}
      border={'1px solid'}
      borderColor={'myGray.200'}
      bg={isHuman ? 'myGray.150' : 'white'}
    >
      {src ? (
        <Avatar src={src} w={'100%'} h={'100%'} borderRadius={'5px'} />
      ) : isHuman ? (
        <MyIcon name={'common/user'} w={'15px'} color={'myGray.600'} />
      ) : (
        <Avatar w={'100%'} h={'100%'} borderRadius={'5px'} />
      )}
    </Flex>
  );
};

export default React.memo(ChatAvatar);
