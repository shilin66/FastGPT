import React, { useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';
import { useContextSelector } from 'use-context-selector';
import DatasetImportContextProvider, { DatasetImportContext } from './Context';
import { omniTheme } from '@/web/common/brand/theme';

const FileLocal = dynamic(() => import('./diffSource/FileLocal'));
const FileLink = dynamic(() => import('./diffSource/FileLink'));
const FileCustomText = dynamic(() => import('./diffSource/FileCustomText'));
const ExternalFileCollection = dynamic(() => import('./diffSource/ExternalFile'));
const APIDatasetCollection = dynamic(() => import('./diffSource/APIDataset'));
const ReTraining = dynamic(() => import('./diffSource/ReTraining'));
const ImageDataset = dynamic(() => import('./diffSource/ImageDataset'));

const ImportDataset = () => {
  const importSource = useContextSelector(DatasetImportContext, (v) => v.importSource);

  const ImportComponent = useMemo(() => {
    if (importSource === ImportDataSourceEnum.reTraining) return ReTraining;
    if (importSource === ImportDataSourceEnum.fileLocal) return FileLocal;
    if (importSource === ImportDataSourceEnum.fileLink) return FileLink;
    if (importSource === ImportDataSourceEnum.fileCustom) return FileCustomText;
    if (importSource === ImportDataSourceEnum.externalFile) return ExternalFileCollection;
    if (importSource === ImportDataSourceEnum.apiDataset) return APIDatasetCollection;
    if (importSource === ImportDataSourceEnum.imageDataset) return ImageDataset;
    return null;
  }, [importSource]);

  return ImportComponent ? (
    <Box h={'100%'} minH={0} overflow={'hidden'}>
      <ImportComponent />
    </Box>
  ) : null;
};

const Render = () => {
  return (
    <Flex flexDirection={'column'} h={'100%'} minH={0} p={[2, 3]} bg={omniTheme.colors.pageBg}>
      <DatasetImportContextProvider>
        <ImportDataset />
      </DatasetImportContextProvider>
    </Flex>
  );
};

export default React.memo(Render);
