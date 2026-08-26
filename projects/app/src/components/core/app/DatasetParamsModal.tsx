import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  ModalBody,
  ModalFooter,
  Switch,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';

import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import SelectAiModel from '@/components/Select/AIModelSelector';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import InputSlider from '@fastgpt/web/components/common/MySlider/InputSlider';
import { type AppDatasetSearchParamsType } from '@fastgpt/global/core/app/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import { omniTheme } from '@/web/common/brand/theme';

enum SearchSettingTabEnum {
  searchMode = 'searchMode',
  limit = 'limit',
  queryExtension = 'queryExtension'
}

const DatasetParamsModal = ({
  searchMode = DatasetSearchModeEnum.embedding,
  limit,
  similarity,
  embeddingWeight,
  usingReRank,
  rerankModel,
  rerankWeight,
  datasetSearchUsingExtensionQuery,
  datasetSearchExtensionModel,
  datasetSearchExtensionBg,
  maxTokens,
  onClose,
  onSuccess
}: AppDatasetSearchParamsType & {
  maxTokens?: number; // limit max tokens
  onClose: () => void;
  onSuccess: (e: AppDatasetSearchParamsType) => void;
}) => {
  const { t } = useTranslation();
  const { reRankModelList, llmModelList, defaultModels } = useSystemStore();
  const [refresh, setRefresh] = useState(false);
  const [currentTabType, setCurrentTabType] = useState(SearchSettingTabEnum.searchMode);

  const queryExtensionModelList = useMemo(
    () =>
      llmModelList.map((item) => ({
        value: item.model,
        label: item.name
      })),
    [llmModelList]
  );
  const reRankModelSelectList = useMemo(
    () =>
      reRankModelList.map((item) => ({
        value: item.model,
        label: item.name
      })),
    [reRankModelList]
  );

  const { register, setValue, getValues, handleSubmit, watch } =
    useForm<AppDatasetSearchParamsType>({
      defaultValues: {
        searchMode,
        embeddingWeight: embeddingWeight || 0.5,
        usingReRank: !!usingReRank,
        rerankModel: rerankModel || defaultModels?.rerank?.model,
        rerankWeight: rerankWeight || 0.5,
        limit,
        similarity,
        datasetSearchUsingExtensionQuery,
        datasetSearchExtensionModel: datasetSearchExtensionModel || defaultModels.llm?.model,
        datasetSearchExtensionBg
      }
    });

  const searchModeWatch = watch('searchMode');
  const embeddingWeightWatch = watch('embeddingWeight');
  const fullTextWeightWatch = useMemo(() => {
    const val = 1 - (embeddingWeightWatch || 0.5);
    return Number(val.toFixed(2));
  }, [embeddingWeightWatch]);

  const datasetSearchUsingCfrForm = watch('datasetSearchUsingExtensionQuery');
  const queryExtensionModel = watch('datasetSearchExtensionModel');

  const usingReRankWatch = watch('usingReRank');
  const reRankModelWatch = watch('rerankModel');
  const rerankWeightWatch = watch('rerankWeight');

  const showSimilarity = useMemo(() => {
    if (similarity === undefined) return false;
    if (usingReRankWatch) return true;
    if (searchModeWatch === DatasetSearchModeEnum.embedding) return true;
    return false;
  }, [searchModeWatch, similarity, usingReRankWatch]);

  const showReRank = useMemo(() => {
    return usingReRank !== undefined && reRankModelList.length > 0;
  }, [reRankModelList.length, usingReRank]);

  useEffect(() => {
    if (datasetSearchUsingCfrForm) {
      !queryExtensionModel && setValue('datasetSearchExtensionModel', defaultModels.llm?.model);
    } else {
      setValue('datasetSearchExtensionModel', '');
    }
  }, [
    queryExtensionModelList,
    datasetSearchUsingCfrForm,
    defaultModels.llm?.model,
    queryExtensionModel,
    setValue
  ]);

  // 保证只有 80 左右个刻度。
  const maxTokenStep = useMemo(() => {
    if (!maxTokens || maxTokens < 8000) return 80;
    return Math.ceil(maxTokens / 80 / 100) * 100;
  }, [maxTokens]);

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/modal/params.svg"
      title={t('common:core.dataset.search.Dataset Search Params')}
      w={['92vw', '760px']}
      maxW={['92vw', '760px']}
      isCentered
    >
      <ModalBody flex={'auto'} overflow={'hidden'} p={0} bg={'white'}>
        <Flex minH={['520px', '500px']} maxH={'70vh'} flexDirection={['column', 'row']}>
          <Box
            w={['100%', '188px']}
            flex={'0 0 auto'}
            p={[2, 3]}
            bg={omniTheme.colors.sidebarBg}
            borderRightWidth={['0', '1px']}
            borderRightStyle={'solid'}
            borderRightColor={omniTheme.colors.border}
            borderBottomWidth={['1px', '0']}
            borderBottomStyle={'solid'}
            borderBottomColor={omniTheme.colors.border}
          >
            <Flex display={['flex', 'block']} gap={1} overflowX={'auto'}>
              <SettingsNavButton
                icon="common/setting"
                label={t('common:core.dataset.search.search mode')}
                isActive={currentTabType === SearchSettingTabEnum.searchMode}
                onClick={() => setCurrentTabType(SearchSettingTabEnum.searchMode)}
              />
              <SettingsNavButton
                icon="core/dataset/searchfilter"
                label={t('common:core.dataset.search.Filter')}
                isActive={currentTabType === SearchSettingTabEnum.limit}
                onClick={() => setCurrentTabType(SearchSettingTabEnum.limit)}
              />
              <SettingsNavButton
                icon="core/dataset/questionExtension"
                label={t('common:core.module.template.Query extension')}
                isActive={currentTabType === SearchSettingTabEnum.queryExtension}
                onClick={() => setCurrentTabType(SearchSettingTabEnum.queryExtension)}
              />
            </Flex>
          </Box>

          <Box flex={1} minW={0} overflowY={'auto'} px={[4, 7]} py={[5, 6]}>
            {currentTabType === SearchSettingTabEnum.searchMode && (
              <Box>
                <SettingsHeading
                  title={t('common:core.dataset.search.search mode')}
                  description={t('common:core.dataset.search.mode.mixedRecall desc')}
                />

                <Box
                  mt={5}
                  borderTop={'1px solid'}
                  borderBottom={'1px solid'}
                  borderColor={omniTheme.colors.border}
                >
                  {[
                    {
                      title: t('common:core.dataset.search.mode.embedding'),
                      desc: t('common:core.dataset.search.mode.embedding desc'),
                      value: DatasetSearchModeEnum.embedding
                    },
                    {
                      title: t('common:core.dataset.search.mode.fullTextRecall'),
                      desc: t('common:core.dataset.search.mode.fullTextRecall desc'),
                      value: DatasetSearchModeEnum.fullTextRecall
                    },
                    {
                      title: t('common:core.dataset.search.mode.mixedRecall'),
                      desc: t('common:core.dataset.search.mode.mixedRecall desc'),
                      value: DatasetSearchModeEnum.mixedRecall
                    }
                  ].map((mode, index) => {
                    const isSelected = searchModeWatch === mode.value;
                    return (
                      <Box
                        key={mode.value}
                        py={3}
                        borderTop={index > 0 ? '1px solid' : 'none'}
                        borderColor={omniTheme.colors.border}
                        bg={isSelected ? '#F8FAFF' : 'white'}
                      >
                        <Flex
                          as={'button'}
                          type={'button'}
                          w={'100%'}
                          px={3}
                          textAlign={'left'}
                          alignItems={'flex-start'}
                          onClick={() => setValue('searchMode', mode.value)}
                        >
                          <Flex
                            w={'18px'}
                            h={'18px'}
                            mt={0.5}
                            mr={3}
                            flex={'0 0 auto'}
                            alignItems={'center'}
                            justifyContent={'center'}
                            border={'1px solid'}
                            borderColor={
                              isSelected ? omniTheme.colors.saturatedBlue : omniTheme.colors.border
                            }
                            borderRadius={'full'}
                          >
                            {isSelected && (
                              <Box
                                w={'8px'}
                                h={'8px'}
                                borderRadius={'full'}
                                bg={omniTheme.colors.saturatedBlue}
                              />
                            )}
                          </Flex>
                          <Box minW={0}>
                            <Box fontSize={'sm'} fontWeight={700} color={omniTheme.colors.text}>
                              {mode.title}
                            </Box>
                            <Box mt={1} fontSize={'xs'} color={omniTheme.colors.muted}>
                              {mode.desc}
                            </Box>
                          </Box>
                        </Flex>

                        {isSelected && mode.value === DatasetSearchModeEnum.mixedRecall && (
                          <Box px={3} pt={3} pl={'48px'}>
                            <Flex
                              mb={2}
                              justifyContent={'space-between'}
                              color={omniTheme.colors.muted}
                              fontSize={'xs'}
                              fontWeight={600}
                            >
                              <Box>
                                {t('common:core.dataset.search.mode.embedding')}{' '}
                                {embeddingWeightWatch}
                              </Box>
                              <Box>
                                {t('common:core.dataset.search.score.fullText')}{' '}
                                {fullTextWeightWatch}
                              </Box>
                            </Flex>
                            <Slider
                              value={embeddingWeightWatch}
                              min={0.1}
                              max={0.9}
                              step={0.01}
                              onChange={(value) =>
                                setValue('embeddingWeight', Number(value.toFixed(2)))
                              }
                            >
                              <SliderTrack bg={'#D8DEE8'} h={'4px'}>
                                <SliderFilledTrack bg={omniTheme.colors.saturatedBlue} />
                              </SliderTrack>
                              <SliderThumb
                                w={'16px'}
                                h={'16px'}
                                border={'2px solid'}
                                borderColor={omniTheme.colors.saturatedBlue}
                                boxShadow={'0 2px 6px rgba(15, 23, 42, 0.16)'}
                              />
                            </Slider>
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Box>

                <Box mt={6} borderTop={'1px solid'} borderColor={omniTheme.colors.border}>
                  <SettingsRow
                    label={t('common:core.dataset.search.ReRank')}
                    tip={t('common:core.dataset.search.ReRank desc')}
                  >
                    {!showReRank ? (
                      <Box color={omniTheme.colors.muted} fontSize={'xs'}>
                        {t('common:core.ai.Not deploy rerank model')}
                      </Box>
                    ) : (
                      <Switch {...register('usingReRank')} />
                    )}
                  </SettingsRow>
                  {usingReRankWatch && (
                    <>
                      <SettingsRow label={t('common:rerank_weight')}>
                        <Box w={['100%', '280px']}>
                          <InputSlider
                            min={0.1}
                            max={1}
                            step={0.01}
                            value={rerankWeightWatch}
                            onChange={(value) =>
                              setValue(
                                NodeInputKeyEnum.datasetSearchRerankWeight,
                                Number(value.toFixed(2))
                              )
                            }
                          />
                        </Box>
                      </SettingsRow>
                      <SettingsRow label={t('common:model.type.reRank')}>
                        <Box w={['100%', '280px']}>
                          <SelectAiModel
                            bg={'#FBFCFE'}
                            h={'36px'}
                            value={reRankModelWatch}
                            list={reRankModelSelectList}
                            onChange={(value) =>
                              setValue(NodeInputKeyEnum.datasetSearchRerankModel, value)
                            }
                          />
                        </Box>
                      </SettingsRow>
                    </>
                  )}
                </Box>
              </Box>
            )}

            {currentTabType === SearchSettingTabEnum.limit && (
              <Box>
                <SettingsHeading
                  title={t('common:core.dataset.search.Filter')}
                  description={t('common:min_similarity_tip')}
                />
                <Box mt={5} borderTop={'1px solid'} borderColor={omniTheme.colors.border}>
                  {limit !== undefined && (
                    <SettingsRow
                      label={t('common:max_quote_tokens')}
                      tip={t('common:max_quote_tokens_tips')}
                    >
                      <Box w={['100%', '320px']}>
                        {maxTokens ? (
                          <InputSlider
                            min={100}
                            max={maxTokens}
                            step={maxTokenStep}
                            value={getValues(NodeInputKeyEnum.datasetMaxTokens) ?? 1000}
                            onChange={(value) => {
                              setValue(NodeInputKeyEnum.datasetMaxTokens, value);
                              setRefresh(!refresh);
                            }}
                          />
                        ) : (
                          <MyNumberInput
                            size={'sm'}
                            min={100}
                            max={1000000}
                            step={100}
                            register={register}
                            name={NodeInputKeyEnum.datasetMaxTokens}
                          />
                        )}
                      </Box>
                    </SettingsRow>
                  )}
                  <SettingsRow
                    label={t('common:min_similarity')}
                    tip={t('common:min_similarity_tip')}
                  >
                    <Box w={['100%', '320px']}>
                      {showSimilarity ? (
                        <InputSlider
                          min={0}
                          max={1}
                          step={0.01}
                          value={getValues(NodeInputKeyEnum.datasetSimilarity) ?? 0.5}
                          onChange={(value) => {
                            setValue(NodeInputKeyEnum.datasetSimilarity, value);
                            setRefresh(!refresh);
                          }}
                        />
                      ) : (
                        <Box color={omniTheme.colors.muted} fontSize={'xs'}>
                          {t('common:core.dataset.search.No support similarity')}
                        </Box>
                      )}
                    </Box>
                  </SettingsRow>
                </Box>
              </Box>
            )}

            {currentTabType === SearchSettingTabEnum.queryExtension && (
              <Box>
                <SettingsHeading
                  title={t('common:core.module.template.Query extension')}
                  description={t('common:core.dataset.Query extension intro')}
                />
                <Box mt={5} borderTop={'1px solid'} borderColor={omniTheme.colors.border}>
                  <SettingsRow label={t('common:core.dataset.search.Using query extension')}>
                    <Switch {...register('datasetSearchUsingExtensionQuery')} />
                  </SettingsRow>
                  {datasetSearchUsingCfrForm === true && (
                    <>
                      <SettingsRow label={t('common:core.ai.Model')}>
                        <Box w={['100%', '320px']}>
                          <SelectAiModel
                            width={'100%'}
                            value={queryExtensionModel}
                            list={queryExtensionModelList}
                            onChange={(value) => setValue('datasetSearchExtensionModel', value)}
                          />
                        </Box>
                      </SettingsRow>
                      <Box py={4} borderBottom={'1px solid'} borderColor={omniTheme.colors.border}>
                        <Flex alignItems={'center'} mb={2}>
                          <Box fontSize={'sm'} fontWeight={700} color={omniTheme.colors.text}>
                            {t('common:core.app.edit.Query extension background prompt')}
                          </Box>
                          <QuestionTip
                            ml={1}
                            label={t('common:core.app.edit.Query extension background tip')}
                          />
                        </Flex>
                        <MyTextarea
                          autoHeight
                          minH={150}
                          maxH={260}
                          bg={'#FBFCFE'}
                          placeholder={t('common:core.module.QueryExtension.placeholder')}
                          {...register('datasetSearchExtensionBg')}
                        />
                      </Box>
                    </>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        </Flex>
      </ModalBody>
      <ModalFooter minH={'64px'}>
        <Box flex={1} color={omniTheme.colors.muted} fontSize={'xs'}>
          {t('common:core.dataset.search.Params Setting')}
        </Box>
        <Button h={'34px'} variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:Close')}
        </Button>
        <Button
          h={'34px'}
          borderRadius={omniTheme.radii.sm}
          onClick={() => {
            onClose();
            handleSubmit(onSuccess)();
          }}
        >
          {t('common:Done')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default DatasetParamsModal;

const SettingsNavButton = ({
  icon,
  label,
  isActive,
  onClick
}: {
  icon: 'common/setting' | 'core/dataset/searchfilter' | 'core/dataset/questionExtension';
  label: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}) => (
  <Flex
    as={'button'}
    type={'button'}
    w={['auto', '100%']}
    minW={['132px', 0]}
    h={'40px'}
    px={3}
    mb={[0, 1]}
    alignItems={'center'}
    borderRadius={omniTheme.radii.sm}
    bg={isActive ? 'white' : 'transparent'}
    color={isActive ? 'primary.700' : omniTheme.colors.muted}
    boxShadow={isActive ? '0 1px 2px rgba(15, 23, 42, 0.06)' : 'none'}
    fontSize={'sm'}
    fontWeight={isActive ? 700 : 600}
    transition={'all 0.18s ease'}
    _hover={{ bg: 'white', color: omniTheme.colors.text }}
    onClick={onClick}
  >
    <MyIcon name={icon} w={'15px'} mr={2.5} />
    {label}
  </Flex>
);

const SettingsHeading = ({
  title,
  description
}: {
  title: React.ReactNode;
  description: React.ReactNode;
}) => (
  <Box>
    <Box fontSize={'lg'} fontWeight={800} color={omniTheme.colors.text}>
      {title}
    </Box>
    <Box mt={1.5} maxW={'560px'} color={omniTheme.colors.muted} fontSize={'sm'} lineHeight={1.6}>
      {description}
    </Box>
  </Box>
);

const SettingsRow = ({
  label,
  tip,
  children
}: {
  label: React.ReactNode;
  tip?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <Flex
    py={4}
    minH={'64px'}
    flexDirection={['column', 'row']}
    alignItems={['stretch', 'center']}
    gap={[3, 5]}
    borderBottom={'1px solid'}
    borderColor={omniTheme.colors.border}
  >
    <Flex flex={1} minW={0} alignItems={'center'}>
      <Box fontSize={'sm'} fontWeight={700} color={omniTheme.colors.text}>
        {label}
      </Box>
      {tip && <QuestionTip ml={1} label={tip} />}
    </Flex>
    <Flex minW={0} justifyContent={'flex-end'} alignItems={'center'}>
      {children}
    </Flex>
  </Flex>
);
