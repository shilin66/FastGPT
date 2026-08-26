import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { type ImportSourceItemType } from '@/web/core/dataset/type';
import { Box, Button } from '@chakra-ui/react';
import FileSelector, { type SelectFileItemType } from '../components/FileSelector';
import { useTranslation } from 'next-i18next';

import dynamic from 'next/dynamic';
import { RenderUploadFiles } from '../components/RenderFiles';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { getUploadDatasetFilePresignedUrl } from '@/web/core/dataset/api/file';
import { putFileToS3 } from '@fastgpt/web/common/file/utils';
import { ImportStepFooter, ImportStepLayout } from '../components/ImportStepLayout';
import { omniTheme } from '@/web/common/brand/theme';

const DataProcess = dynamic(() => import('../commonProgress/DataProcess'));
const PreviewData = dynamic(() => import('../commonProgress/PreviewData'));
const Upload = dynamic(() => import('../commonProgress/Upload'));

const fileType = '.txt, .docx, .csv, .xls, .xlsx, .pdf, .md, .html, .pptx';

const FileLocal = () => {
  const activeStep = useContextSelector(DatasetImportContext, (v) => v.activeStep);

  return (
    <>
      {activeStep === 0 && <SelectFile />}
      {activeStep === 1 && <DataProcess />}
      {activeStep === 2 && <PreviewData />}
      {activeStep === 3 && <Upload />}
    </>
  );
};

export default React.memo(FileLocal);

const SelectFile = React.memo(function SelectFile() {
  const { t } = useTranslation();

  const { goToNext, sources, setSources } = useContextSelector(DatasetImportContext, (v) => v);
  const datasetId = useContextSelector(DatasetPageContext, (v) => v.datasetId);

  const [selectFiles, setSelectFiles] = useState<ImportSourceItemType[]>(
    sources.map((source) => ({
      isUploading: false,
      ...source
    }))
  );
  const successFiles = useMemo(() => selectFiles.filter((item) => !item.errorMsg), [selectFiles]);

  useEffect(() => {
    setSources(successFiles);
  }, [setSources, successFiles]);

  const onclickNext = useCallback(() => {
    // filter uploaded files
    setSelectFiles((state) => state.filter((item) => item.dbFileId));
    goToNext();
  }, [goToNext]);

  const { runAsync: onSelectFiles, loading: uploading } = useRequest(
    async (files: SelectFileItemType[]) => {
      {
        await Promise.all(
          files.map(async ({ fileId, file }) => {
            try {
              const { url, key, headers, maxSize } = await getUploadDatasetFilePresignedUrl({
                filename: file.name,
                datasetId
              });

              // Upload File to S3
              await putFileToS3({
                url,
                file,
                headers,
                maxSize,
                onUploadProgress: (e) => {
                  if (!e.total) return;
                  const percent = Math.round((e.loaded / e.total) * 100);
                  setSelectFiles((state) =>
                    state.map((item) =>
                      item.id === fileId
                        ? {
                            ...item,
                            uploadedFileRate: item.uploadedFileRate
                              ? Math.max(percent, item.uploadedFileRate)
                              : percent
                          }
                        : item
                    )
                  );
                },
                t,
                onSuccess: () => {
                  setSelectFiles((state) =>
                    state.map((item) =>
                      item.id === fileId
                        ? {
                            ...item,
                            dbFileId: key,
                            isUploading: false,
                            uploadedFileRate: 100
                          }
                        : item
                    )
                  );
                }
              });
            } catch (error) {
              setSelectFiles((state) =>
                state.map((item) =>
                  item.id === fileId
                    ? {
                        ...item,
                        isUploading: false,
                        errorMsg: getErrText(error)
                      }
                    : item
                )
              );
            }
          })
        );
      }
    },
    {
      onBefore([files]) {
        setSelectFiles((state) => {
          return [
            ...state,
            ...files.map<ImportSourceItemType>((selectFile) => {
              const { fileId, file } = selectFile;

              return {
                id: fileId,
                createStatus: 'waiting',
                file,
                sourceName: file.name,
                sourceSize: formatFileSize(file.size),
                icon: getFileIcon(file.name),
                isUploading: true,
                uploadedFileRate: 0
              };
            })
          ];
        });
      }
    }
  );

  return (
    <ImportStepLayout
      eyebrow={t('dataset:import_select_file')}
      title={t('dataset:import_add_file_title')}
      description={t('dataset:import_add_file_desc')}
      variant={'boundedWorkbench'}
      footer={
        <ImportStepFooter>
          <Box mr={'auto'} color={omniTheme.colors.muted} fontSize={'sm'}>
            {t('dataset:import_selected_count', { total: selectFiles.length })}
          </Box>
          <Button
            isDisabled={successFiles.length === 0 || uploading}
            onClick={onclickNext}
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
      >
        <FileSelector
          fileType={fileType}
          selectFiles={selectFiles}
          onSelectFiles={onSelectFiles}
          variant={'workbench'}
          border={'none'}
          borderBottom={selectFiles.length > 0 ? '1px solid' : 'none'}
          borderBottomColor={omniTheme.colors.border}
          borderRadius={0}
          boxShadow={'none'}
        />

        <RenderUploadFiles files={selectFiles} setFiles={setSelectFiles} variant={'integrated'} />
      </Box>
    </ImportStepLayout>
  );
});
