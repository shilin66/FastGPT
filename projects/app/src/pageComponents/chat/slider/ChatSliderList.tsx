import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';

const ChatSliderList = ({ compact = false }: { compact?: boolean }) => {
  const { t } = useTranslation();

  const formatUpdatedAt = (time: Date) => {
    const formattedTime = formatTimeToChatTime(time);

    if (formattedTime === 'common:just_now') return t('common:just_now');
    if (formattedTime === 'common:yesterday') return t('common:yesterday');

    return formattedTime.replace('#', ':');
  };

  const { chatId: activeChatId } = useChatStore();

  const histories = useContextSelector(ChatContext, (v) => v.histories);
  const ScrollData = useContextSelector(ChatContext, (v) => v.ScrollData);
  const onDelHistory = useContextSelector(ChatContext, (v) => v.onDelHistory);
  const onUpdateHistory = useContextSelector(ChatContext, (v) => v.onUpdateHistory);
  const onChangeChatId = useContextSelector(ChatContext, (v) => v.onChangeChatId);

  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);
  const chatBoxData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);

  const concatHistory = useMemo(() => {
    const formatHistories: {
      id: string;
      title: string;
      customTitle?: string;
      top?: boolean;
      updateTime: Date;
      chatGenerateStatus?: ChatGenerateStatusEnum;
      hasBeenRead?: boolean;
    }[] = histories.map((item) => {
      const isActiveChat = item.chatId === activeChatId && chatBoxData.chatId === item.chatId;

      return {
        id: item.chatId,
        title: item.title,
        customTitle: item.customTitle,
        top: item.top,
        updateTime: item.updateTime,
        chatGenerateStatus: isActiveChat
          ? chatBoxData.chatGenerateStatus ?? item.chatGenerateStatus
          : item.chatGenerateStatus,
        hasBeenRead: isActiveChat ? chatBoxData.hasBeenRead ?? item.hasBeenRead : item.hasBeenRead
      };
    });

    const newChat: {
      id: string;
      title: string;
      customTitle?: string;
      top?: boolean;
      updateTime: Date;
      chatGenerateStatus?: ChatGenerateStatusEnum;
      hasBeenRead?: boolean;
    } = {
      id: activeChatId,
      title: t('common:core.chat.New Chat'),
      updateTime: new Date(),
      chatGenerateStatus:
        chatBoxData.chatId === activeChatId ? chatBoxData.chatGenerateStatus : undefined,
      hasBeenRead: chatBoxData.chatId === activeChatId ? chatBoxData.hasBeenRead : undefined
    };
    const activeChat = histories.find((item) => item.chatId === activeChatId);

    return !activeChat ? [newChat].concat(formatHistories) : formatHistories;
  }, [
    activeChatId,
    histories,
    t,
    chatBoxData.chatId,
    chatBoxData.chatGenerateStatus,
    chatBoxData.hasBeenRead
  ]);

  // custom title edit
  const { onOpenModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('common:core.chat.Custom History Title'),
    placeholder: t('common:core.chat.Custom History Title Description')
  });

  return (
    <>
      <Flex
        px={compact ? 1 : [3, 4]}
        pb={compact ? 1.5 : 2}
        align={'center'}
        justify={'space-between'}
      >
        <Box fontSize={'xs'} fontWeight={600} color={'myGray.600'}>
          {t('common:core.chat.History')}
        </Box>
        <Box fontSize={'mini'} color={'myGray.500'}>
          {concatHistory.length}
        </Box>
      </Flex>
      <ScrollData
        flex={compact ? '0 1 auto' : '1 0 0'}
        h={compact ? 'auto' : 0}
        maxH={compact ? '224px' : undefined}
        px={compact ? 0 : [2, 3]}
        overflow={'overlay'}
      >
        {concatHistory.map((item, i) => (
          <Flex
            key={item.id}
            alignItems={'center'}
            px={compact ? 2 : 3}
            minH={compact ? '44px' : '50px'}
            cursor={'pointer'}
            userSelect={'none'}
            borderRadius={'6px'}
            fontSize={'sm'}
            position={'relative'}
            _hover={{
              bg: 'white',
              '& .more': {
                opacity: 1,
                pointerEvents: 'auto'
              },
              '& .unreadDot': {
                display: 'none'
              }
            }}
            bg={item.id === activeChatId ? 'primary.50' : item.top ? 'myGray.100' : 'transparent'}
            {...(item.id === activeChatId
              ? {
                  color: 'primary.700',
                  _before: {
                    content: '""',
                    position: 'absolute',
                    left: 0,
                    top: '9px',
                    bottom: '9px',
                    w: '3px',
                    borderRadius: '0 3px 3px 0',
                    bg: 'primary.600'
                  }
                }
              : {
                  onClick: () => {
                    onChangeChatId(item.id);
                    setCiteModalData(undefined);
                  }
                })}
            {...(i !== concatHistory.length - 1 && {
              mb: '4px'
            })}
          >
            <Flex
              w={compact ? '24px' : '28px'}
              h={compact ? '24px' : '28px'}
              align={'center'}
              justify={'center'}
              borderRadius={'6px'}
              bg={item.id === activeChatId ? 'white' : 'myGray.100'}
              flexShrink={0}
            >
              <MyIcon
                name={item.id === activeChatId ? 'core/chat/chatFill' : 'core/chat/chatLight'}
                w={compact ? '13px' : '15px'}
              />
            </Flex>
            <Box flex={'1 0 0'} ml={2.5} minW={0}>
              <Box className="textEllipsis" fontWeight={item.id === activeChatId ? 600 : 500}>
                {item.customTitle || item.title}
              </Box>
              <Box
                className="time"
                mt={0.5}
                fontWeight={400}
                fontSize={'mini'}
                color={
                  item.chatGenerateStatus === ChatGenerateStatusEnum.generating
                    ? 'primary.600'
                    : 'myGray.500'
                }
              >
                {item.chatGenerateStatus === ChatGenerateStatusEnum.generating
                  ? t('chat:history_generating')
                  : formatUpdatedAt(item.updateTime)}
              </Box>
            </Box>
            {!!item.id && (
              <Flex gap={2} alignItems={'center'}>
                {item.hasBeenRead === false &&
                item.chatGenerateStatus !== ChatGenerateStatusEnum.generating ? (
                  <Box
                    className="unreadDot"
                    w={'8px'}
                    h={'8px'}
                    borderRadius={'full'}
                    bg={'primary.500'}
                    flexShrink={0}
                  />
                ) : null}
                <Box
                  className="more"
                  display={'block'}
                  opacity={[1, 0]}
                  pointerEvents={['auto', 'none']}
                  flexShrink={0}
                  transition={'opacity 0.15s ease'}
                  _focusWithin={{
                    opacity: 1,
                    pointerEvents: 'auto'
                  }}
                >
                  <MyMenu
                    trigger={'click'}
                    placement={'bottom-end'}
                    width={'148px'}
                    usePortal
                    Button={
                      <IconButton
                        size={'xs'}
                        variant={'whiteBase'}
                        icon={<MyIcon name={'more'} w={'14px'} p={1} />}
                        aria-label={''}
                      />
                    }
                    menuList={[
                      {
                        children: [
                          {
                            label: item.top
                              ? t('common:core.chat.Unpin')
                              : t('common:core.chat.Pin'),
                            icon: 'core/chat/setTopLight',
                            onClick: () => {
                              onUpdateHistory({
                                chatId: item.id,
                                top: !item.top
                              });
                            }
                          },

                          {
                            label: t('common:custom_title'),
                            icon: 'common/customTitleLight',
                            onClick: () => {
                              onOpenModal({
                                defaultVal: item.customTitle || item.title,
                                onSuccess: (e) =>
                                  onUpdateHistory({
                                    chatId: item.id,
                                    customTitle: e
                                  })
                              });
                            }
                          },
                          {
                            label: t('common:Delete'),
                            icon: 'delete',
                            onClick: () => {
                              onDelHistory(item.id);
                              if (item.id === activeChatId) {
                                onChangeChatId();
                                setCiteModalData(undefined);
                              }
                            },
                            type: 'danger'
                          }
                        ]
                      }
                    ]}
                  />
                </Box>
              </Flex>
            )}
          </Flex>
        ))}
      </ScrollData>

      <EditTitleModal />
    </>
  );
};

export default ChatSliderList;
