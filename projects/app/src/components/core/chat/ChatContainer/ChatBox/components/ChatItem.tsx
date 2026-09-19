import { Box, type BoxProps, Card, Flex, Button } from '@chakra-ui/react';
import React, { useMemo, useState, useRef } from 'react';
import ChatController, { type ChatControllerProps } from './ChatController';
import ChatAvatar from './ChatAvatar';
import { ChatTypeEnum, MessageCardStyle } from '../constants';
import { formatChatValue2InputType } from '../utils';
import Markdown from '@/components/Markdown';
import styles from '../index.module.scss';
import markdownStyles from '@/components/Markdown/index.module.scss';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import FilesBlock from './FilesBox';
import { ChatBoxContext } from '../Provider';
import { useContextSelector } from 'use-context-selector';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';
import AIResponseBox from '../../../components/AIResponseBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { type AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { CodeClassNameEnum } from '@/components/Markdown/utils';
import { isEqual } from 'lodash';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { formatTimeToChatItemTime } from '@fastgpt/global/common/string/time';
import dayjs from 'dayjs';
import {
  ChatItemContext,
  type OnOpenCiteModalProps
} from '@/web/core/chat/context/chatItemContext';
import { addStatisticalDataToHistoryItem } from '@/global/core/chat/utils';
import dynamic from 'next/dynamic';
import { useMemoizedFn, useSize } from 'ahooks';
import ChatBoxDivider from '../../../Divider';
import { eventBus, EventNameEnum } from '@/web/common/utils/eventbus';
import { ConfirmPlanAgentText } from '@fastgpt/global/core/workflow/runtime/constants';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';

const ResponseTags = dynamic(() => import('./ResponseTags'));

const colorMap = {
  [ChatStatusEnum.loading]: {
    bg: 'myGray.100',
    color: 'myGray.600'
  },
  [ChatStatusEnum.running]: {
    bg: 'green.50',
    color: 'green.700'
  },
  [ChatStatusEnum.finish]: {
    bg: 'green.50',
    color: 'green.700'
  }
};

type Props = {
  avatar?: string;
  statusBoxData?: {
    status: `${ChatStatusEnum}`;
    name: string;
  };
  questionGuides?: string[];
  children?: React.ReactNode;
  hasPlanCheck?: boolean;
} & ChatControllerProps;

const RenderQuestionGuide = ({ questionGuides }: { questionGuides: string[] }) => {
  return (
    <Markdown
      source={`\`\`\`${CodeClassNameEnum.questionguide}
${JSON.stringify(questionGuides)}`}
    />
  );
};

const HumanContentCard = React.memo(
  function HumanContentCard({ chatValue }: { chatValue: UserChatItemValueItemType[] }) {
    const { text, files = [] } = formatChatValue2InputType(chatValue);
    return (
      <Flex flexDirection={'column'} gap={4}>
        {files.length > 0 && <FilesBlock files={files} />}
        {text && (
          <Box
            fontSize={'inherit'}
            color={'inherit'}
            whiteSpace={'pre-wrap'}
            wordBreak={'break-word'}
          >
            {text}
          </Box>
        )}
      </Flex>
    );
  },
  (prevProps, nextProps) => isEqual(prevProps.chatValue, nextProps.chatValue)
);
const AIContentCard = React.memo(function AIContentCard({
  chatValue,
  dataId,
  isLastChild,
  isChatting,
  questionGuides,
  onOpenCiteModal
}: {
  dataId: string;
  chatValue: AIChatItemValueItemType[];
  isLastChild: boolean;
  isChatting: boolean;
  questionGuides: string[];
  onOpenCiteModal: (e?: OnOpenCiteModalProps) => void;
}) {
  const lastValue = chatValue[chatValue.length - 1];
  const lastIsText = lastValue?.text;
  const lastIsReasoning = lastValue?.reasoning;
  return (
    <Flex flexDirection={'column'}>
      {chatValue.map((value, i) => {
        const isLastResponse = isLastChild && i === chatValue.length - 1;
        const key = `${dataId}-ai-${i}`;
        const folded = value.stepId
          ? chatValue.find((item) => item.stepTitle?.stepId === value.stepId)?.stepTitle?.folded ??
            true
          : false;

        if (folded) return null;

        return (
          <Box
            key={key}
            _notFirst={
              value.stepId
                ? {
                    pb: 2,
                    pl: 4,
                    borderLeft: '4px solid',
                    borderLeftColor: 'myGray.200'
                  }
                : {
                    mt: 2
                  }
            }
          >
            <AIResponseBox
              chatItemDataId={dataId}
              value={value}
              isLastResponseValue={isLastResponse}
              isLastChild={isLastChild}
              isChatting={isChatting}
              onOpenCiteModal={onOpenCiteModal}
            />
          </Box>
        );
      })}

      {/* 生成中占位动画（含断线续传拉流期间最后一条非文本时的 shimmer） */}
      {isLastChild && !lastIsText && !lastIsReasoning && isChatting && (
        <Box className={markdownStyles.animation}></Box>
      )}

      {isLastChild && questionGuides.length > 0 && (
        <RenderQuestionGuide questionGuides={questionGuides} />
      )}
    </Flex>
  );
});

const ChatItem = ({ hasPlanCheck, ...props }: Props) => {
  const { avatar, statusBoxData, children, isLastChild, questionGuides = [], chat } = props;

  const { t } = useTranslation();
  const { isPc } = useSystem();

  const [showFeedbackContent, setShowFeedbackContent] = useState(false);

  // Error variables
  const [errorExpanded, setErrorExpanded] = useState(false);
  const errorContentRef = useRef<HTMLDivElement>(null);
  const errorContentSize = useSize(errorContentRef);
  const errorContentOverflow = (errorContentSize?.height || 0) > 100;

  const styleMap: BoxProps = useMemoEnhance(
    () => ({
      ...(chat.obj === ChatRoleEnum.Human
        ? {
            borderRadius: '12px 4px 12px 12px',
            textAlign: 'right',
            bg: 'myGray.150'
          }
        : {
            borderRadius: 0,
            textAlign: 'left',
            bg: 'transparent'
          }),
      fontSize: 'mini',
      fontWeight: '400',
      color: 'myGray.500'
    }),
    [chat.obj]
  );

  const isChatting = useContextSelector(ChatBoxContext, (v) => v.isChatting);
  const chatType = useContextSelector(ChatBoxContext, (v) => v.chatType);
  const showRunningStatus = useContextSelector(ChatItemContext, (v) => v.showRunningStatus);
  const showAvatar = useContextSelector(ChatItemContext, (v) => v.showAvatar);
  const assistantName = useContextSelector(ChatItemContext, (v) => v.chatBoxData.app.name);
  const showAiIdentity = chat.obj === ChatRoleEnum.AI && showAvatar !== false;
  const showHumanIdentity = chat.obj === ChatRoleEnum.Human && showAvatar !== false;

  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const isShowFullText = useContextSelector(ChatItemContext, (v) => v.isShowFullText);

  const { totalQuoteList: quoteList = [], errorText } = useMemoEnhance(
    () => addStatisticalDataToHistoryItem(chat),
    [chat]
  );

  const isChatLog = chatType === 'log';
  const isPortalMessage = chatType === ChatTypeEnum.chat || chatType === ChatTypeEnum.home;

  const chatStatusMap = useMemoEnhance(() => {
    if (!statusBoxData?.status) return;
    return colorMap[statusBoxData.status];
  }, [statusBoxData?.status]);

  const showController = !(isChatting && chat.obj === ChatRoleEnum.AI && isLastChild);

  const timeLabel =
    chat.time && (isPc || isChatLog || isPortalMessage) ? (
      <Box
        className={'time-label'}
        fontSize={isPortalMessage ? '11px' : styleMap.fontSize}
        color={isPortalMessage ? 'myGray.500' : styleMap.color}
        fontWeight={styleMap.fontWeight}
        w={isChatLog ? 'auto' : isPortalMessage ? '42px' : '36px'}
        flexShrink={0}
        textAlign={'center'}
        whiteSpace={'nowrap'}
        opacity={isChatLog || isPortalMessage ? 1 : 0}
        visibility={isChatLog || isPortalMessage ? 'visible' : 'hidden'}
        pointerEvents={'none'}
        transition={'opacity 0.15s ease'}
        fontFamily={isPortalMessage ? 'mono' : undefined}
      >
        {isChatLog
          ? t(formatTimeToChatItemTime(chat.time) as any, {
              time: dayjs(chat.time).format('HH:mm')
            }).replace('#', ':')
          : dayjs(chat.time).format('HH:mm')}
      </Box>
    ) : null;

  /*
    1. The interactive node is divided into n dialog boxes.
    2. Auto-complete the last textnode
  */
  const splitAiResponseResults = useMemo(() => {
    if (chat.obj === ChatRoleEnum.Human) return [chat.value];

    if (chat.obj === ChatRoleEnum.AI) {
      // Remove empty text node
      const filterList = chat.value.filter((item, i) => {
        if (item.text && !item.text.content?.trim()) {
          return false;
        }
        if (item.reasoning && !item.reasoning.content?.trim()) {
          return false;
        }
        return item;
      });

      const groupedValues: AIChatItemValueItemType[][] = [];
      let currentGroup: AIChatItemValueItemType[] = [];

      filterList.forEach((value) => {
        if (value.interactive) {
          if (currentGroup.length > 0) {
            groupedValues.push(currentGroup);
            currentGroup = [];
          }

          groupedValues.push([value]);
        } else {
          currentGroup.push(value);
        }
      });

      if (currentGroup.length > 0) {
        groupedValues.push(currentGroup);
      }

      // Check last group is interactive, Auto add a empty text node(animation)
      const lastGroup = groupedValues[groupedValues.length - 1];
      if (isLastChild && (isChatting || groupedValues.length === 0)) {
        if (
          (lastGroup &&
            lastGroup[lastGroup.length - 1] &&
            lastGroup[lastGroup.length - 1].interactive) ||
          groupedValues.length === 0
        ) {
          groupedValues.push([
            {
              text: {
                content: ''
              }
            }
          ]);
        }
      } else if (groupedValues.length === 0) {
        // 对于非最后一条的空 AI 消息，也补充一个空节点，避免消息"消失"
        groupedValues.push([
          {
            text: {
              content: ''
            }
          }
        ]);
      }

      return groupedValues;
    }

    return [];
  }, [chat.obj, chat.value, isChatting, isLastChild]);

  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);
  const onOpenCiteModal = useMemoizedFn(
    (item?: {
      collectionId?: string;
      sourceId?: string;
      sourceName?: string;
      datasetId?: string;
      quoteId?: string;
    }) => {
      const collectionIdList = item?.collectionId
        ? [item.collectionId]
        : [...new Set(quoteList.map((item) => item.collectionId))];

      setCiteModalData({
        rawSearch: quoteList,
        metadata:
          item?.collectionId && isShowFullText
            ? {
                appId: appId,
                chatId: chatId,
                chatItemDataId: chat.dataId,
                collectionId: item.collectionId,
                collectionIdList,
                sourceId: item.sourceId || '',
                sourceName: item.sourceName || '',
                datasetId: item.datasetId || '',
                outLinkAuthData,
                quoteId: item.quoteId
              }
            : {
                appId: appId,
                chatId: chatId,
                chatItemDataId: chat.dataId,
                collectionIdList,
                sourceId: item?.sourceId,
                sourceName: item?.sourceName,
                outLinkAuthData
              }
      });
    }
  );

  return (
    <Box
      data-chat-id={chat.dataId}
      _hover={{
        '& .time-label': {
          opacity: 1,
          visibility: 'visible'
        }
      }}
      _focusWithin={{
        '& .time-label': {
          opacity: 1,
          visibility: 'visible'
        }
      }}
    >
      <Flex
        w={'100%'}
        maxW={isPortalMessage ? '820px' : '100%'}
        ml={isPortalMessage && chat.obj === ChatRoleEnum.Human ? 'auto' : 0}
        minH={isPortalMessage ? '30px' : undefined}
        alignItems={'center'}
        justifyContent={chat.obj === ChatRoleEnum.Human ? 'flex-end' : 'flex-start'}
        gap={1.5}
        mb={2}
      >
        {showAiIdentity && <ChatAvatar src={avatar} type={chat.obj} />}

        {isPortalMessage && chat.obj === ChatRoleEnum.AI && (
          <Box
            mx={0.75}
            maxW={'180px'}
            overflow={'hidden'}
            color={'myGray.700'}
            fontSize={'12px'}
            fontWeight={'600'}
            textOverflow={'ellipsis'}
            whiteSpace={'nowrap'}
          >
            {assistantName}
          </Box>
        )}

        {chat.obj === ChatRoleEnum.Human && timeLabel}

        {showController && (
          <Box
            flexShrink={0}
            opacity={isPortalMessage ? 0.72 : 1}
            transition={'opacity 0.15s ease'}
            _hover={{ opacity: 1 }}
            _focusWithin={{ opacity: 1 }}
          >
            <ChatController
              {...props}
              isLastChild={isLastChild}
              showFeedbackContent={showFeedbackContent}
              onToggleFeedbackContent={() => setShowFeedbackContent(!showFeedbackContent)}
            />
          </Box>
        )}

        {chat.obj === ChatRoleEnum.AI && timeLabel}

        {/* Workflow status */}
        {chat.obj === ChatRoleEnum.AI &&
          !!chatStatusMap &&
          statusBoxData &&
          isLastChild &&
          showRunningStatus && (
            <Flex
              alignItems={'center'}
              px={2.5}
              py={1}
              borderRadius={'6px'}
              bg={chatStatusMap.bg}
              fontSize={'xs'}
            >
              <Box
                className={styles.statusAnimation}
                bg={chatStatusMap.color}
                w={'7px'}
                h={'7px'}
                borderRadius={'50%'}
              />
              <Box ml={2} color={'myGray.600'}>
                {statusBoxData.name}
              </Box>
            </Flex>
          )}

        {isPortalMessage && chat.obj === ChatRoleEnum.Human && (
          <Box mx={0.75} color={'myGray.600'} fontSize={'12px'} fontWeight={'500'}>
            {t('common:core.chat.You')}
          </Box>
        )}

        {showHumanIdentity && <ChatAvatar src={avatar} type={chat.obj} />}
      </Flex>

      {/* User Feedback Content: Admin log show */}
      {isChatLog &&
        showFeedbackContent &&
        chat.obj === ChatRoleEnum.AI &&
        (chat.userGoodFeedback || chat.userBadFeedback) && (
          <Box
            mt={2}
            ml={showAiIdentity ? [0, '44px'] : 0}
            maxW={'250'}
            border={'1px solid'}
            borderColor={'myGray.250'}
            borderRadius={'8px'}
            p={3}
          >
            <Box fontSize={'sm'} color={'myGray.900'} whiteSpace={'pre-wrap'}>
              {chat.userBadFeedback || chat.userGoodFeedback}
            </Box>
            <Flex justifyContent={'flex-end'} mt={2}>
              <Button
                size={'xs'}
                variant={'grayGhost'}
                fontSize={'xs'}
                onClick={() => setShowFeedbackContent(false)}
                color={'primary.600'}
              >
                {t('chat:log.feedback.hide_feedback')}
              </Button>
            </Flex>
          </Box>
        )}

      {/* content */}
      {splitAiResponseResults.map((value, i) => {
        return (
          <Box
            key={i}
            mt={i === 0 ? 0 : 2}
            w={'100%'}
            maxW={isPortalMessage ? '820px' : '100%'}
            ml={isPortalMessage && chat.obj === ChatRoleEnum.Human ? 'auto' : 0}
            pl={isPortalMessage ? 0 : showAiIdentity ? [0, '36px'] : 0}
            pr={isPortalMessage ? 0 : showHumanIdentity ? [0, '36px'] : 0}
            className="chat-box-card"
            display={'flex'}
            justifyContent={chat.obj === ChatRoleEnum.Human ? 'flex-end' : 'flex-start'}
          >
            <Card
              {...MessageCardStyle}
              bg={styleMap.bg}
              borderRadius={styleMap.borderRadius}
              border={chat.obj === ChatRoleEnum.Human ? '1px solid' : 'none'}
              borderColor={'myGray.200'}
              borderLeft={isPortalMessage && chat.obj === ChatRoleEnum.AI ? '1px solid' : undefined}
              borderLeftColor={
                isPortalMessage && chat.obj === ChatRoleEnum.AI ? 'myGray.250' : undefined
              }
              color={'myGray.800'}
              w={chat.obj === ChatRoleEnum.Human ? 'auto' : '100%'}
              maxW={
                isPortalMessage
                  ? chat.obj === ChatRoleEnum.Human
                    ? ['90%', '640px']
                    : '820px'
                  : chat.obj === ChatRoleEnum.Human
                    ? 'min(82%, 760px)'
                    : '960px'
              }
              px={
                isPortalMessage
                  ? chat.obj === ChatRoleEnum.Human
                    ? [4, 5]
                    : 0
                  : chat.obj === ChatRoleEnum.Human
                    ? [3, 4]
                    : 0
              }
              pl={isPortalMessage && chat.obj === ChatRoleEnum.AI ? [4, 5] : undefined}
              py={
                isPortalMessage
                  ? chat.obj === ChatRoleEnum.Human
                    ? 4
                    : '1px'
                  : chat.obj === ChatRoleEnum.Human
                    ? 3
                    : 0
              }
              boxShadow={'none'}
              fontSize={isPortalMessage ? '14px' : undefined}
              lineHeight={1.8}
              textAlign={'left'}
            >
              {chat.obj === ChatRoleEnum.Human && (
                <HumanContentCard chatValue={value as UserChatItemValueItemType[]} />
              )}
              {chat.obj === ChatRoleEnum.AI && (
                <>
                  <AIContentCard
                    chatValue={value as AIChatItemValueItemType[]}
                    dataId={chat.dataId}
                    isLastChild={isLastChild && i === splitAiResponseResults.length - 1}
                    isChatting={isChatting}
                    questionGuides={questionGuides}
                    onOpenCiteModal={onOpenCiteModal}
                  />
                  {i === splitAiResponseResults.length - 1 && (
                    <ResponseTags
                      showTags={!isLastChild || !isChatting}
                      historyItem={chat}
                      onOpenCiteModal={onOpenCiteModal}
                    />
                  )}
                </>
              )}
              {/* Example: Response tags. A set of dialogs only needs to be displayed once*/}
              {i === splitAiResponseResults.length - 1 && (
                <>
                  {/* error message */}
                  {!!chat.errorMsg && (
                    <Box mt={2}>
                      <ChatBoxDivider icon={'common/errorFill'} text={t('chat:error_message')} />
                      <Box fontSize={'xs'} color={'myGray.500'}>
                        {chat.errorMsg}
                      </Box>
                    </Box>
                  )}
                  {children}
                </>
              )}
            </Card>
          </Box>
        );
      })}

      {hasPlanCheck && isLastChild && (
        <Flex mt={3} pl={showAiIdentity ? [0, '44px'] : 0}>
          <Button
            leftIcon={<MyIcon name={'common/check'} w={'16px'} />}
            variant={'primaryOutline'}
            onClick={() => {
              eventBus.emit(EventNameEnum.sendQuestion, {
                text: ConfirmPlanAgentText,
                focus: true
              });
            }}
          >
            {t('chat:confirm_plan')}
          </Button>
        </Flex>
      )}

      {isChatLog && chat.obj === ChatRoleEnum.AI && errorText && (
        <Box
          mt={2}
          ml={showAiIdentity ? [0, '44px'] : 0}
          maxW={'500px'}
          border={'1px solid'}
          borderColor={'myGray.200'}
          borderRadius={'md'}
          p={3}
          bg={'white'}
        >
          <Flex alignItems={'center'} mb={2}>
            <MyIcon name={'common/warn'} w={'16px'} color={'yellow.500'} mr={2} />
            <Box fontSize={'mini'} fontWeight={'medium'} color={'myGray.600'}>
              {t('chat:log.error.error_prefix')} - {errorText.moduleName}
            </Box>
          </Flex>
          <Box
            position={'relative'}
            maxH={errorExpanded ? '600px' : '100px'}
            overflow={errorExpanded ? 'auto' : 'hidden'}
          >
            <Box
              ref={errorContentRef}
              fontSize={'sm'}
              color={'myGray.500'}
              whiteSpace={'pre-wrap'}
              ml={6}
            >
              {errorText.errorText}
            </Box>
            {!errorExpanded && errorContentOverflow && (
              <Box
                position={'absolute'}
                bottom={0}
                left={0}
                right={0}
                h={'50px'}
                bgGradient={'linear(to-b, transparent, white)'}
                pointerEvents={'none'}
              />
            )}
          </Box>
          {errorContentOverflow && (
            <Flex
              justifyContent={'center'}
              bg={'myGray.150'}
              cursor={'pointer'}
              onClick={() => setErrorExpanded(!errorExpanded)}
              alignItems={'center'}
              py={1}
              backdropFilter={'blur(2px)'}
              borderBottomRadius={'sm'}
              fontSize={'10px'}
              fontWeight={'medium'}
              color={'myGray.600'}
              _hover={{
                bg: 'myGray.200'
              }}
              mx={-3}
              mb={-3}
              mt={2}
            >
              {errorExpanded ? t('chat:log.error.collapse') : t('chat:log.error.expand')}
              <MyIcon
                name={errorExpanded ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
                w={'12px'}
                ml={1}
              />
            </Flex>
          )}
        </Box>
      )}
    </Box>
  );
};

export default React.memo(ChatItem);
