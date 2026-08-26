import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { type UseFormReturn } from 'react-hook-form';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Flex,
  Input,
  Button,
  ModalBody,
  ModalFooter,
  Textarea,
  useDisclosure,
  Checkbox,
  HStack,
  Grid
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import { ParagraphChunkAIModeEnum } from '@fastgpt/global/core/dataset/constants';
import { ChunkTriggerConfigTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  DataChunkSplitModeEnum,
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionDataProcessModeMap
} from '@fastgpt/global/core/dataset/constants';
import { ChunkSettingModeEnum } from '@fastgpt/global/core/dataset/constants';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import { useContextSelector } from 'use-context-selector';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import MySelect from '@fastgpt/web/components/common/MySelect';
import {
  chunkAutoChunkSize,
  getIndexSizeSelectList,
  getLLMDefaultChunkSize,
  getLLMMaxChunkSize,
  getMaxChunkSize,
  getMaxIndexSize,
  minChunkSize
} from '@fastgpt/global/core/dataset/training/utils';
import RadioGroup from '@fastgpt/web/components/common/Radio/RadioGroup';
import ImportWorkbenchSection from '../Import/components/ImportWorkbenchSection';

const PromptTextarea = ({
  defaultValue = '',
  onChange,
  onClose
}: {
  defaultValue?: string;
  onChange: (e: string) => void;
  onClose: () => void;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { t } = useTranslation();

  return (
    <MyModal
      isOpen
      title={t('common:core.dataset.import.Custom prompt')}
      iconSrc="modal/edit"
      w={'600px'}
      onClose={onClose}
    >
      <ModalBody whiteSpace={'pre-wrap'} fontSize={'sm'} px={[3, 6]} pt={[3, 6]}>
        <Textarea ref={ref} rows={8} fontSize={'sm'} defaultValue={defaultValue} />
        <Box>{Prompt_AgentQA.fixedText}</Box>
      </ModalBody>
      <ModalFooter>
        <Button
          onClick={() => {
            const val = ref.current?.value || Prompt_AgentQA.description;
            onChange(val);
            onClose();
          }}
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export type CollectionChunkFormType = {
  trainingType: DatasetCollectionDataProcessModeEnum;

  // Chunk trigger
  chunkTriggerType: ChunkTriggerConfigTypeEnum;
  chunkTriggerMinSize: number; // maxSize from agent model, not store

  // Data enhance
  dataEnhanceCollectionName: boolean; // Auto add collection name to data

  // Index enhance
  imageIndex: boolean;
  autoIndexes: boolean;
  indexPrefixTitle: boolean;

  // Chunk setting
  chunkSettingMode: ChunkSettingModeEnum; // 系统参数/自定义参数
  chunkSplitMode: DataChunkSplitModeEnum;
  // Paragraph split
  paragraphChunkAIMode: ParagraphChunkAIModeEnum;
  paragraphChunkDeep: number; // Paragraph deep
  paragraphChunkMinSize: number; // Paragraph min size, if too small, it will merge
  // Size split
  chunkSize: number;
  // Char split
  chunkSplitter: string;
  indexSize: number;

  qaPrompt?: string;
};

const CollectionChunkForm = ({
  form,
  variant = 'default'
}: {
  form: UseFormReturn<CollectionChunkFormType>;
  variant?: 'default' | 'importWorkbench';
}) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);

  const vectorModel = datasetDetail.vectorModel;
  const agentModel = datasetDetail.agentModel;

  const { setValue, register, watch, getValues } = form;

  const trainingType = watch('trainingType');
  const chunkTriggerType = watch('chunkTriggerType');
  const chunkSettingMode = watch('chunkSettingMode');
  const chunkSplitMode = watch('chunkSplitMode');
  const autoIndexes = watch('autoIndexes');
  const indexSize = watch('indexSize');
  const imageIndex = watch('imageIndex');
  const indexPrefixTitle = watch('indexPrefixTitle');
  const paragraphChunkAIMode = watch('paragraphChunkAIMode');

  const trainingModeList = useMemo(() => {
    const list = {
      [DatasetCollectionDataProcessModeEnum.chunk]:
        DatasetCollectionDataProcessModeMap[DatasetCollectionDataProcessModeEnum.chunk],
      [DatasetCollectionDataProcessModeEnum.qa]:
        DatasetCollectionDataProcessModeMap[DatasetCollectionDataProcessModeEnum.qa]
    };

    return Object.entries(list).map(([key, value]) => ({
      title: t(value.label as any),
      value: key as DatasetCollectionDataProcessModeEnum,
      tooltip: t(value.tooltip as any)
    }));
  }, [t]);

  // Chunk trigger
  const chunkTriggerSelectList = [
    { label: t('dataset:chunk_trigger_min_size'), value: ChunkTriggerConfigTypeEnum.minSize },
    { label: t('dataset:chunk_trigger_max_size'), value: ChunkTriggerConfigTypeEnum.maxSize },
    { label: t('dataset:chunk_trigger_force_chunk'), value: ChunkTriggerConfigTypeEnum.forceChunk }
  ];

  // Form max or min value
  const {
    maxChunkSize,
    minChunkSize: minChunkSizeValue,
    maxIndexSize
  } = useMemo(() => {
    if (trainingType === DatasetCollectionDataProcessModeEnum.qa) {
      return {
        maxChunkSize: getLLMMaxChunkSize(agentModel),
        minChunkSize: 1000,
        maxIndexSize: 1000
      };
    } else if (autoIndexes) {
      return {
        maxChunkSize: getMaxChunkSize(agentModel),
        minChunkSize: minChunkSize,
        maxIndexSize: getMaxIndexSize(vectorModel)
      };
    } else {
      return {
        maxChunkSize: getMaxChunkSize(agentModel),
        minChunkSize: minChunkSize,
        maxIndexSize: getMaxIndexSize(vectorModel)
      };
    }
  }, [trainingType, autoIndexes, agentModel, vectorModel]);

  // Custom split list
  const customSplitList = [
    { label: t('dataset:split_sign_null'), value: '' },
    { label: t('dataset:split_sign_break'), value: '\\n' },
    { label: t('dataset:split_sign_break2'), value: '\\n\\n' },
    { label: t('dataset:split_sign_period'), value: '.|。' },
    { label: t('dataset:split_sign_exclamatiob'), value: '!|！' },
    { label: t('dataset:split_sign_question'), value: '?|？' },
    { label: t('dataset:split_sign_semicolon'), value: ';|；' },
    { label: '=====', value: '=====' },
    { label: t('dataset:split_sign_custom'), value: 'Other' }
  ];
  const [customListSelectValue, setCustomListSelectValue] = useState(
    customSplitList.some((item) => item.value === getValues('chunkSplitter'))
      ? getValues('chunkSplitter')
      : 'Other'
  );

  // Index size
  const indexSizeSeletorList = useMemo(() => getIndexSizeSelectList(maxIndexSize), [maxIndexSize]);

  // QA
  const qaPrompt = watch('qaPrompt');
  const {
    isOpen: isOpenCustomPrompt,
    onOpen: onOpenCustomPrompt,
    onClose: onCloseCustomPrompt
  } = useDisclosure();

  const showQAPromptInput = trainingType === DatasetCollectionDataProcessModeEnum.qa;
  const isImportWorkbench = variant === 'importWorkbench';

  // Adapt 4.9.0- auto training
  useEffect(() => {
    if (trainingType === DatasetCollectionDataProcessModeEnum.auto) {
      setValue('autoIndexes', true);
      setValue('trainingType', DatasetCollectionDataProcessModeEnum.chunk);
    }
  }, [trainingType, setValue]);

  return (
    <>
      {isImportWorkbench ? (
        <ImportWorkbenchSection
          isFirst
          title={t('dataset:training_mode')}
          description={t('dataset:import_training_mode_desc')}
        >
          <LeftRadio<DatasetCollectionDataProcessModeEnum>
            list={trainingModeList}
            px={3}
            py={2.5}
            gridGap={0}
            borderBottom={'1px solid'}
            borderColor={'borderColor.base'}
            value={trainingType}
            onChange={(e) => {
              setValue('trainingType', e);
              if (e === DatasetCollectionDataProcessModeEnum.qa) {
                setValue('chunkSize', getLLMDefaultChunkSize(agentModel));
              } else {
                setValue('chunkSize', chunkAutoChunkSize);
              }
            }}
            variant={'underline'}
            gridTemplateColumns={'repeat(2, minmax(0, 1fr))'}
          />
        </ImportWorkbenchSection>
      ) : (
        <Box>
          <Box fontSize={'sm'} mb={2} color={'myGray.600'}>
            {t('dataset:training_mode')}
          </Box>
          <LeftRadio<DatasetCollectionDataProcessModeEnum>
            list={trainingModeList}
            px={3}
            py={2.5}
            value={trainingType}
            onChange={(e) => {
              setValue('trainingType', e);
              if (e === DatasetCollectionDataProcessModeEnum.qa) {
                setValue('chunkSize', getLLMDefaultChunkSize(agentModel));
              } else {
                setValue('chunkSize', chunkAutoChunkSize);
              }
            }}
            defaultBg="white"
            activeBg={'white'}
            variant={'card'}
            gridTemplateColumns={'repeat(2, 1fr)'}
          />
        </Box>
      )}

      {trainingType === DatasetCollectionDataProcessModeEnum.chunk && (
        <>
          {isImportWorkbench ? (
            <ImportWorkbenchSection
              title={t('dataset:chunk_trigger')}
              description={t('dataset:import_chunk_trigger_desc')}
            >
              <HStack alignItems={'stretch'} spacing={3}>
                <Box flex={'1 0 0'} minW={0} h={'36px'}>
                  <MySelect
                    borderRadius={'md'}
                    list={chunkTriggerSelectList}
                    value={chunkTriggerType}
                    onChange={(e) => {
                      setValue('chunkTriggerType', e);
                    }}
                  />
                </Box>
                {chunkTriggerType === ChunkTriggerConfigTypeEnum.minSize && (
                  <Box flex={'0 1 220px'} minW={'140px'}>
                    <MyNumberInput
                      h={'36px'}
                      inputFieldProps={{ bg: 'white' }}
                      min={100}
                      max={100000}
                      register={register}
                      name={'chunkTriggerMinSize'}
                      step={100}
                    />
                  </Box>
                )}
              </HStack>
            </ImportWorkbenchSection>
          ) : (
            <Box mt={6}>
              <HStack fontSize={'sm'} mb={2} color={'myGray.600'} spacing={1}>
                <Box>{t('dataset:chunk_trigger')}</Box>
                <QuestionTip label={t('dataset:chunk_trigger_tips')} />
              </HStack>
              <HStack>
                <Box flex={'1 0 0'} h={'34px'}>
                  <MySelect
                    borderRadius={'md'}
                    list={chunkTriggerSelectList}
                    value={chunkTriggerType}
                    onChange={(e) => {
                      setValue('chunkTriggerType', e);
                    }}
                  />
                </Box>
                {chunkTriggerType === ChunkTriggerConfigTypeEnum.minSize && (
                  <Box flex={'1 0 0'}>
                    <MyNumberInput
                      h={'34px'}
                      inputFieldProps={{ bg: 'white' }}
                      min={100}
                      max={100000}
                      register={register}
                      name={'chunkTriggerMinSize'}
                      step={100}
                    />
                  </Box>
                )}
              </HStack>
            </Box>
          )}
        </>
      )}

      <Grid
        mt={isImportWorkbench ? 0 : 6}
        gridTemplateColumns={
          isImportWorkbench ? ['minmax(0, 1fr)', '220px minmax(0, 1fr)'] : 'minmax(0, 1fr)'
        }
        gap={isImportWorkbench ? [3, 8] : 0}
        pt={isImportWorkbench ? 6 : 0}
        pb={isImportWorkbench ? 6 : 0}
        borderBottom={isImportWorkbench ? '1px solid' : 'none'}
        borderColor={'borderColor.base'}
      >
        <Box minW={0} mb={isImportWorkbench ? 0 : 2}>
          <Box fontSize={'sm'} fontWeight={isImportWorkbench ? 700 : 400} color={'myGray.800'}>
            {t('dataset:enhanced_indexes')}
          </Box>
          {isImportWorkbench && (
            <Box mt={1} color={'myGray.600'} fontSize={'xs'} lineHeight={1.6}>
              {t('dataset:import_enhanced_indexes_desc')}
            </Box>
          )}
        </Box>
        <Grid
          gridTemplateColumns={
            isImportWorkbench ? ['minmax(0, 1fr)', 'repeat(2, minmax(0, 1fr))'] : '1fr 1fr'
          }
          rowGap={isImportWorkbench ? 3 : [2, 4]}
          columnGap={isImportWorkbench ? 4 : [3, 7]}
          py={isImportWorkbench ? 1 : 0}
        >
          <HStack flex={'1'} spacing={1}>
            <Checkbox isChecked={indexPrefixTitle} {...register('indexPrefixTitle')}>
              <FormLabel>{t('dataset:index_prefix_title')}</FormLabel>
            </Checkbox>
            <QuestionTip label={t('dataset:index_prefix_title_tips')} />
          </HStack>
          {trainingType === DatasetCollectionDataProcessModeEnum.chunk &&
            feConfigs?.show_dataset_enhance !== false && (
              <>
                <HStack flex={'1'} spacing={1}>
                  <MyTooltip label={!feConfigs?.isPlus ? t('common:commercial_function_tip') : ''}>
                    <Checkbox
                      isDisabled={!feConfigs?.isPlus}
                      isChecked={autoIndexes}
                      {...register('autoIndexes')}
                    >
                      <FormLabel>{t('dataset:auto_indexes')}</FormLabel>
                    </Checkbox>
                  </MyTooltip>
                  <QuestionTip label={t('dataset:auto_indexes_tips')} />
                </HStack>
                <HStack flex={'1'} spacing={1}>
                  <MyTooltip
                    label={
                      !feConfigs?.isPlus
                        ? t('common:commercial_function_tip')
                        : !datasetDetail?.vlmModel
                          ? t('common:error_vlm_not_config')
                          : ''
                    }
                  >
                    <Checkbox
                      isDisabled={!feConfigs?.isPlus || !datasetDetail?.vlmModel}
                      isChecked={imageIndex}
                      {...register('imageIndex')}
                    >
                      <FormLabel>{t('dataset:image_auto_parse')}</FormLabel>
                    </Checkbox>
                  </MyTooltip>
                  <QuestionTip label={t('dataset:image_auto_parse_tips')} />
                </HStack>
              </>
            )}
        </Grid>
      </Grid>
      <Grid
        mt={isImportWorkbench ? 0 : 6}
        gridTemplateColumns={
          isImportWorkbench ? ['minmax(0, 1fr)', '220px minmax(0, 1fr)'] : 'minmax(0, 1fr)'
        }
        gap={isImportWorkbench ? [3, 8] : 0}
        pt={isImportWorkbench ? 6 : 0}
      >
        <Box minW={0} mb={isImportWorkbench ? 0 : 2}>
          <Box fontSize={'sm'} fontWeight={isImportWorkbench ? 700 : 400} color={'myGray.800'}>
            {t('dataset:chunk_process_params')}
          </Box>
          {isImportWorkbench && (
            <Box mt={1} color={'myGray.600'} fontSize={'xs'} lineHeight={1.6}>
              {t('dataset:import_chunk_params_desc')}
            </Box>
          )}
        </Box>
        <LeftRadio<ChunkSettingModeEnum>
          list={[
            {
              title: t('dataset:default_params'),
              desc: t('dataset:default_params_desc'),
              value: ChunkSettingModeEnum.auto
            },
            {
              title: t('dataset:custom_data_process_params'),
              desc: t('dataset:custom_data_process_params_desc'),
              value: ChunkSettingModeEnum.custom,
              children: chunkSettingMode === ChunkSettingModeEnum.custom && (
                <Box>
                  <Box>
                    <RadioGroup<DataChunkSplitModeEnum>
                      list={[
                        {
                          title: t('dataset:paragraph_split'),
                          value: DataChunkSplitModeEnum.paragraph,
                          tooltip: t('dataset:paragraph_split_tip')
                        },
                        {
                          title: t('dataset:split_chunk_size'),
                          value: DataChunkSplitModeEnum.size
                        },
                        {
                          title: t('dataset:split_chunk_char'),
                          value: DataChunkSplitModeEnum.char,
                          tooltip: t('dataset:custom_split_sign_tip')
                        }
                      ]}
                      value={chunkSplitMode}
                      onChange={(e) => {
                        setValue('chunkSplitMode', e);
                      }}
                      fontSize={'md'}
                    />

                    {chunkSplitMode === DataChunkSplitModeEnum.paragraph && (
                      <Grid
                        mt={4}
                        gridTemplateColumns={
                          isImportWorkbench
                            ? ['minmax(0, 1fr)', 'repeat(3, minmax(0, 1fr))']
                            : 'minmax(0, 1fr)'
                        }
                        gap={3}
                      >
                        <Box fontSize={'sm'}>
                          <Box mb={1}>{t('dataset:llm_paragraph_mode')}</Box>
                          <MySelect<ParagraphChunkAIModeEnum>
                            size={'sm'}
                            bg={isImportWorkbench ? 'white' : 'myGray.50'}
                            value={paragraphChunkAIMode}
                            onChange={(e) => {
                              setValue('paragraphChunkAIMode', e);
                            }}
                            list={[
                              {
                                label: t('dataset:llm_paragraph_mode_auto'),
                                value: ParagraphChunkAIModeEnum.auto,
                                description: t('dataset:llm_paragraph_mode_auto_desc')
                              },
                              {
                                label: t('dataset:llm_paragraph_mode_forbid'),
                                value: ParagraphChunkAIModeEnum.forbid,
                                description: t('dataset:llm_paragraph_mode_forbid_desc')
                              },
                              {
                                label: t('dataset:llm_paragraph_mode_force'),
                                value: ParagraphChunkAIModeEnum.force,
                                description: t('dataset:llm_paragraph_mode_force_desc')
                              }
                            ]}
                          />
                        </Box>
                        <Box fontSize={'sm'}>
                          <Box mb={1}>{t('dataset:paragraph_max_deep')}</Box>
                          <MyNumberInput
                            size={'sm'}
                            bg={isImportWorkbench ? 'white' : 'myGray.50'}
                            inputFieldProps={isImportWorkbench ? { bg: 'white' } : undefined}
                            register={register}
                            name={'paragraphChunkDeep'}
                            min={1}
                            max={8}
                            step={1}
                            h={'32px'}
                          />
                        </Box>
                        <Box fontSize={'sm'}>
                          <Box mb={1}>{t('dataset:max_chunk_size')}</Box>
                          <Box
                            css={{
                              '& > span': {
                                display: 'block'
                              }
                            }}
                          >
                            <MyTooltip
                              label={t('common:core.dataset.import.Chunk Range', {
                                min: minChunkSizeValue,
                                max: maxChunkSize
                              })}
                            >
                              <MyNumberInput
                                register={register}
                                name={'chunkSize'}
                                min={minChunkSizeValue}
                                max={maxChunkSize}
                                size={'sm'}
                                step={100}
                                inputFieldProps={isImportWorkbench ? { bg: 'white' } : undefined}
                              />
                            </MyTooltip>
                          </Box>
                        </Box>
                      </Grid>
                    )}

                    {chunkSplitMode === DataChunkSplitModeEnum.size && (
                      <Box mt={4} maxW={isImportWorkbench ? '320px' : undefined} fontSize={'sm'}>
                        <Box>{t('dataset:chunk_size')}</Box>
                        <Box
                          css={{
                            '& > span': {
                              display: 'block'
                            }
                          }}
                        >
                          <MyTooltip
                            label={t('common:core.dataset.import.Chunk Range', {
                              min: minChunkSizeValue,
                              max: maxChunkSize
                            })}
                          >
                            <MyNumberInput
                              register={register}
                              name={'chunkSize'}
                              min={minChunkSizeValue}
                              max={maxChunkSize}
                              size={'sm'}
                              step={100}
                              inputFieldProps={isImportWorkbench ? { bg: 'white' } : undefined}
                            />
                          </MyTooltip>
                        </Box>
                      </Box>
                    )}

                    {chunkSplitMode === DataChunkSplitModeEnum.char && (
                      <Box mt={3} fontSize={'sm'}>
                        <Box mb={1}>{t('dataset:custom_split_char')}</Box>
                        <HStack>
                          <Box flex={'1 0 0'}>
                            <MySelect<string>
                              list={customSplitList}
                              size={'sm'}
                              bg={isImportWorkbench ? 'white' : 'myGray.50'}
                              value={customListSelectValue}
                              h={'32px'}
                              onChange={(val) => {
                                if (val === 'Other') {
                                  setValue('chunkSplitter', '');
                                } else {
                                  setValue('chunkSplitter', val);
                                }
                                setCustomListSelectValue(val);
                              }}
                            />
                          </Box>
                          {customListSelectValue === 'Other' && (
                            <Input
                              flex={'1 0 0'}
                              h={'32px'}
                              size={'sm'}
                              bg={isImportWorkbench ? 'white' : 'myGray.50'}
                              placeholder="\n;======;==SPLIT=="
                              {...register('chunkSplitter')}
                            />
                          )}
                        </HStack>
                      </Box>
                    )}
                  </Box>

                  {trainingType === DatasetCollectionDataProcessModeEnum.chunk && (
                    <Box
                      fontSize={'sm'}
                      mt={4}
                      pt={4}
                      borderTop={'1px solid'}
                      borderColor={'borderColor.base'}
                    >
                      <Flex alignItems={'center'}>
                        <Box>{t('dataset:index_size')}</Box>
                        <QuestionTip label={t('dataset:index_size_tips')} />
                      </Flex>
                      <Box maxW={isImportWorkbench ? '320px' : undefined} mt={1}>
                        <MySelect<number>
                          bg={isImportWorkbench ? 'white' : 'myGray.50'}
                          list={indexSizeSeletorList}
                          value={indexSize}
                          onChange={(val) => {
                            setValue('indexSize', val);
                          }}
                        />
                      </Box>
                    </Box>
                  )}

                  {showQAPromptInput && (
                    <Box mt={2}>
                      <Box>{t('common:core.dataset.collection.QA Prompt')}</Box>
                      <Box
                        position={'relative'}
                        py={2}
                        px={3}
                        bg={isImportWorkbench ? 'white' : 'myGray.50'}
                        fontSize={'xs'}
                        whiteSpace={'pre-wrap'}
                        border={'1px'}
                        borderColor={'borderColor.base'}
                        borderRadius={'md'}
                        maxH={'140px'}
                        overflow={'auto'}
                        _hover={{
                          '& .mask': {
                            display: 'block'
                          }
                        }}
                      >
                        {qaPrompt}

                        <Box
                          display={'none'}
                          className="mask"
                          position={'absolute'}
                          top={0}
                          right={0}
                          bottom={0}
                          left={0}
                          background={
                            'linear-gradient(182deg, rgba(255, 255, 255, 0.00) 1.76%, #FFF 84.07%)'
                          }
                        >
                          <Button
                            size="xs"
                            variant={'whiteBase'}
                            leftIcon={<MyIcon name={'edit'} w={'13px'} />}
                            color={'black'}
                            position={'absolute'}
                            right={2}
                            bottom={2}
                            onClick={onOpenCustomPrompt}
                          >
                            {t('common:core.dataset.import.Custom prompt')}
                          </Button>
                        </Box>
                      </Box>
                    </Box>
                  )}
                </Box>
              )
            }
          ]}
          gridGap={isImportWorkbench ? 0 : 3}
          gridTemplateColumns={isImportWorkbench ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)'}
          px={3}
          py={3}
          borderBottom={isImportWorkbench ? '1px solid' : 'none'}
          borderColor={'borderColor.base'}
          defaultBg="white"
          activeBg={'white'}
          variant={isImportWorkbench ? 'underline' : 'card'}
          value={chunkSettingMode}
          w={'100%'}
          onChange={(e) => {
            setValue('chunkSettingMode', e);
          }}
        />
      </Grid>
      {isOpenCustomPrompt && (
        <PromptTextarea
          defaultValue={qaPrompt}
          onChange={(e) => {
            setValue('qaPrompt', e);
          }}
          onClose={onCloseCustomPrompt}
        />
      )}
    </>
  );
};

export default CollectionChunkForm;
