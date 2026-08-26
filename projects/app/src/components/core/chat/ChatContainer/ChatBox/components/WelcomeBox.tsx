import { Box, Flex } from '@chakra-ui/react';
import React from 'react';
import Markdown from '@/components/Markdown';
import ChatAvatar from './ChatAvatar';
import { useContextSelector } from 'use-context-selector';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';

const WelcomeBox = ({ welcomeText }: { welcomeText: string }) => {
  const appAvatar = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app?.avatar);

  return (
    <Flex py={[4, 6]} alignItems={'flex-start'} gap={3}>
      <ChatAvatar src={appAvatar} type={'AI'} />
      <Box
        flex={'1 0 0'}
        maxW={'760px'}
        px={[3, 4]}
        py={3}
        bg={'white'}
        border={'base'}
        borderRadius={'8px'}
      >
        <Markdown source={`~~~guide \n${welcomeText}`} forbidZhFormat />
      </Box>
    </Flex>
  );
};

export default WelcomeBox;
