import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import {
  Box,
  Button,
  Flex,
  ModalBody,
  useDisclosure,
  HStack,
  ModalFooter,
  type BoxProps,
  Checkbox,
  VStack
} from '@chakra-ui/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type.d';
import MyModal from '@fastgpt/web/components/common/MyModal';
import ChatFunctionTip from './Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useMount } from 'ahooks';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { defaultAppSelectFileConfig } from '@fastgpt/global/core/app/constants';
import { usePdfParsers } from '@/web/common/system/hooks/usePdfParsers';
import MySelect from '@fastgpt/web/components/common/MySelect';
import InputSlider from '@fastgpt/web/components/common/MySlider/InputSlider';
import { FileTypeSelectorPanel } from '@fastgpt/web/components/core/app/FileTypeSelector';
import MyDivider from '@fastgpt/web/components/common/MyDivider';

const FileSelect = ({
  forbidVision = false,
  value = defaultAppSelectFileConfig,
  onChange,
  ...labelStyle
}: Omit<BoxProps, 'onChange'> & {
  forbidVision?: boolean;
  value?: AppFileSelectConfigType;
  onChange: (e: AppFileSelectConfigType) => void;
}) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const maxSelectFiles = Math.min(feConfigs?.uploadFileMaxAmount ?? 20, 30);
  const { data: pdfParsers = [] } = usePdfParsers();

  // 构建选择器列表
  const pdfParserOptions = useMemo(
    () => [
      {
        label: t('app:system_default_parser'),
        value: '',
        description: t('app:system_default_parser_desc')
      },
      ...pdfParsers.map((parser) => ({
        label: parser.label,
        value: parser.value,
        description: parser.desc
      }))
    ],
    [pdfParsers, t]
  );

  const [localValue, setLocalValue] = useState(value);

  const canUploadFile =
    value.canSelectFile ||
    value.canSelectImg ||
    value.canSelectVideo ||
    value.canSelectAudio ||
    value.canSelectCustomFileExtension;
  const formLabel = canUploadFile
    ? t('common:core.app.whisper.Open')
    : t('common:core.app.whisper.Close');

  // Close select img switch when vision is forbidden
  useMount(() => {
    if (forbidVision) {
      onChange({
        ...value,
        canSelectImg: false
      });
    }
  });

  return (
    <Flex alignItems={'center'}>
      <MyIcon name={'core/app/simpleMode/file'} mr={2} w={'20px'} />
      <FormLabel color={'myGray.600'} {...labelStyle}>
        {t('app:file_upload')}
      </FormLabel>
      <ChatFunctionTip type={'file'} />
      <Box flex={1} />
      <MyTooltip label={t('app:config_file_upload')}>
        <Button
          variant={'transparentBase'}
          iconSpacing={1}
          size={'sm'}
          mr={'-5px'}
          color={'myGray.600'}
          onClick={() => {
            setLocalValue(value);
            onOpen();
          }}
        >
          {formLabel}
        </Button>
      </MyTooltip>
      <MyModal
        iconSrc="core/app/simpleMode/file"
        title={t('app:file_upload')}
        isOpen={isOpen}
        onClose={onClose}
        w={'500px'}
      >
        <ModalBody>
          <Box>
            <HStack spacing={1}>
              <FormLabel>{t('app:upload_file_max_amount')}</FormLabel>
              <QuestionTip label={t('app:upload_file_max_amount_tip')} />
            </HStack>

            <Box mt={2} alignItems={'center'} gap={5}>
              <InputSlider
                min={1}
                max={maxSelectFiles}
                step={1}
                value={localValue.maxFiles ?? 5}
                onChange={(e) => {
                  setLocalValue((state) => ({
                    ...state,
                    maxFiles: e
                  }));
                }}
              />
            </Box>
          </Box>

          <VStack spacing={2} alignItems={'flex-start'} mt={6}>
            <FormLabel>{t('app:upload_file_extension_types')}</FormLabel>

            <VStack
              w="full"
              spacing={3}
              alignItems={'flex-start'}
              border="1px solid"
              borderColor="myGray.200"
              borderRadius="md"
              p={4}
            >
              <FileTypeSelectorPanel value={localValue} onChange={setLocalValue} />
            </VStack>
          </VStack>

          {localValue.canSelectFile && feConfigs.showCustomPdfParse && (
            <>
              <Box mt={2}>
                <HStack spacing={1} mb={2}>
                  <FormLabel>{t('app:pdf_enhance_parse')}</FormLabel>
                  <QuestionTip label={t('app:pdf_enhance_parse_tips')} />
                </HStack>
                <MySelect
                  value={localValue.customPdfParse || ''}
                  list={pdfParserOptions}
                  onChange={(e) => {
                    setLocalValue((state) => ({
                      ...state,
                      customPdfParse: e
                    }));
                  }}
                  // onChange={(val) => {
                  //   const newValue = {
                  //     ...value,
                  //     customPdfParse: val
                  //   };
                  //   onChange(newValue);
                  //   // 同时更新本地状态，确保状态同步
                  //   setLocalValue(newValue);
                  // }}
                  size={'sm'}
                  h={'32px'}
                />
                {localValue.customPdfParse && feConfigs?.show_pay && (
                  <MyTag
                    type={'borderSolid'}
                    borderColor={'myGray.200'}
                    bg={'myGray.100'}
                    color={'primary.600'}
                    py={1.5}
                    borderRadius={'md'}
                    px={3}
                    whiteSpace={'wrap'}
                    mt={2}
                  >
                    {t('app:pdf_enhance_parse_price', {
                      price:
                        pdfParsers.find((p) => p.value === localValue.customPdfParse)?.price || 0
                    })}
                  </MyTag>
                )}
              </Box>
              <MyDivider my={2} />
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            onClick={() => {
              onChange(localValue);
              onClose();
            }}
            px={8}
          >
            {t('common:Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
    </Flex>
  );
};

export default FileSelect;
