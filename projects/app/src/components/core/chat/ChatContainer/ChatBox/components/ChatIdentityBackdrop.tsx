import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';

type ChatIdentityBackdropProps = {
  readonly avatar?: string;
  readonly name: string;
};

export const ChatIdentityBackdrop = ({ avatar, name }: ChatIdentityBackdropProps) => (
  <Flex
    aria-hidden={true}
    position={'absolute'}
    inset={0}
    alignItems={'center'}
    justifyContent={'center'}
    pointerEvents={'none'}
    zIndex={0}
  >
    <Flex flexDirection={'column'} alignItems={'center'} textAlign={'center'} opacity={0.48}>
      <Avatar src={avatar} w={'44px'} borderRadius={'10px'} />
      <Box mt={3} fontSize={'lg'} fontWeight={600} color={'myGray.700'}>
        {name}
      </Box>
    </Flex>
  </Flex>
);
