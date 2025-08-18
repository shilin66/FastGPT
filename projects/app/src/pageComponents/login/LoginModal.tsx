import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { LoginContainer } from '@/pageComponents/login';
import I18nLngSelector from '@/components/Select/I18nLngSelector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';

type LoginModalProps = {
  onSuccess?: () => void;
};

const LoginModal = ({ onSuccess }: LoginModalProps) => {
  const { isPc } = useSystem();

  return (
    <Flex
      alignItems={'center'}
      justifyContent={'flex-end'}
      bg={['white', `url(${getWebReqUrl('/icon/login-bg1.svg')}) no-repeat`]}
      backgroundSize={['cover', 'cover']}
      userSelect={'none'}
      h={'100%'}
      px={[0, '10vw']}
    >
      {isPc && (
        <Box position={'absolute'} top={'24px'} right={'50px'}>
          <I18nLngSelector />
        </Box>
      )}
      <Flex
        flexDirection={'column'}
        w={['100%', 'auto']}
        h={['100%', '600px']}
        maxH={['100%', '90vh']}
        bg={'white'}
        px={['5vw', '88px']}
        py={'5vh'}
        borderRadius={[0, '24px']}
        boxShadow={[
          '',
          '0px 0px 1px 0px rgba(19, 51, 107, 0.20), 0px 32px 64px -12px rgba(19, 51, 107, 0.20)'
        ]}
      >
        <LoginContainer onSuccess={onSuccess} />
      </Flex>
    </Flex>
  );
};

export default LoginModal;
