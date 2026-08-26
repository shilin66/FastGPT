import { useContextSelector } from 'use-context-selector';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { useTranslation } from 'react-i18next';
import { Box, Button, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';

type Props = {
  menuConfirmButtonText?: string;
  embedded?: boolean;
};

const ChatSliderMenu = ({ menuConfirmButtonText, embedded = false }: Props) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();

  const histories = useContextSelector(ChatContext, (v) => v.histories);
  const onClearHistory = useContextSelector(ChatContext, (v) => v.onClearHistories);
  const onChangeChatId = useContextSelector(ChatContext, (v) => v.onChangeChatId);

  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  return (
    <Flex
      w={'100%'}
      px={embedded ? 0 : [2, 3]}
      h={embedded ? '36px' : '40px'}
      my={embedded ? 2 : 3}
      justify={['space-between', '']}
      alignItems={'center'}
      gap={2}
    >
      {!isPc && (
        <Flex height={'100%'} align={'center'} justify={'center'}>
          <MyIcon ml={2} name="core/chat/sideLine" />
          <Box ml={2} fontWeight={'bold'}>
            {t('common:core.chat.History')}
          </Box>
        </Flex>
      )}

      <Button
        variant={embedded ? 'whiteBase' : 'primary'}
        flex={['0 0 auto', 1]}
        h={'100%'}
        px={4}
        borderRadius={'6px'}
        border={embedded ? '1px solid' : undefined}
        borderColor={embedded ? 'myGray.200' : undefined}
        bg={embedded ? 'myGray.900' : undefined}
        color={embedded ? 'white' : undefined}
        _hover={embedded ? { bg: 'myGray.800' } : undefined}
        leftIcon={<MyIcon name={'core/chat/chatLight'} w={'16px'} />}
        overflow={'hidden'}
        onClick={() => {
          onChangeChatId();
          setCiteModalData(undefined);
        }}
      >
        {t('common:core.chat.New Chat')}
      </Button>

      {isPc && histories.length > 0 && (
        <PopoverConfirm
          Trigger={
            <Box h={'100%'}>
              <IconButton
                variant={'whiteDanger'}
                size={'mdSquare'}
                aria-label={t('common:core.chat.Confirm to clear history')}
                borderRadius={'6px'}
                icon={<MyIcon name={'common/clearLight'} w={'16px'} />}
              />
            </Box>
          }
          type="delete"
          content={menuConfirmButtonText || t('common:Delete')}
          onConfirm={() => onClearHistory()}
        />
      )}
    </Flex>
  );
};

export default ChatSliderMenu;
