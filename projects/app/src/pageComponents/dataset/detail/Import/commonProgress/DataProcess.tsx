import React from 'react';
import { Box, Button, HStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import CollectionChunkForm from '../../Form/CollectionChunkForm';
import { usePdfParsers } from '@/web/common/system/hooks/usePdfParsers';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { ImportStepFooter, ImportStepLayout } from '../components/ImportStepLayout';
import ImportWorkbenchSection from '../components/ImportWorkbenchSection';
import { omniTheme } from '@/web/common/brand/theme';

function DataProcess() {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const { goToNext, processParamsForm } = useContextSelector(DatasetImportContext, (v) => v);
  const { register, watch, setValue } = processParamsForm;
  const customPdfParseValue = watch('customPdfParse');
  const { data: pdfParsers = [] } = usePdfParsers();

  // 构建选择器列表
  const pdfParserOptions = [
    {
      label: t('dataset:system_default_parser'),
      value: '',
      description: t('dataset:system_default_parser_desc')
    },
    ...pdfParsers.map((parser) => ({
      label: parser.label,
      value: parser.value,
      description: parser.desc
    }))
  ];

  const showFileParseSetting = feConfigs?.showCustomPdfParse;

  return (
    <ImportStepLayout
      variant={'boundedWorkbench'}
      eyebrow={t('dataset:import_param_setting')}
      title={t('dataset:import_process_title')}
      description={t('dataset:import_process_desc')}
      footer={
        <ImportStepFooter>
          <Box mr={'auto'} color={omniTheme.colors.muted} fontSize={'sm'}>
            {t('dataset:import_params_apply_all')}
          </Box>
          <Button
            onClick={goToNext}
            bg={omniTheme.colors.saturatedBlue}
            color={'white'}
            _hover={{ bg: omniTheme.colors.saturatedBlueHover }}
          >
            {t('common:next_step')}
          </Button>
        </ImportStepFooter>
      }
    >
      <Box>
        {showFileParseSetting && feConfigs.showCustomPdfParse && (
          <ImportWorkbenchSection
            isFirst
            title={t('dataset:import_file_parse_setting')}
            description={t('dataset:pdf_enhance_parse_tips')}
          >
            <Box maxW={'720px'}>
              <HStack spacing={1} mb={2}>
                <FormLabel>{t('dataset:pdf_enhance_parse')}</FormLabel>
                <QuestionTip label={t('dataset:pdf_enhance_parse_tips')} />
              </HStack>
              <MySelect
                value={customPdfParseValue || ''}
                list={pdfParserOptions}
                onChange={(val) => setValue('customPdfParse', val)}
                size={'sm'}
                h={'36px'}
                menuListMatchWidth
              />
              {customPdfParseValue && feConfigs?.show_pay && (
                <MyTag
                  type={'borderSolid'}
                  borderColor={omniTheme.colors.border}
                  bg={omniTheme.colors.pageBg}
                  color={omniTheme.colors.saturatedBlue}
                  py={1.5}
                  borderRadius={omniTheme.radii.sm}
                  px={3}
                  whiteSpace={'wrap'}
                  mt={2}
                >
                  {t('dataset:pdf_enhance_parse_price', {
                    price: pdfParsers.find((p) => p.value === customPdfParseValue)?.price || 0
                  })}
                </MyTag>
              )}
            </Box>
          </ImportWorkbenchSection>
        )}

        <Box mt={showFileParseSetting ? 6 : 0}>
          {/* @ts-ignore */}
          <CollectionChunkForm form={processParamsForm} variant={'importWorkbench'} />
        </Box>
      </Box>
    </ImportStepLayout>
  );
}

export default React.memo(DataProcess);
