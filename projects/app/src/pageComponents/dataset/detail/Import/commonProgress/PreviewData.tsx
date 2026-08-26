import React, { useState } from 'react';
import { Box, Button, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { getPreviewChunks } from '@/web/core/dataset/api/file';
import { type ImportSourceItemType } from '@/web/core/dataset/type';
import { getPreviewSourceReadType } from '../utils';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import MyBox from '@fastgpt/web/components/common/MyBox';
import Markdown from '@/components/Markdown';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getLLMMaxChunkSize } from '@fastgpt/global/core/dataset/training/utils';
import { ImportStepFooter, ImportStepLayout } from '../components/ImportStepLayout';
import { omniTheme } from '@/web/common/brand/theme';
import {
  previewChunkDefaultLimit,
  previewChunkMaxLimit
} from '@fastgpt/global/openapi/core/dataset/file/api';

const PreviewData = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const goToNext = useContextSelector(DatasetImportContext, (v) => v.goToNext);

  const datasetId = useContextSelector(DatasetPageContext, (v) => v.datasetId);
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);

  const sources = useContextSelector(DatasetImportContext, (v) => v.sources);
  const importSource = useContextSelector(DatasetImportContext, (v) => v.importSource);
  const processParamsForm = useContextSelector(DatasetImportContext, (v) => v.processParamsForm);

  const [previewFile, setPreviewFile] = useState<ImportSourceItemType>();
  const [previewLimit, setPreviewLimit] = useState(previewChunkDefaultLimit);

  const { data = { chunks: [], total: 0 }, loading: isLoading } = useRequest(
    async () => {
      if (!previewFile) return { chunks: [], total: 0 };

      const chunkData = processParamsForm.getValues();

      if (importSource === ImportDataSourceEnum.fileCustom) {
        const chunkSplitter = processParamsForm.getValues('chunkSplitter');
        const { chunks } = splitText2Chunks({
          text: previewFile.rawText || '',
          chunkSize: chunkData.chunkSize,
          maxSize: getLLMMaxChunkSize(datasetDetail.agentModel),
          overlapRatio: 0.2,
          customReg: chunkSplitter ? [chunkSplitter] : []
        });
        return {
          chunks: chunks.slice(0, previewLimit).map((chunk) => ({ q: chunk, a: '' })),
          total: chunks.length
        };
      }

      return getPreviewChunks({
        datasetId,
        type: getPreviewSourceReadType(previewFile),
        sourceId:
          previewFile.dbFileId ||
          previewFile.link ||
          previewFile.externalFileUrl ||
          previewFile.apiFileId ||
          '',
        externalFileId: previewFile.externalFileId,

        ...chunkData,
        selector: processParamsForm.getValues('webSelector'),
        customPdfParse: processParamsForm.getValues('customPdfParse'),
        overlapRatio: 0.2,
        previewLimit
      });
    },
    {
      refreshDeps: [previewFile, previewLimit],
      manual: false,
      onSuccess(result) {
        if (!previewFile) return;
        if (!result || result.total === 0) {
          toast({
            title: t('dataset:preview_chunk_empty'),
            status: 'error'
          });
        }
      }
    }
  );

  const canLoadMore =
    !!previewFile && data.chunks.length < data.total && previewLimit < previewChunkMaxLimit;

  const selectPreviewFile = (source: ImportSourceItemType) => {
    if (source.apiFile?.type === 'folder') {
      toast({
        status: 'warning',
        title: t('dataset:preview_chunk_folder_warning')
      });
      return;
    }

    setPreviewFile(source);
    setPreviewLimit(previewChunkDefaultLimit);
  };

  return (
    <ImportStepLayout
      eyebrow={t('dataset:import_data_preview')}
      title={t('dataset:import_preview_title')}
      description={t('dataset:import_preview_desc')}
      bodyProps={{ p: 0, overflow: 'hidden' }}
      contentProps={{ h: '100%', minH: 0 }}
      footer={
        <ImportStepFooter>
          <Box mr={'auto'} color={omniTheme.colors.muted} fontSize={'sm'}>
            {previewFile
              ? t('dataset:preview_chunk_intro', {
                  total: data.total,
                  shown: data.chunks.length
                })
              : t('dataset:import_selected_count', { total: sources.length })}
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
      <Flex h={'100%'} minH={0} bg={omniTheme.colors.pageBg}>
        <Flex
          w={['220px', '252px']}
          minW={['220px', '252px']}
          minH={0}
          flexDirection={'column'}
          borderRight={'1px solid'}
          borderColor={omniTheme.colors.border}
          bg={omniTheme.colors.surface}
        >
          <Flex
            minH={'54px'}
            alignItems={'center'}
            justifyContent={'space-between'}
            px={4}
            borderBottom={'1px solid'}
            borderColor={omniTheme.colors.border}
          >
            <Box color={omniTheme.colors.text} fontSize={'sm'} fontWeight={700}>
              {t('dataset:file_list')}
            </Box>
            <Flex
              minW={'24px'}
              h={'22px'}
              alignItems={'center'}
              justifyContent={'center'}
              borderRadius={'full'}
              color={omniTheme.colors.graphite}
              bg={omniTheme.colors.sidebarBg}
              fontSize={'10px'}
              fontWeight={700}
            >
              {sources.length}
            </Flex>
          </Flex>
          <Box flex={1} minH={0} overflowY={'auto'} py={2}>
            {sources.map((source) => {
              const isActive = previewFile?.id === source.id;

              return (
                <Flex
                  key={source.id}
                  minH={'54px'}
                  alignItems={'center'}
                  gap={2.5}
                  px={4}
                  py={2}
                  borderLeft={'3px solid'}
                  borderColor={isActive ? omniTheme.colors.saturatedBlue : 'transparent'}
                  bg={isActive ? omniTheme.colors.saturatedBlueSoft : 'transparent'}
                  cursor={'pointer'}
                  _hover={{
                    bg: isActive ? omniTheme.colors.saturatedBlueSoft : omniTheme.colors.pageBg
                  }}
                  onClick={() => selectPreviewFile(source)}
                >
                  <Flex
                    w={'28px'}
                    h={'28px'}
                    flexShrink={0}
                    alignItems={'center'}
                    justifyContent={'center'}
                    borderRadius={omniTheme.radii.sm}
                    bg={isActive ? omniTheme.colors.surface : omniTheme.colors.sidebarBg}
                  >
                    <MyIcon
                      name={source.icon as any}
                      w={'16px'}
                      color={isActive ? omniTheme.colors.saturatedBlue : omniTheme.colors.graphite}
                    />
                  </Flex>
                  <Box minW={0}>
                    <Box
                      overflow={'hidden'}
                      textOverflow={'ellipsis'}
                      whiteSpace={'nowrap'}
                      color={omniTheme.colors.text}
                      fontSize={'sm'}
                      fontWeight={600}
                    >
                      {source.sourceName}
                    </Box>
                    <Box mt={0.5} color={omniTheme.colors.muted} fontSize={'10px'}>
                      {isActive
                        ? t('dataset:import_preview_current')
                        : t('dataset:import_preview_open')}
                    </Box>
                  </Box>
                </Flex>
              );
            })}
          </Box>
        </Flex>

        <Flex minW={0} minH={0} flex={1} flexDirection={'column'} bg={omniTheme.colors.pageBg}>
          <Flex
            minH={'54px'}
            alignItems={'center'}
            justifyContent={'space-between'}
            gap={3}
            px={5}
            borderBottom={'1px solid'}
            borderColor={omniTheme.colors.border}
            bg={omniTheme.colors.surface}
          >
            <Box minW={0}>
              <Box
                overflow={'hidden'}
                textOverflow={'ellipsis'}
                whiteSpace={'nowrap'}
                color={omniTheme.colors.text}
                fontSize={'sm'}
                fontWeight={700}
              >
                {previewFile?.sourceName || t('dataset:preview_chunk')}
              </Box>
            </Box>
            {!!previewFile && (
              <Box
                flexShrink={0}
                px={2}
                py={1}
                borderRadius={omniTheme.radii.sm}
                color={omniTheme.colors.saturatedBlue}
                bg={omniTheme.colors.saturatedBlueSoft}
                fontSize={'10px'}
                fontWeight={700}
              >
                {t('dataset:preview_chunk_intro', {
                  total: data.total,
                  shown: data.chunks.length
                })}
              </Box>
            )}
          </Flex>
          <MyBox isLoading={isLoading} flex={1} minH={0}>
            <Box h={'100%'} overflowY={'auto'} px={[4, 6]} py={[4, 6]}>
              {previewFile ? (
                <Box
                  w={'100%'}
                  maxW={'960px'}
                  mx={'auto'}
                  border={'1px solid'}
                  borderColor={omniTheme.colors.border}
                  borderRadius={omniTheme.radii.md}
                  bg={omniTheme.colors.surface}
                  boxShadow={omniTheme.shadows.card}
                  overflow={'hidden'}
                >
                  {data.chunks.map((item, index) => (
                    <Flex
                      key={index}
                      gap={[3, 5]}
                      px={[4, 7]}
                      py={[4, 5]}
                      borderBottom={index < data.chunks.length - 1 ? '1px solid' : 'none'}
                      borderColor={omniTheme.colors.border}
                    >
                      <Box
                        minW={'32px'}
                        pt={0.5}
                        flexShrink={0}
                        color={omniTheme.colors.saturatedBlue}
                        fontSize={'10px'}
                        fontWeight={800}
                      >
                        {String(index + 1).padStart(2, '0')}
                      </Box>
                      <Box
                        minW={0}
                        maxW={'82ch'}
                        color={omniTheme.colors.text}
                        fontSize={'sm'}
                        lineHeight={1.75}
                        overflowX={'auto'}
                        overflowWrap={'anywhere'}
                      >
                        <Markdown source={item.q} />
                        {!!item.a && (
                          <Box
                            mt={4}
                            pt={4}
                            borderTop={'1px dashed'}
                            borderColor={omniTheme.colors.border}
                          >
                            <Markdown source={item.a} />
                          </Box>
                        )}
                      </Box>
                    </Flex>
                  ))}
                  {canLoadMore && (
                    <Flex
                      alignItems={'center'}
                      justifyContent={'center'}
                      px={5}
                      py={4}
                      borderTop={'1px solid'}
                      borderColor={omniTheme.colors.border}
                      bg={omniTheme.colors.pageBg}
                    >
                      <Button
                        size={'sm'}
                        variant={'whiteBase'}
                        rightIcon={<MyIcon name={'core/chat/chevronDown'} w={'14px'} />}
                        onClick={() =>
                          setPreviewLimit((limit) =>
                            Math.min(limit + previewChunkDefaultLimit, previewChunkMaxLimit)
                          )
                        }
                      >
                        {t('common:More')} · {data.chunks.length}/{data.total}
                      </Button>
                    </Flex>
                  )}
                </Box>
              ) : (
                <Flex
                  w={'100%'}
                  maxW={'640px'}
                  mx={'auto'}
                  mt={[4, 8]}
                  alignItems={'flex-start'}
                  gap={4}
                  px={[2, 4]}
                  py={4}
                >
                  <Flex
                    w={'42px'}
                    h={'42px'}
                    flexShrink={0}
                    alignItems={'center'}
                    justifyContent={'center'}
                    borderRadius={omniTheme.radii.sm}
                    color={omniTheme.colors.saturatedBlue}
                    bg={omniTheme.colors.saturatedBlueSoft}
                  >
                    <MyIcon name={'core/dataset/fileCollection'} w={'21px'} />
                  </Flex>
                  <Box minW={0} pt={0.5}>
                    <Box color={omniTheme.colors.text} fontSize={'sm'} fontWeight={700}>
                      {t('dataset:preview_chunk_not_selected')}
                    </Box>
                    <Box
                      maxW={'420px'}
                      mt={1}
                      color={omniTheme.colors.muted}
                      fontSize={'xs'}
                      lineHeight={1.6}
                    >
                      {t('dataset:import_preview_desc')}
                    </Box>
                  </Box>
                </Flex>
              )}
            </Box>
          </MyBox>
        </Flex>
      </Flex>
    </ImportStepLayout>
  );
};

export default React.memo(PreviewData);
