import { useRouter } from 'next/router';
import { type SetStateAction, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { createContext, useContextSelector } from 'use-context-selector';
import {
  ChunkTriggerConfigTypeEnum,
  DatasetCollectionDataProcessModeEnum,
  ImportDataSourceEnum,
  ParagraphChunkAIModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { useMyStep } from '@fastgpt/web/hooks/useStep';
import { Box, Button, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { TabEnum } from '../NavBar';
import { ChunkSettingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type UseFormReturn, useForm } from 'react-hook-form';
import { type ImportSourceItemType } from '@/web/core/dataset/type';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { DataChunkSplitModeEnum } from '@fastgpt/global/core/dataset/constants';
import { chunkAutoChunkSize, getAutoIndexSize } from '@fastgpt/global/core/dataset/training/utils';
import { type CollectionChunkFormType } from '../Form/CollectionChunkForm';
import { useLocalStorageState } from 'ahooks';
import { omniTheme } from '@/web/common/brand/theme';

export type ImportFormType = {
  customPdfParse: string;
  webSelector: string;
} & CollectionChunkFormType;

type DatasetImportContextType = {
  importSource: ImportDataSourceEnum;
  parentId: string | undefined;
  activeStep: number;
  goToNext: () => void;

  processParamsForm: UseFormReturn<ImportFormType, any>;
  sources: ImportSourceItemType[];
  setSources: React.Dispatch<React.SetStateAction<ImportSourceItemType[]>>;
};

export const defaultFormData: ImportFormType = {
  customPdfParse: '',

  trainingType: DatasetCollectionDataProcessModeEnum.chunk,

  chunkTriggerType: ChunkTriggerConfigTypeEnum.minSize,
  chunkTriggerMinSize: chunkAutoChunkSize,

  dataEnhanceCollectionName: false,

  imageIndex: false,
  autoIndexes: false,
  indexPrefixTitle: false,

  chunkSettingMode: ChunkSettingModeEnum.auto,
  chunkSplitMode: DataChunkSplitModeEnum.paragraph,
  paragraphChunkAIMode: ParagraphChunkAIModeEnum.forbid,
  paragraphChunkDeep: 5,
  paragraphChunkMinSize: 100,

  chunkSize: chunkAutoChunkSize,
  chunkSplitter: '',
  indexSize: getAutoIndexSize(),

  qaPrompt: Prompt_AgentQA.description,
  webSelector: ''
};

export const DatasetImportContext = createContext<DatasetImportContextType>({
  importSource: ImportDataSourceEnum.fileLocal,
  goToNext: function (): void {
    throw new Error('Function not implemented.');
  },
  activeStep: 0,
  parentId: undefined,

  sources: [],
  setSources: function (value: SetStateAction<ImportSourceItemType[]>): void {
    throw new Error('Function not implemented.');
  },
  //@ts-ignore
  processParamsForm: undefined
});

const DatasetImportContextProvider = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { source = ImportDataSourceEnum.fileLocal, parentId } = (router.query || {}) as {
    source: ImportDataSourceEnum;
    parentId?: string;
  };

  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);

  // step
  const modeSteps: Record<ImportDataSourceEnum, { title: string }[]> = {
    [ImportDataSourceEnum.reTraining]: [
      { title: t('dataset:core.dataset.import.Adjust parameters') },
      {
        title: t('dataset:import_data_preview')
      },
      { title: t('dataset:import_confirm') }
    ],
    [ImportDataSourceEnum.fileLocal]: [
      {
        title: t('dataset:import_select_file')
      },
      {
        title: t('dataset:import_param_setting')
      },
      {
        title: t('dataset:import_data_preview')
      },
      {
        title: t('dataset:import_confirm')
      }
    ],
    [ImportDataSourceEnum.fileLink]: [
      {
        title: t('dataset:import_select_link')
      },
      {
        title: t('dataset:import_param_setting')
      },
      {
        title: t('dataset:import_data_preview')
      },
      {
        title: t('dataset:import_confirm')
      }
    ],
    [ImportDataSourceEnum.fileCustom]: [
      {
        title: t('common:core.dataset.import.Custom text')
      },
      {
        title: t('dataset:import_param_setting')
      },
      {
        title: t('dataset:import_data_preview')
      },
      {
        title: t('dataset:import_confirm')
      }
    ],
    [ImportDataSourceEnum.externalFile]: [
      {
        title: t('dataset:import_select_file')
      },
      {
        title: t('dataset:import_param_setting')
      },
      {
        title: t('dataset:import_data_preview')
      },
      {
        title: t('dataset:import_confirm')
      }
    ],
    [ImportDataSourceEnum.apiDataset]: [
      {
        title: t('dataset:import_select_file')
      },
      {
        title: t('dataset:import_param_setting')
      },
      {
        title: t('dataset:import_data_preview')
      },
      {
        title: t('dataset:import_confirm')
      }
    ],
    [ImportDataSourceEnum.imageDataset]: [
      {
        title: t('dataset:import_select_file')
      },
      {
        title: t('dataset:import_param_setting')
      },
      {
        title: t('dataset:import_data_preview')
      },
      {
        title: t('dataset:import_confirm')
      }
    ]
  };
  const steps = modeSteps[source];
  const { activeStep, goToNext, goToPrevious } = useMyStep({
    defaultStep: 0,
    steps
  });

  const vectorModel = datasetDetail.vectorModel;

  const [localCustomPdfParse, setLocalCustomPdfParse] = useLocalStorageState(
    'dataset_customPdfParse',
    {
      defaultValue: 'default'
    }
  );
  const processParamsForm = useForm<ImportFormType>({
    defaultValues: (() => ({
      ...defaultFormData,
      customPdfParse: localCustomPdfParse,
      indexSize: getAutoIndexSize(vectorModel)
    }))()
  });
  const customPdfParse = processParamsForm.watch('customPdfParse');
  useEffect(() => {
    setLocalCustomPdfParse(customPdfParse);
  }, [customPdfParse, setLocalCustomPdfParse]);

  const [sources, setSources] = useState<ImportSourceItemType[]>([]);

  const contextValue = {
    importSource: source,
    parentId,
    activeStep,
    goToNext,

    processParamsForm,
    sources,
    setSources
  };

  const exitImport = () =>
    router.replace({
      query: {
        ...router.query,
        currentTab: TabEnum.collectionCard
      }
    });

  return (
    <DatasetImportContext.Provider value={contextValue}>
      <Flex
        h={'100%'}
        minH={0}
        flexDirection={'column'}
        overflow={'hidden'}
        border={'1px solid'}
        borderColor={omniTheme.colors.border}
        borderRadius={omniTheme.radii.md}
        bg={omniTheme.colors.surface}
      >
        <Flex
          flexShrink={0}
          minH={'58px'}
          alignItems={'center'}
          gap={3}
          px={[3, 5]}
          borderBottom={'1px solid'}
          borderColor={omniTheme.colors.border}
          bg={omniTheme.colors.pageBg}
        >
          <Button
            variant={'whiteBase'}
            size={'sm'}
            leftIcon={<MyIcon name={'common/backFill'} w={'14px'} />}
            onClick={activeStep === 0 ? exitImport : goToPrevious}
          >
            {activeStep === 0 ? t('common:Exit') : t('common:last_step')}
          </Button>
          <Box minW={0}>
            <Box
              color={omniTheme.colors.text}
              fontSize={'sm'}
              fontWeight={700}
              overflow={'hidden'}
              textOverflow={'ellipsis'}
              whiteSpace={'nowrap'}
            >
              {t('dataset:import_workbench_title')}
            </Box>
            <Box
              color={omniTheme.colors.muted}
              fontSize={'10px'}
              overflow={'hidden'}
              textOverflow={'ellipsis'}
              whiteSpace={'nowrap'}
            >
              {datasetDetail.name}
            </Box>
          </Box>
          <Box flex={1} />
          {source !== ImportDataSourceEnum.imageDataset && (
            <Box color={omniTheme.colors.muted} fontSize={'xs'}>
              {activeStep + 1} / {steps.length}
            </Box>
          )}
        </Flex>

        {source !== ImportDataSourceEnum.imageDataset && (
          <Flex
            flexShrink={0}
            minH={'56px'}
            overflowX={'auto'}
            borderBottom={'1px solid'}
            borderColor={omniTheme.colors.border}
            bg={omniTheme.colors.surface}
          >
            {steps.map((step, index) => {
              const isActive = activeStep === index;
              const isComplete = activeStep > index;

              return (
                <Flex
                  key={`${step.title}-${index}`}
                  position={'relative'}
                  flex={'1 0 150px'}
                  minW={0}
                  alignItems={'center'}
                  gap={2.5}
                  px={[3, 5]}
                  color={isActive ? omniTheme.colors.text : omniTheme.colors.muted}
                  bg={isActive ? omniTheme.colors.pageBg : 'transparent'}
                  _after={{
                    content: '""',
                    position: 'absolute',
                    left: 3,
                    right: 3,
                    bottom: 0,
                    h: '3px',
                    borderRadius: '3px 3px 0 0',
                    bg: isActive ? omniTheme.colors.saturatedBlue : 'transparent'
                  }}
                >
                  <Flex
                    w={'26px'}
                    h={'26px'}
                    flexShrink={0}
                    alignItems={'center'}
                    justifyContent={'center'}
                    border={'1px solid'}
                    borderColor={
                      isActive || isComplete
                        ? omniTheme.colors.saturatedBlue
                        : omniTheme.colors.border
                    }
                    borderRadius={omniTheme.radii.sm}
                    color={
                      isComplete
                        ? 'white'
                        : isActive
                          ? omniTheme.colors.saturatedBlue
                          : omniTheme.colors.muted
                    }
                    bg={
                      isComplete
                        ? omniTheme.colors.saturatedBlue
                        : isActive
                          ? omniTheme.colors.saturatedBlueSoft
                          : omniTheme.colors.surface
                    }
                    fontSize={'10px'}
                    fontWeight={800}
                  >
                    {isComplete ? <MyIcon name={'common/check'} w={'12px'} /> : index + 1}
                  </Flex>
                  <Box
                    minW={0}
                    overflow={'hidden'}
                    textOverflow={'ellipsis'}
                    whiteSpace={'nowrap'}
                    fontSize={'sm'}
                    fontWeight={isActive ? 700 : 600}
                  >
                    {step.title}
                  </Box>
                </Flex>
              );
            })}
          </Flex>
        )}

        <Box flex={1} minH={0} overflow={'hidden'}>
          {children}
        </Box>
      </Flex>
    </DatasetImportContext.Provider>
  );
};

export default DatasetImportContextProvider;
