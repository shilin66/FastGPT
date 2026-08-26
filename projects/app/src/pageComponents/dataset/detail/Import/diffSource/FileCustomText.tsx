import React, { useCallback, useEffect } from 'react';

import dynamic from 'next/dynamic';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { Box, Button, Flex, Input, Textarea } from '@chakra-ui/react';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import Loading from '@fastgpt/web/components/common/MyLoading';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import { ImportStepFooter, ImportStepLayout } from '../components/ImportStepLayout';
import { omniTheme } from '@/web/common/brand/theme';

const DataProcess = dynamic(() => import('../commonProgress/DataProcess'), {
  loading: () => <Loading fixed={false} />
});
const Upload = dynamic(() => import('../commonProgress/Upload'));
const PreviewData = dynamic(() => import('../commonProgress/PreviewData'));

const CustomTet = () => {
  const activeStep = useContextSelector(DatasetImportContext, (v) => v.activeStep);
  return (
    <>
      {activeStep === 0 && <CustomTextInput />}
      {activeStep === 1 && <DataProcess />}
      {activeStep === 2 && <PreviewData />}
      {activeStep === 3 && <Upload />}
    </>
  );
};

export default React.memo(CustomTet);

const CustomTextInput = () => {
  const { t } = useTranslation();
  const { sources, goToNext, setSources } = useContextSelector(DatasetImportContext, (v) => v);
  const { register, reset, handleSubmit } = useForm({
    defaultValues: {
      name: '',
      value: ''
    }
  });

  const onSubmit = useCallback(
    (data: { name: string; value: string }) => {
      const fileId = getNanoid(32);

      setSources([
        {
          id: fileId,
          createStatus: 'waiting',
          rawText: data.value,
          sourceName: data.name,
          icon: 'file/fill/txt'
        }
      ]);
      goToNext();
    },
    [goToNext, setSources]
  );

  useEffect(() => {
    const source = sources[0];
    if (source) {
      reset({
        name: source.sourceName,
        value: source.rawText
      });
    }
  }, [reset, sources]);

  return (
    <ImportStepLayout
      eyebrow={t('common:core.dataset.import.Custom text')}
      title={t('dataset:import_add_custom_text_title')}
      description={t('dataset:import_add_custom_text_desc')}
      variant={'boundedWorkbench'}
      footer={
        <ImportStepFooter>
          <Box
            display={['none', 'block']}
            mr={'auto'}
            color={omniTheme.colors.muted}
            fontSize={'sm'}
          >
            {t('common:core.dataset.import.Custom text desc')}
          </Box>
          <Button
            onClick={handleSubmit((data) => onSubmit(data))}
            bg={omniTheme.colors.saturatedBlue}
            color={'white'}
            _hover={{ bg: omniTheme.colors.saturatedBlueHover }}
          >
            {t('common:next_step')}
          </Button>
        </ImportStepFooter>
      }
    >
      <Box
        overflow={'hidden'}
        border={'1px solid'}
        borderColor={omniTheme.colors.border}
        borderRadius={omniTheme.radii.md}
        bg={omniTheme.colors.surface}
        boxShadow={omniTheme.shadows.card}
      >
        <Flex minH={'64px'} alignItems={'center'} gap={3} px={[4, 5]} bg={omniTheme.colors.pageBg}>
          <Flex
            w={'34px'}
            h={'34px'}
            flexShrink={0}
            alignItems={'center'}
            justifyContent={'center'}
            borderRadius={omniTheme.radii.sm}
            bg={omniTheme.colors.graphite}
          >
            <MyIcon name={'file/fill/txt'} w={'17px'} color={'white'} />
          </Flex>
          <Box flex={1} minW={0}>
            <Box color={omniTheme.colors.muted} fontSize={'10px'} fontWeight={700} mb={0.5}>
              {t('dataset:collection_name')}
            </Box>
            <Input
              h={'auto'}
              minH={0}
              p={0}
              variant={'unstyled'}
              color={omniTheme.colors.text}
              fontSize={'md'}
              fontWeight={700}
              {...register('name', {
                required: true
              })}
              placeholder={t('dataset:collection_name')}
            />
          </Box>
        </Flex>

        <Textarea
          w={'100%'}
          minH={['320px', '420px']}
          p={[4, 5]}
          resize={'vertical'}
          border={0}
          borderTop={'1px solid'}
          borderColor={omniTheme.colors.border}
          borderRadius={0}
          placeholder={t('common:core.dataset.collection.Collection raw text')}
          {...register('value', {
            required: true
          })}
          bg={omniTheme.colors.surface}
          lineHeight={1.8}
          _focusVisible={{ boxShadow: `inset 0 0 0 1px ${omniTheme.colors.saturatedBlue}` }}
        />
      </Box>
    </ImportStepLayout>
  );
};
