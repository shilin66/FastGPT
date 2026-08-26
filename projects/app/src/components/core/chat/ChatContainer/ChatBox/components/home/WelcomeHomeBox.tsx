import { ChatBoxContext } from '@/components/core/chat/ChatContainer/ChatBox/Provider';
import { DEFAULT_LOGO_BANNER_URL } from '@/pageComponents/chat/constants';
import { Box, Flex, Image } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';

const WelcomeHomeBox = () => {
  const wideLogo = useContextSelector(ChatBoxContext, (v) => v.wideLogo);
  const slogan = useContextSelector(ChatBoxContext, (v) => v.slogan);

  return (
    <Flex flexDir="column" justifyContent="flex-end" alignItems="center" gap={3}>
      <Flex h={['52px', '58px']} alignItems="center" justifyContent="center" px={4}>
        <Image
          alt="OmniCockpit"
          maxW={['210px', '260px']}
          maxH={['42px', '46px']}
          src={wideLogo || DEFAULT_LOGO_BANNER_URL}
          fallbackSrc={DEFAULT_LOGO_BANNER_URL}
        />
      </Flex>
      {!!slogan && (
        <Box maxW={'560px'} color="myGray.600" fontSize={'sm'} textAlign={'center'}>
          {slogan}
        </Box>
      )}
    </Flex>
  );
};

export default WelcomeHomeBox;
