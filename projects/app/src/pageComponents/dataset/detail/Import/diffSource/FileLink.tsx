import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { Box, Button, Flex, Input, Link, Textarea } from '@chakra-ui/react';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { LinkCollectionIcon } from '@fastgpt/global/core/dataset/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getDocPath } from '@/web/common/system/doc';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import { ImportStepFooter, ImportStepLayout } from '../components/ImportStepLayout';
import { omniTheme } from '@/web/common/brand/theme';

const DataProcess = dynamic(() => import('../commonProgress/DataProcess'), {
  loading: () => <Loading fixed={false} />
});
const Upload = dynamic(() => import('../commonProgress/Upload'));
const PreviewData = dynamic(() => import('../commonProgress/PreviewData'));

const LinkCollection = () => {
  const activeStep = useContextSelector(DatasetImportContext, (v) => v.activeStep);

  return (
    <>
      {activeStep === 0 && <CustomLinkImport />}
      {activeStep === 1 && <DataProcess />}
      {activeStep === 2 && <PreviewData />}
      {activeStep === 3 && <Upload />}
    </>
  );
};

export default React.memo(LinkCollection);

const CustomLinkImport = () => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { goToNext, sources, setSources, processParamsForm } = useContextSelector(
    DatasetImportContext,
    (v) => v
  );
  const { register, reset, handleSubmit, watch } = useForm({
    defaultValues: {
      link: ''
    }
  });

  const link = watch('link');
  const linkList = link.split('\n').filter((item) => item);

  useEffect(() => {
    reset({
      link: sources
        .map((item) => item.link)
        .filter((item) => item)
        .join('\n')
    });
  }, [reset, sources]);

  const onNext = handleSubmit((data) => {
    const newLinkList = data.link.split('\n').filter((item) => item);

    setSources(
      newLinkList.map((link) => ({
        id: getNanoid(32),
        createStatus: 'waiting',
        link,
        sourceName: link,
        icon: LinkCollectionIcon
      }))
    );

    goToNext();
  });

  return (
    <ImportStepLayout
      eyebrow={t('dataset:import_select_link')}
      title={t('dataset:import_add_link_title')}
      description={t('dataset:import_add_link_desc')}
      variant={'boundedWorkbench'}
      footer={
        <ImportStepFooter>
          <Box mr={'auto'} color={omniTheme.colors.muted} fontSize={'sm'}>
            {t('dataset:import_selected_count', { total: linkList.length })}
          </Box>
          <Button
            onClick={onNext}
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
        <Box
          overflow={'hidden'}
          border={'1px solid'}
          borderColor={omniTheme.colors.border}
          borderRadius={omniTheme.radii.md}
          bg={omniTheme.colors.surface}
          boxShadow={omniTheme.shadows.card}
        >
          <Flex
            minH={'44px'}
            alignItems={'center'}
            justifyContent={'space-between'}
            gap={4}
            px={4}
            borderBottom={'1px solid'}
            borderColor={omniTheme.colors.border}
            bg={omniTheme.colors.pageBg}
          >
            <Box color={omniTheme.colors.text} fontSize={'sm'} fontWeight={700}>
              {t('common:core.dataset.import.Link name')}
            </Box>
            <Box color={omniTheme.colors.muted} fontSize={'xs'}>
              {t('dataset:import_link_input_tip')}
            </Box>
          </Flex>
          <Textarea
            w={'100%'}
            minH={['200px', '236px']}
            p={4}
            resize={'vertical'}
            placeholder={t('common:core.dataset.import.Link name placeholder')}
            bg={omniTheme.colors.surface}
            border={0}
            borderRadius={0}
            overflowX={'auto'}
            whiteSpace={'nowrap'}
            _focusVisible={{ boxShadow: `inset 0 0 0 1px ${omniTheme.colors.saturatedBlue}` }}
            {...register('link', {
              required: true
            })}
          />

          <Flex
            minH={'64px'}
            flexDirection={['column', 'row']}
            alignItems={['stretch', 'center']}
            gap={[2, 4]}
            px={4}
            py={3}
            borderTop={'1px solid'}
            borderColor={omniTheme.colors.border}
            bg={omniTheme.colors.pageBg}
          >
            <Flex minW={['auto', '150px']} alignItems={'center'} justifyContent={'space-between'}>
              <Box color={omniTheme.colors.text} fontSize={'sm'} fontWeight={700}>
                {t('common:core.dataset.website.Selector')}
              </Box>
              {feConfigs?.docUrl && (
                <Link
                  display={['block', 'none']}
                  color={omniTheme.colors.saturatedBlue}
                  fontSize={'xs'}
                  href={getDocPath(
                    '/docs/introduction/guide/knowledge_base/websync/#选择器如何使用'
                  )}
                  target="_blank"
                >
                  {t('common:core.dataset.website.Selector Course')}
                </Link>
              )}
            </Flex>
            <Input
              flex={1}
              {...processParamsForm.register('webSelector')}
              placeholder={'body .content #document'}
              bg={omniTheme.colors.surface}
              borderColor={omniTheme.colors.border}
              _focusVisible={{ borderColor: omniTheme.colors.saturatedBlue }}
            />
            {feConfigs?.docUrl && (
              <Link
                display={['none', 'block']}
                flexShrink={0}
                color={omniTheme.colors.saturatedBlue}
                fontSize={'xs'}
                href={getDocPath('/docs/introduction/guide/knowledge_base/websync/#选择器如何使用')}
                target="_blank"
              >
                {t('common:core.dataset.website.Selector Course')}
              </Link>
            )}
          </Flex>
        </Box>

        {linkList.length > 0 && (
          <Box
            mt={5}
            overflow={'hidden'}
            border={'1px solid'}
            borderColor={omniTheme.colors.border}
            borderRadius={omniTheme.radii.md}
          >
            <Flex
              minH={'40px'}
              alignItems={'center'}
              justifyContent={'space-between'}
              px={3}
              color={omniTheme.colors.muted}
              bg={omniTheme.colors.pageBg}
              fontSize={'xs'}
              fontWeight={700}
            >
              <Box>{t('dataset:import_link_list')}</Box>
              <Box>{linkList.length}</Box>
            </Flex>
            {linkList.map((item, i) => (
              <Flex
                key={`${item}-${i}`}
                minH={'48px'}
                alignItems={'center'}
                gap={3}
                px={3}
                borderTop={'1px solid'}
                borderColor={omniTheme.colors.border}
                _hover={{ bg: omniTheme.colors.pageBg }}
              >
                <Flex
                  w={'28px'}
                  h={'28px'}
                  flexShrink={0}
                  alignItems={'center'}
                  justifyContent={'center'}
                  borderRadius={omniTheme.radii.sm}
                  bg={omniTheme.colors.saturatedBlueSoft}
                >
                  <MyIcon
                    name={LinkCollectionIcon}
                    w={'15px'}
                    color={omniTheme.colors.saturatedBlue}
                  />
                </Flex>
                <Box
                  flex={1}
                  minW={0}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  whiteSpace={'nowrap'}
                  fontSize={'sm'}
                >
                  {item}
                </Box>
                <MyIcon
                  name={'common/closeLight'}
                  w={'14px'}
                  color={omniTheme.colors.muted}
                  cursor={'pointer'}
                  _hover={{ color: 'red.600' }}
                  onClick={() => {
                    const newLinkList = linkList.filter((link, index) => index !== i);
                    reset({
                      link: newLinkList.join('\n')
                    });
                  }}
                />
              </Flex>
            ))}
          </Box>
        )}
      </Box>
    </ImportStepLayout>
  );
};
