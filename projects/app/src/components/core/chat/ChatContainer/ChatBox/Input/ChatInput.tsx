import type { FlexProps } from '@chakra-ui/react';
import { Box, Flex, Textarea, useBoolean } from '@chakra-ui/react';
import React, { useRef, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { type ChatBoxInputFormType, type ChatBoxInputType, type SendPromptFnType } from '../type';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import { ChatBoxContext } from '../Provider';
import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import FilePreview from '../../components/FilePreview';
import { useFileUpload } from '../hooks/useFileUpload';
import ComplianceTip from '@/components/common/ComplianceTip/index';
import { useToast } from '@fastgpt/web/hooks/useToast';
import VoiceInput, { type VoiceInputComponentRef } from './VoiceInput';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { postStopV2Chat } from '@/web/core/chat/api';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { isFileNameAcceptedByUploadFileType } from '@fastgpt/global/core/app/constants';

const InputGuideBox = dynamic(() => import('./InputGuideBox'));

const ChatInput = ({
  lastInteractive,
  onSendMessage,
  onStop,
  TextareaDom,
  resetInputVal,
  chatForm
}: {
  lastInteractive?: WorkflowInteractiveResponseType;
  onSendMessage: SendPromptFnType;
  onStop: () => void;
  TextareaDom: React.MutableRefObject<HTMLTextAreaElement | null>;
  resetInputVal: (val: ChatBoxInputType) => void;
  chatForm: UseFormReturn<ChatBoxInputFormType>;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isPc } = useSystem();
  const VoiceInputRef = useRef<VoiceInputComponentRef>(null);

  const { setValue, watch, control } = chatForm;
  const inputValue = watch('input');

  const [focusing, { on: onFocus, off: offFocus }] = useBoolean();

  // Check voice input state
  const [mobilePreSpeak, setMobilePreSpeak] = useState(false);

  const InputLeftComponent = useContextSelector(ChatBoxContext, (v) => v.InputLeftComponent);

  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const isChatting = useContextSelector(ChatBoxContext, (v) => v.isChatting);
  const sourceType = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.sourceType);
  const whisperConfig = useContextSelector(ChatBoxContext, (v) => v.whisperConfig);
  const chatInputGuide = useContextSelector(ChatBoxContext, (v) => v.chatInputGuide);
  const fileSelectConfig = useContextSelector(ChatBoxContext, (v) => v.fileSelectConfig);
  const dialogTips = useContextSelector(ChatBoxContext, (v) => v.dialogTips);
  const autoTTSResponse = useContextSelector(ChatBoxContext, (v) => v.autoTTSResponse);

  const fileCtrl = useFieldArray({
    control,
    name: 'files'
  });
  const {
    File,
    fileType,
    onOpenSelectFile,
    fileList,
    onSelectFile,
    uploadFiles,
    selectFileIcon,
    selectFileLabel,
    showSelectFile,
    showSelectImg,
    showSelectVideo,
    showSelectAudio,
    showSelectCustomFileExtension,
    removeFiles,
    replaceFiles,
    hasFileUploading
  } = useFileUpload({
    fileSelectConfig,
    fileCtrl,
    outLinkAuthData,
    appId,
    chatId
  });
  const havInput = !!inputValue || fileList.length > 0;
  const canSendMessage = havInput && !hasFileUploading;
  const canUploadFile =
    showSelectFile ||
    showSelectImg ||
    showSelectVideo ||
    showSelectAudio ||
    showSelectCustomFileExtension;

  // Upload files
  useRequest(uploadFiles, {
    manual: false,
    errorToast: t('common:upload_file_error'),
    refreshDeps: [fileList, outLinkAuthData, chatId]
  });

  /* on send */
  const handleSend = useCallback(
    async (val?: string) => {
      if (!canSendMessage) return;
      const textareaValue = val || TextareaDom.current?.value || '';

      onSendMessage({
        text: textareaValue.trim(),
        files: fileList,
        interactive: lastInteractive
      });
      replaceFiles([]);
    },
    [TextareaDom, lastInteractive, canSendMessage, fileList, onSendMessage, replaceFiles]
  );
  const { runAsync: handleStop, loading: isStopping } = useRequest(async () => {
    try {
      // Skill debug runs are request-scoped and stop when onStop closes their stream.
      if (isChatting && sourceType !== 'skillEdit') {
        await postStopV2Chat({
          appId,
          chatId,
          outLinkAuthData
        }).catch();
      }
    } finally {
      onStop();
    }
  });

  const RenderTextarea = useMemo(
    () => (
      <Flex flex={'1 1 auto'} minW={0} mt={fileList.length > 0 ? 1 : 0}>
        {/* Textarea */}
        <Flex w={'100%'}>
          {/* Prompt Container */}
          <Textarea
            ref={TextareaDom}
            py={1.5}
            px={0}
            border={'none'}
            _focusVisible={{
              border: 'none'
            }}
            placeholder={
              dialogTips ||
              (isPc ? t('common:core.chat.Type a message') : t('chat:input_placeholder_phone'))
            }
            resize={'none'}
            rows={1}
            height={'36px'}
            lineHeight={6}
            maxHeight={[24, 32]}
            minH={'36px'}
            mb={0}
            maxLength={-1}
            overflowY={'hidden'}
            overflowX={'hidden'}
            whiteSpace={'pre-wrap'}
            wordBreak={'break-word'}
            boxShadow={'none !important'}
            color={'myGray.900'}
            fontWeight={400}
            fontSize={'sm'}
            letterSpacing={0}
            w={'100%'}
            _placeholder={{
              color: 'myGray.500',
              fontSize: 'sm'
            }}
            value={inputValue}
            onChange={(e) => {
              const textarea = e.target;
              textarea.style.height = '36px';
              const maxHeight = 128;
              const newHeight = Math.max(36, Math.min(textarea.scrollHeight, maxHeight));
              textarea.style.height = `${newHeight}px`;

              // Only show scrollbar when content exceeds max height
              if (textarea.scrollHeight > maxHeight) {
                textarea.style.overflowY = 'auto';
              } else {
                textarea.style.overflowY = 'hidden';
              }

              setValue('input', textarea.value);
            }}
            onKeyDown={(e) => {
              // enter send.(pc or iframe && enter and unPress shift)
              const isEnter = e.key === 'Enter';
              if (isEnter && TextareaDom.current && (e.ctrlKey || e.altKey)) {
                // Add a new line
                const index = TextareaDom.current.selectionStart;
                const val = TextareaDom.current.value;
                TextareaDom.current.value = `${val.slice(0, index)}\n${val.slice(index)}`;
                TextareaDom.current.selectionStart = index + 1;
                TextareaDom.current.selectionEnd = index + 1;

                TextareaDom.current.style.height = '36px';
                TextareaDom.current.style.height = `${Math.max(
                  36,
                  Math.min(TextareaDom.current.scrollHeight, 128)
                )}px`;

                return;
              }

              if (e.key === 'a' && e.ctrlKey) {
                e.currentTarget.select();
              }

              if ((isPc || window !== parent) && e.keyCode === 13 && !e.shiftKey) {
                handleSend();
                e.preventDefault();
              }
            }}
            onPaste={(e) => {
              const clipboardData = e.clipboardData;
              if (clipboardData && canUploadFile) {
                const items = clipboardData.items;
                const files = Array.from(items)
                  .map((item) => (item.kind === 'file' ? item.getAsFile() : undefined))
                  .filter((file) => {
                    return file && isFileNameAcceptedByUploadFileType(file.name, fileType);
                  }) as File[];
                onSelectFile({ files });

                if (files.length > 0) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }
            }}
            onFocus={onFocus}
            onBlur={offFocus}
          />
        </Flex>
      </Flex>
    ),
    [
      fileList.length,
      TextareaDom,
      dialogTips,
      isPc,
      t,
      inputValue,
      fileType,
      onFocus,
      offFocus,
      setValue,
      handleSend,
      canUploadFile,
      onSelectFile
    ]
  );

  const RenderButtonGroup = useMemo(() => {
    const iconSize = {
      w: isPc ? '20px' : '16px',
      h: isPc ? '20px' : '16px'
    };

    return (
      <Flex
        alignItems={'center'}
        justifyContent={'flex-end'}
        flexShrink={0}
        mt={0}
        h={'36px'}
        gap={[0, 1]}
      >
        {/* 左侧自定义按钮组 */}
        <Flex alignItems={'center'} gap={1}>
          {InputLeftComponent}
        </Flex>

        {/* 右侧原有按钮组 */}
        <Flex alignItems={'center'} gap={[0, 1]}>
          {/* Attachment and Voice Group */}
          <Flex alignItems={'center'} h={'36px'}>
            {/* file selector button */}
            {canUploadFile && (
              <Flex
                alignItems={'center'}
                justifyContent={'center'}
                w={'36px'}
                h={'36px'}
                p={2}
                borderRadius={'6px'}
                cursor={'pointer'}
                _hover={{ bg: 'myGray.100' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSelectFile();
                }}
              >
                <MyTooltip label={selectFileLabel}>
                  {selectFileIcon && (
                    <MyIcon name={selectFileIcon} {...iconSize} color={'myGray.600'} />
                  )}
                </MyTooltip>
                <File onSelect={(files) => onSelectFile({ files })} />
              </Flex>
            )}

            {/* Voice input button */}
            {whisperConfig?.open && !inputValue && (
              <Flex
                alignItems={'center'}
                justifyContent={'center'}
                w={'36px'}
                h={'36px'}
                p={2}
                borderRadius={'6px'}
                cursor={'pointer'}
                _hover={{ bg: 'myGray.100' }}
                onClick={(e) => {
                  e.stopPropagation();
                  VoiceInputRef.current?.onSpeak?.();
                }}
              >
                <MyTooltip label={t('common:core.chat.Record')}>
                  <MyIcon name={'core/chat/recordFill'} {...iconSize} color={'myGray.600'} />
                </MyTooltip>
              </Flex>
            )}
          </Flex>

          {/* Divider Container */}
          {((whisperConfig?.open && !inputValue) || canUploadFile) && (
            <Flex alignItems={'center'} justifyContent={'center'} w={2} h={5} mr={2}>
              <Box w={'1px'} h={5} bg={'myGray.200'} />
            </Flex>
          )}

          {/* Send Button Container */}
          <Flex alignItems={'center'} w={'36px'} h={'36px'} borderRadius={'6px'}>
            <MyBox
              isLoading={isStopping}
              display={'flex'}
              alignItems={'center'}
              justifyContent={'center'}
              w={'36px'}
              h={'36px'}
              p={2}
              bg={isChatting ? 'primary.50' : canSendMessage ? 'primary.600' : 'myGray.200'}
              borderRadius={'6px'}
              cursor={isChatting ? 'pointer' : canSendMessage ? 'pointer' : 'not-allowed'}
              transition={'background 0.15s ease'}
              _hover={
                isChatting
                  ? { bg: 'primary.100' }
                  : canSendMessage
                    ? { bg: 'primary.700' }
                    : undefined
              }
              onClick={(e) => {
                e.stopPropagation();
                if (isChatting) {
                  return handleStop();
                }
                return handleSend();
              }}
            >
              {isChatting ? (
                <MyIcon {...iconSize} name={'stop'} color={'primary.600'} />
              ) : (
                <MyTooltip label={t('common:core.chat.Send Message')}>
                  <MyIcon name={'core/chat/sendFill'} {...iconSize} color={'white'} />
                </MyTooltip>
              )}
            </MyBox>
          </Flex>
        </Flex>
      </Flex>
    );
  }, [
    isPc,
    InputLeftComponent,
    canUploadFile,
    selectFileLabel,
    selectFileIcon,
    File,
    whisperConfig?.open,
    inputValue,
    t,
    isStopping,
    isChatting,
    canSendMessage,
    onOpenSelectFile,
    onSelectFile,
    handleSend,
    handleStop
  ]);

  const activeStyles: FlexProps = {
    boxShadow: '0 0 0 3px var(--chakra-colors-primary-50)',
    border: '1px solid',
    borderColor: 'primary.400'
  };

  return (
    <Box
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();

        if (!canUploadFile) return;
        const files = Array.from(e.dataTransfer.files);

        const droppedFiles = files.filter((file) =>
          isFileNameAcceptedByUploadFileType(file.name, fileType)
        );
        if (droppedFiles.length > 0) {
          onSelectFile({ files: droppedFiles });
        }

        const invalidFileName = files
          .filter((file) => !isFileNameAcceptedByUploadFileType(file.name, fileType))
          .map((file) => file.name)
          .join(', ');
        if (invalidFileName) {
          toast({
            status: 'warning',
            title: t('chat:unsupported_file_type'),
            description: invalidFileName
          });
        }
      }}
    >
      {/* Real Chat Input */}
      <Flex
        direction={'column'}
        minH={mobilePreSpeak ? '48px' : '56px'}
        px={[2.5, 3]}
        py={fileList.length > 0 ? 2 : mobilePreSpeak ? 1 : 2}
        position={'relative'}
        borderRadius={'12px'}
        bg={'white'}
        overflow={'visible'}
        {...(focusing
          ? activeStyles
          : {
              _hover: { borderColor: 'myGray.400' },
              border: '1px solid',
              borderColor: 'myGray.250',
              boxShadow: '0 2px 8px rgba(19, 51, 107, 0.04)'
            })}
        transition={'border-color 0.15s ease, box-shadow 0.15s ease'}
        onClick={() => TextareaDom?.current?.focus()}
      >
        <Box>
          {/* Chat input guide box */}
          {chatInputGuide.open && (
            <InputGuideBox
              appId={appId}
              text={inputValue}
              onSelect={(e) => {
                setValue('input', e);
              }}
              onSend={(e) => {
                handleSend(e);
              }}
            />
          )}
          {/* file preview */}
          {(!mobilePreSpeak || isPc || inputValue) && (
            <Box>
              <FilePreview fileList={fileList} removeFiles={removeFiles} />
            </Box>
          )}

          {/* voice input and loading container */}
          {!inputValue && (
            <VoiceInput
              ref={VoiceInputRef}
              handleSend={(text) => {
                onSendMessage({
                  text: text.trim(),
                  files: fileList,
                  autoTTSResponse
                });
                replaceFiles([]);
              }}
              resetInputVal={(val) => {
                setMobilePreSpeak(false);
                resetInputVal({
                  text: val,
                  files: fileList
                });
              }}
              mobilePreSpeak={mobilePreSpeak}
              setMobilePreSpeak={setMobilePreSpeak}
            />
          )}
        </Box>

        <Flex align={'flex-end'} gap={2}>
          {RenderTextarea}
          {!mobilePreSpeak && RenderButtonGroup}
        </Flex>
      </Flex>
      <ComplianceTip type={'chat'} />
    </Box>
  );
};

export default React.memo(ChatInput);
