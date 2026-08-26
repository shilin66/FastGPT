import React, { useMemo, useRef } from 'react';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import {
  Box,
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Td,
  Tbody,
  Flex,
  Button,
  IconButton,
  Tooltip
} from '@chakra-ui/react';
import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRouter } from 'next/router';
import {
  postCreateDatasetApiDatasetCollection,
  postCreateDatasetExternalFileCollection,
  postCreateDatasetFileCollection,
  postCreateDatasetLinkCollection,
  postCreateDatasetTextCollection,
  postReTrainingDatasetFileCollection
} from '@/web/core/dataset/api/collection';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { DatasetImportContext, type ImportFormType } from '../Context';
import { type ApiCreateDatasetCollectionParams } from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { ImportStepFooter, ImportStepLayout } from '../components/ImportStepLayout';
import { omniTheme } from '@/web/common/brand/theme';

const Upload = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { collectionId = '' } = router.query as {
    collectionId: string;
  };
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const retrainNewCollectionId = useRef('');

  const { importSource, parentId, sources, setSources, processParamsForm } = useContextSelector(
    DatasetImportContext,
    (v) => v
  );

  const { totalFilesCount, waitingFilesCount, allFinished, hasCreatingFiles } = useMemo(() => {
    const totalFilesCount = sources.length;

    const { waitingFilesCount, allFinished, hasCreatingFiles } = sources.reduce(
      (acc, file) => {
        if (file.createStatus === 'waiting') acc.waitingFilesCount++;
        if (file.createStatus === 'creating') acc.hasCreatingFiles = true;
        if (file.createStatus !== 'finish') acc.allFinished = false;
        return acc;
      },
      { waitingFilesCount: 0, allFinished: true, hasCreatingFiles: false }
    );

    return { totalFilesCount, waitingFilesCount, allFinished, hasCreatingFiles };
  }, [sources]);

  const buttonText = useMemo(() => {
    if (waitingFilesCount === totalFilesCount) {
      return t('common:core.dataset.import.Start upload');
    } else if (allFinished) {
      return t('common:core.dataset.import.Upload complete');
    } else {
      return t('common:core.dataset.import.Continue upload');
    }
  }, [waitingFilesCount, totalFilesCount, allFinished, t]);

  const { runAsync: startUpload, loading: isLoading } = useRequest(
    async ({ customPdfParse, webSelector, ...data }: ImportFormType) => {
      if (sources.length === 0) return;
      const filterWaitingSources = sources.filter((item) => item.createStatus === 'waiting');

      if (importSource === ImportDataSourceEnum.apiDataset) {
        setSources((state) =>
          state.map((source) => ({
            ...source,
            createStatus: 'creating'
          }))
        );

        const apiFiles = filterWaitingSources
          .filter((item) => item.apiFile)
          .map((item) => item.apiFile!);

        await postCreateDatasetApiDatasetCollection({
          ...data,
          parentId,
          datasetId: datasetDetail._id,

          customPdfParse,
          apiFiles
        });
      } else {
        // Batch create collection and upload chunks
        for await (const item of filterWaitingSources) {
          setSources((state) =>
            state.map((source) =>
              source.id === item.id
                ? {
                    ...source,
                    createStatus: 'creating'
                  }
                : source
            )
          );

          // create collection
          const commonParams: ApiCreateDatasetCollectionParams & {
            name: string;
          } = {
            ...data,
            parentId,
            datasetId: datasetDetail._id,
            name: item.sourceName,

            customPdfParse
          };

          if (importSource === ImportDataSourceEnum.reTraining) {
            const res = await postReTrainingDatasetFileCollection({
              ...commonParams,
              collectionId
            });
            retrainNewCollectionId.current = res.collectionId;
          } else if (importSource === ImportDataSourceEnum.fileLocal && item.dbFileId) {
            await postCreateDatasetFileCollection({
              ...commonParams,
              fileId: item.dbFileId
            });
          } else if (importSource === ImportDataSourceEnum.fileLink && item.link) {
            await postCreateDatasetLinkCollection({
              ...commonParams,
              link: item.link,
              metadata: {
                webPageSelector: webSelector
              }
            });
          } else if (importSource === ImportDataSourceEnum.fileCustom && item.rawText) {
            // manual collection
            await postCreateDatasetTextCollection({
              ...commonParams,
              text: item.rawText
            });
          } else if (importSource === ImportDataSourceEnum.externalFile && item.externalFileUrl) {
            await postCreateDatasetExternalFileCollection({
              ...commonParams,
              externalFileUrl: item.externalFileUrl,
              externalFileId: item.externalFileId,
              filename: item.sourceName
            });
          }

          setSources((state) =>
            state.map((source) =>
              source.id === item.id
                ? {
                    ...source,
                    createStatus: 'finish'
                  }
                : source
            )
          );
        }
      }
    },
    {
      onSuccess() {
        if (!sources.some((file) => file.errorMsg !== undefined)) {
          toast({
            title:
              importSource === ImportDataSourceEnum.reTraining
                ? t('dataset:retrain_task_submitted')
                : t('common:core.dataset.import.import_success'),
            status: 'success'
          });
        }

        // Close import page
        router.replace({
          query: {
            datasetId: datasetDetail._id,
            parentId
          }
        });
      },
      onError(error) {
        setSources((state) =>
          state.map((source) =>
            source.createStatus === 'creating'
              ? {
                  ...source,
                  createStatus: 'waiting',
                  errorMsg: error.message || t('file:upload_failed')
                }
              : source
          )
        );
      },
      errorToast: t('file:upload_failed')
    }
  );

  return (
    <ImportStepLayout
      variant={'boundedWorkbench'}
      eyebrow={t('dataset:import_confirm')}
      title={t('dataset:import_confirm_title')}
      description={t('dataset:import_confirm_desc')}
      footer={
        <ImportStepFooter>
          <Box mr={'auto'} color={omniTheme.colors.muted} fontSize={'sm'}>
            {t('dataset:import_selected_count', { total: totalFilesCount })}
          </Box>
          <Button
            isLoading={isLoading}
            onClick={processParamsForm.handleSubmit((data) => startUpload(data))}
            bg={omniTheme.colors.saturatedBlue}
            color={'white'}
            _hover={{ bg: omniTheme.colors.saturatedBlueHover }}
          >
            {buttonText}
          </Button>
        </ImportStepFooter>
      }
    >
      <Box w={'100%'}>
        <Box
          overflow={'hidden'}
          border={'1px solid'}
          borderColor={omniTheme.colors.border}
          borderRadius={omniTheme.radii.md}
          bg={omniTheme.colors.surface}
        >
          <Flex
            minH={'52px'}
            alignItems={'center'}
            justifyContent={'space-between'}
            gap={4}
            px={4}
            borderBottom={'1px solid'}
            borderColor={omniTheme.colors.border}
          >
            <Box color={omniTheme.colors.text} fontSize={'sm'} fontWeight={700}>
              {t('dataset:file_list')}
            </Box>
            <Flex
              minW={'26px'}
              h={'24px'}
              alignItems={'center'}
              justifyContent={'center'}
              px={2}
              borderRadius={'full'}
              color={omniTheme.colors.graphite}
              bg={omniTheme.colors.sidebarBg}
              fontSize={'xs'}
              fontWeight={700}
            >
              {totalFilesCount}
            </Flex>
          </Flex>

          <TableContainer>
            <Table variant={'simple'} fontSize={'sm'} draggable={false}>
              <Thead draggable={false}>
                <Tr bg={omniTheme.colors.pageBg}>
                  <Th
                    h={'42px'}
                    py={0}
                    borderBottomColor={omniTheme.colors.border}
                    color={omniTheme.colors.muted}
                    fontSize={'xs'}
                    textTransform={'none'}
                    letterSpacing={0}
                  >
                    {t('common:core.dataset.import.Source name')}
                  </Th>
                  <Th
                    w={'180px'}
                    h={'42px'}
                    py={0}
                    borderBottomColor={omniTheme.colors.border}
                    color={omniTheme.colors.muted}
                    fontSize={'xs'}
                    textTransform={'none'}
                    letterSpacing={0}
                  >
                    {t('common:core.dataset.import.Upload status')}
                  </Th>
                  <Th
                    w={'76px'}
                    h={'42px'}
                    py={0}
                    borderBottomColor={omniTheme.colors.border}
                    color={omniTheme.colors.muted}
                    fontSize={'xs'}
                    textAlign={'right'}
                    textTransform={'none'}
                    letterSpacing={0}
                  >
                    {t('common:Action')}
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {sources.map((item) => {
                  let status = { color: 'gray.400', label: t('common:Waiting') };
                  if (item.createStatus === 'creating') {
                    status = {
                      color: omniTheme.colors.saturatedBlue,
                      label: t('common:Creating')
                    };
                  }
                  if (item.createStatus === 'finish') {
                    status = { color: 'green.500', label: t('common:Finish') };
                  }
                  if (item.errorMsg) {
                    status = { color: 'red.500', label: t('common:Error') };
                  }

                  const statusContent = (
                    <Flex alignItems={'center'} gap={2} color={omniTheme.colors.graphite}>
                      <Box
                        w={'8px'}
                        h={'8px'}
                        flexShrink={0}
                        borderRadius={'full'}
                        bg={status.color}
                      />
                      <Box fontSize={'sm'}>{status.label}</Box>
                      {!!item.errorMsg && (
                        <QuestionOutlineIcon color={'red.500'} w={'13px'} h={'13px'} />
                      )}
                    </Flex>
                  );

                  return (
                    <Tr key={item.id} _hover={{ bg: omniTheme.colors.pageBg }}>
                      <Td h={'64px'} py={2.5} borderBottomColor={omniTheme.colors.border}>
                        <Flex alignItems={'center'} gap={2.5}>
                          <Flex
                            w={'32px'}
                            h={'32px'}
                            flexShrink={0}
                            alignItems={'center'}
                            justifyContent={'center'}
                            borderRadius={omniTheme.radii.sm}
                            bg={omniTheme.colors.saturatedBlueSoft}
                          >
                            <MyIcon
                              name={item.icon as any}
                              w={'16px'}
                              color={omniTheme.colors.saturatedBlue}
                            />
                          </Flex>
                          <Box
                            maxW={'54vw'}
                            overflow={'hidden'}
                            textOverflow={'ellipsis'}
                            whiteSpace={'nowrap'}
                            color={omniTheme.colors.text}
                            fontWeight={600}
                          >
                            {item.sourceName}
                          </Box>
                        </Flex>
                      </Td>
                      <Td h={'64px'} py={2.5} borderBottomColor={omniTheme.colors.border}>
                        {item.errorMsg ? (
                          <Tooltip label={item.errorMsg} fontSize={'md'}>
                            {statusContent}
                          </Tooltip>
                        ) : (
                          statusContent
                        )}
                      </Td>
                      <Td
                        h={'64px'}
                        py={2.5}
                        borderBottomColor={omniTheme.colors.border}
                        textAlign={'right'}
                      >
                        {!hasCreatingFiles && item.createStatus !== 'finish' && (
                          <IconButton
                            variant={'ghost'}
                            size={'sm'}
                            icon={<MyIcon name={'delete'} w={'14px'} />}
                            aria-label={'Delete file'}
                            color={omniTheme.colors.muted}
                            _hover={{ color: 'red.600', bg: 'red.50' }}
                            onClick={() => {
                              setSources((prevFiles) =>
                                prevFiles.filter((file) => file.id !== item.id)
                              );
                            }}
                          />
                        )}
                      </Td>
                    </Tr>
                  );
                })}
                {sources.length === 0 && (
                  <Tr>
                    <Td
                      colSpan={3}
                      py={8}
                      borderBottom={0}
                      color={omniTheme.colors.muted}
                      textAlign={'center'}
                    >
                      {t('dataset:import_selected_count', { total: 0 })}
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </TableContainer>
        </Box>
      </Box>
    </ImportStepLayout>
  );
};

export default Upload;
