import React, { useEffect, useMemo, useState } from 'react';
import { Box, Textarea, Button, Flex, useDisclosure } from '@chakra-ui/react';
import {
  useSearchTestStore,
  type SearchTestStoreItemType
} from '@/web/core/dataset/store/searchTest';
import { postSearchText } from '@/web/core/dataset/api';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { type SearchDatasetTestResponse } from '@fastgpt/global/openapi/core/dataset/api';
import {
  DatasetSearchModeEnum,
  DatasetSearchModeMap
} from '@fastgpt/global/core/dataset/constants';
import dynamic from 'next/dynamic';
import { useForm } from 'react-hook-form';
import QuoteItem from '@/components/core/dataset/QuoteItem';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { omniTheme } from '@/web/common/brand/theme';

const DatasetParamsModal = dynamic(() => import('@/components/core/app/DatasetParamsModal'));

type FormType = {
  inputText: string;
  searchParams: {
    searchMode: DatasetSearchModeEnum;
    embeddingWeight?: number;

    usingReRank?: boolean;
    rerankModel?: string;
    rerankWeight?: number;

    similarity?: number;
    limit?: number;
    datasetSearchUsingExtensionQuery?: boolean;
    datasetSearchExtensionModel?: string;
    datasetSearchExtensionBg?: string;
  };
};

const Test = ({ datasetId }: { datasetId: string }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { defaultModels } = useSystemStore();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const { pushDatasetTestItem } = useSearchTestStore();
  const [datasetTestItem, setDatasetTestItem] = useState<SearchTestStoreItemType>();

  const { getValues, setValue, register, handleSubmit, watch } = useForm<FormType>({
    defaultValues: {
      inputText: '',
      searchParams: {
        searchMode: DatasetSearchModeEnum.embedding,
        embeddingWeight: 0.5,
        usingReRank: true,
        rerankModel: defaultModels?.rerank?.model,
        rerankWeight: 0.5,
        limit: 5000,
        similarity: 0,
        datasetSearchUsingExtensionQuery: false,
        datasetSearchExtensionModel: defaultModels.llm?.model,
        datasetSearchExtensionBg: ''
      }
    }
  });

  const searchParams = watch('searchParams');
  const searchModeData = DatasetSearchModeMap[searchParams.searchMode];

  const {
    isOpen: isOpenSelectMode,
    onOpen: onOpenSelectMode,
    onClose: onCloseSelectMode
  } = useDisclosure();

  const { runAsync: onTextTest, loading: textTestIsLoading } = useRequest(
    ({ inputText, searchParams }: FormType) =>
      postSearchText({ datasetId, text: inputText.trim(), ...searchParams }),
    {
      onSuccess(res: SearchDatasetTestResponse) {
        if (!res || res.list.length === 0) {
          return toast({
            status: 'warning',
            title: t('common:dataset.test.noResult')
          });
        }

        const testItem: SearchTestStoreItemType = {
          id: getNanoid(),
          datasetId,
          text: getValues('inputText').trim(),
          time: new Date(),
          results: res.list,
          duration: res.duration,
          searchMode: res.searchMode,
          usingReRank: res.usingReRank,
          limit: res.limit,
          similarity: res.similarity,
          queryExtensionModel: res.queryExtensionModel
        };
        pushDatasetTestItem(testItem);
        setDatasetTestItem(testItem);
      }
    }
  );

  useEffect(() => {
    setDatasetTestItem(undefined);
  }, [datasetId]);

  return (
    <Flex h={'100%'} minH={0} flexDirection={['column', 'row']} bg={omniTheme.colors.pageBg}>
      <Flex
        h={['auto', '100%']}
        w={['100%', '308px']}
        flex={'0 0 auto'}
        minW={0}
        flexDirection={'column'}
        bg={omniTheme.colors.surface}
        borderRightWidth={['0', '1px']}
        borderRightStyle={'solid'}
        borderRightColor={omniTheme.colors.border}
        borderBottomWidth={['1px', '0']}
        borderBottomStyle={'solid'}
        borderBottomColor={omniTheme.colors.border}
      >
        <Flex
          h={'52px'}
          flex={'0 0 auto'}
          px={4}
          alignItems={'center'}
          justifyContent={'space-between'}
          borderBottom={'1px solid'}
          borderColor={omniTheme.colors.border}
        >
          <Flex alignItems={'center'} minW={0}>
            <Flex
              w={'28px'}
              h={'28px'}
              mr={2.5}
              alignItems={'center'}
              justifyContent={'center'}
              borderRadius={omniTheme.radii.sm}
              bg={omniTheme.colors.graphite}
              color={'white'}
            >
              <MyIcon name={'text'} w={'14px'} color={'currentColor'} />
            </Flex>
            <Box minW={0}>
              <Box fontSize={'sm'} fontWeight={700} color={omniTheme.colors.text}>
                {t('common:core.dataset.test.Test Text')}
              </Box>
              <Box fontSize={'11px'} color={omniTheme.colors.muted} noOfLines={1}>
                {t(searchModeData.title)}
              </Box>
            </Box>
          </Flex>
          <MyTooltip label={t('common:core.dataset.search.Dataset Search Params')}>
            <Flex
              as={'button'}
              type={'button'}
              w={'30px'}
              h={'30px'}
              alignItems={'center'}
              justifyContent={'center'}
              border={'1px solid'}
              borderColor={omniTheme.colors.border}
              borderRadius={omniTheme.radii.sm}
              color={omniTheme.colors.graphite}
              transition={'all 0.18s ease'}
              _hover={{ borderColor: omniTheme.colors.saturatedBlue, color: 'primary.600' }}
              onClick={onOpenSelectMode}
            >
              <MyIcon name={'common/setting'} w={'15px'} />
            </Flex>
          </MyTooltip>
        </Flex>

        <Box p={4} flex={'0 0 auto'}>
          <Box
            border={'1px solid'}
            borderColor={omniTheme.colors.border}
            borderRadius={omniTheme.radii.md}
            bg={'#FBFCFE'}
            transition={'border-color 0.18s ease, box-shadow 0.18s ease'}
            _focusWithin={{
              borderColor: omniTheme.colors.saturatedBlue,
              boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.10)'
            }}
          >
            <Textarea
              minH={'116px'}
              px={3.5}
              py={3}
              resize={'none'}
              border={'none'}
              borderRadius={0}
              boxShadow={'none !important'}
              fontSize={'sm'}
              lineHeight={1.65}
              color={omniTheme.colors.text}
              maxLength={datasetDetail.vectorModel?.maxToken}
              placeholder={t('common:core.dataset.test.Test Text Placeholder')}
              {...register('inputText', { required: true })}
            />
            <Flex
              p={2}
              alignItems={'center'}
              justifyContent={'space-between'}
              borderTop={'1px solid'}
              borderColor={omniTheme.colors.border}
            >
              <Flex
                px={2}
                h={'28px'}
                alignItems={'center'}
                borderRadius={omniTheme.radii.sm}
                bg={omniTheme.colors.activeBg}
                color={'primary.700'}
                fontSize={'xs'}
                fontWeight={600}
              >
                <MyIcon name={searchModeData.icon as IconNameType} w={'13px'} mr={1.5} />
                {t(searchModeData.title)}
              </Flex>
              <Button
                h={'30px'}
                minW={'72px'}
                borderRadius={omniTheme.radii.sm}
                bg={omniTheme.colors.graphite}
                color={'white'}
                fontSize={'sm'}
                isLoading={textTestIsLoading}
                _hover={{ bg: omniTheme.colors.graphiteHover }}
                onClick={() => handleSubmit((data) => onTextTest(data))()}
              >
                {t('common:core.dataset.test.Test')}
              </Button>
            </Flex>
          </Box>
        </Box>

        <Box
          flex={1}
          minH={0}
          overflowY={'auto'}
          display={['none', 'block']}
          borderTop={'1px solid'}
          borderColor={omniTheme.colors.border}
        >
          <TestHistories
            datasetId={datasetId}
            datasetTestItem={datasetTestItem}
            setDatasetTestItem={setDatasetTestItem}
          />
        </Box>
      </Flex>

      <Box h={['auto', '100%']} minH={0} overflow={'hidden'} flex={'1 1 0'} minW={0}>
        <TestResults datasetTestItem={datasetTestItem} />
      </Box>

      {isOpenSelectMode && (
        <DatasetParamsModal
          {...searchParams}
          maxTokens={20000}
          onClose={onCloseSelectMode}
          onSuccess={(e) => {
            setValue('searchParams', {
              ...searchParams,
              ...e
            });
          }}
        />
      )}
    </Flex>
  );
};

export default React.memo(Test);

const TestHistories = React.memo(function TestHistories({
  datasetId,
  datasetTestItem,
  setDatasetTestItem
}: {
  datasetId: string;
  datasetTestItem?: SearchTestStoreItemType;
  setDatasetTestItem: React.Dispatch<React.SetStateAction<SearchTestStoreItemType | undefined>>;
}) {
  const { t } = useTranslation();
  const { datasetTestList, delDatasetTestItemById } = useSearchTestStore();

  const testHistories = useMemo(
    () => datasetTestList.filter((item) => item.datasetId === datasetId),
    [datasetId, datasetTestList]
  );

  return (
    <Box>
      <Flex
        h={'44px'}
        px={4}
        alignItems={'center'}
        justifyContent={'space-between'}
        color={omniTheme.colors.text}
      >
        <Flex alignItems={'center'}>
          <MyIcon mr={2} name={'history'} w={'15px'} h={'15px'} />
          <Box fontSize={'sm'} fontWeight={700}>
            {t('common:core.dataset.test.test history')}
          </Box>
        </Flex>
        <Flex
          minW={'22px'}
          h={'22px'}
          px={1.5}
          alignItems={'center'}
          justifyContent={'center'}
          borderRadius={'full'}
          bg={omniTheme.colors.sidebarBg}
          color={omniTheme.colors.muted}
          fontSize={'11px'}
          fontWeight={700}
        >
          {testHistories.length}
        </Flex>
      </Flex>
      <Box pb={3}>
        {testHistories.map((item) => (
          <Flex
            key={item.id}
            position={'relative'}
            minH={'52px'}
            py={2.5}
            pl={4}
            pr={3}
            alignItems={'center'}
            borderTop={'1px solid'}
            borderColor={omniTheme.colors.border}
            _hover={{
              bg: '#F8FAFC',
              '& .delete': {
                opacity: 1
              },
              '& .time': {
                opacity: 0
              }
            }}
            cursor={'pointer'}
            fontSize={'sm'}
            {...(item.id === datasetTestItem?.id && {
              bg: omniTheme.colors.activeBg,
              _before: {
                content: '""',
                position: 'absolute',
                left: 0,
                top: '8px',
                bottom: '8px',
                w: '3px',
                borderRadius: '0 3px 3px 0',
                bg: omniTheme.colors.saturatedBlue
              }
            })}
            onClick={() => setDatasetTestItem(item)}
          >
            <Flex
              w={'26px'}
              h={'26px'}
              mr={2.5}
              flex={'0 0 auto'}
              alignItems={'center'}
              justifyContent={'center'}
              borderRadius={omniTheme.radii.sm}
              bg={'white'}
              border={'1px solid'}
              borderColor={omniTheme.colors.border}
              color={'primary.600'}
            >
              <MyIcon
                name={DatasetSearchModeMap[item.searchMode].icon as IconNameType}
                w={'13px'}
              />
            </Flex>
            <Box flex={1} minW={0} mr={2}>
              <Box noOfLines={1} color={omniTheme.colors.text} fontWeight={600}>
                {item.text}
              </Box>
              <Box mt={0.5} fontSize={'11px'} color={omniTheme.colors.muted} noOfLines={1}>
                {t(DatasetSearchModeMap[item.searchMode].title)}
              </Box>
            </Box>
            <Box
              className="time"
              flex={'0 0 auto'}
              fontSize={'11px'}
              color={omniTheme.colors.muted}
              transition={'opacity 0.15s ease'}
            >
              {(() => {
                const timeText = formatTimeToChatTime(item.time);
                if (timeText === 'common:just_now') return t('common:just_now');
                if (timeText === 'common:yesterday') return t('common:yesterday');
                return timeText.replace('#', ':');
              })()}
            </Box>
            <MyTooltip label={t('common:core.dataset.test.delete test history')}>
              <Flex
                className="delete"
                position={'absolute'}
                right={3}
                w={'26px'}
                h={'26px'}
                opacity={0}
                alignItems={'center'}
                justifyContent={'center'}
                borderRadius={omniTheme.radii.sm}
                bg={'white'}
                transition={'opacity 0.15s ease'}
              >
                <MyIcon
                  name={'delete'}
                  w={'14px'}
                  color={omniTheme.colors.muted}
                  _hover={{ color: 'red.500' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    delDatasetTestItemById(item.id);
                    datasetTestItem?.id === item.id && setDatasetTestItem(undefined);
                  }}
                />
              </Flex>
            </MyTooltip>
          </Flex>
        ))}
      </Box>
    </Box>
  );
});

const TestResults = React.memo(function TestResults({
  datasetTestItem
}: {
  datasetTestItem?: SearchTestStoreItemType;
}) {
  const { t } = useTranslation();

  return (
    <Flex h={'100%'} minH={0} flexDirection={'column'} bg={omniTheme.colors.surface}>
      {!datasetTestItem?.results || datasetTestItem.results.length === 0 ? (
        <Flex flex={1} minH={'360px'} alignItems={'center'} justifyContent={'center'} px={6}>
          <Flex
            w={'320px'}
            maxW={'100%'}
            flexDirection={'column'}
            alignItems={'center'}
            textAlign={'center'}
          >
            <Flex
              w={'48px'}
              h={'48px'}
              mb={4}
              alignItems={'center'}
              justifyContent={'center'}
              borderRadius={omniTheme.radii.md}
              bg={omniTheme.colors.activeBg}
              color={'primary.600'}
            >
              <MyIcon name={'common/resultLight'} w={'22px'} />
            </Flex>
            <Box fontSize={'sm'} fontWeight={700} color={omniTheme.colors.text}>
              {t('common:core.dataset.test.test result placeholder')}
            </Box>
          </Flex>
        </Flex>
      ) : (
        <>
          <Flex
            minH={'56px'}
            px={[4, 5]}
            py={2.5}
            flex={'0 0 auto'}
            alignItems={'center'}
            flexWrap={'wrap'}
            gap={2}
            borderBottom={'1px solid'}
            borderColor={omniTheme.colors.border}
            bg={'#FBFCFE'}
          >
            <Flex alignItems={'center'} mr={2}>
              <MyIcon name={'common/resultLight'} w={'16px'} mr={2} color={'primary.600'} />
              <Box fontSize={'sm'} fontWeight={750} color={omniTheme.colors.text}>
                {t('common:core.dataset.test.Test Result')}
              </Box>
              <QuestionTip ml={1} label={t('common:core.dataset.test.test result tip')} />
            </Flex>
            <ResultMetaItem>
              {datasetTestItem.results.length}
              {' · '}
              {t(DatasetSearchModeMap[datasetTestItem.searchMode].title)}
            </ResultMetaItem>
            <ResultMetaItem>{datasetTestItem.duration}</ResultMetaItem>
            <ResultMetaItem>
              {t('common:max_quote_tokens')}: {datasetTestItem.limit}
            </ResultMetaItem>
            {datasetTestItem.usingReRank && (
              <ResultMetaItem>{t('common:core.dataset.search.ReRank')}</ResultMetaItem>
            )}
          </Flex>

          <Box flex={1} minH={0} overflowY={'auto'} px={[3, 4]} py={4}>
            <Box
              w={'100%'}
              maxW={'1440px'}
              mx={'auto'}
              border={'1px solid'}
              borderColor={omniTheme.colors.border}
              borderRadius={omniTheme.radii.md}
              overflow={'hidden'}
              bg={'white'}
            >
              {datasetTestItem?.results.map((item, index) => (
                <Box
                  as={'article'}
                  key={item.id}
                  position={'relative'}
                  px={[4, 5]}
                  py={4}
                  borderBottom={
                    index < datasetTestItem.results.length - 1 ? '1px solid' : undefined
                  }
                  borderColor={omniTheme.colors.border}
                  bg={'white'}
                  _hover={{ bg: '#FBFCFE' }}
                  sx={{
                    '& pre': {
                      borderRadius: omniTheme.radii.sm,
                      overflowX: 'auto'
                    },
                    '& h1, & h2, & h3': {
                      letterSpacing: 0
                    },
                    '& p': {
                      lineHeight: 1.7
                    }
                  }}
                >
                  <QuoteItem quoteItem={item} canDownloadSource canEditData />
                </Box>
              ))}
            </Box>
          </Box>
        </>
      )}
    </Flex>
  );
});

const ResultMetaItem = ({ children }: { children: React.ReactNode }) => (
  <Flex
    h={'28px'}
    px={2.5}
    alignItems={'center'}
    border={'1px solid'}
    borderColor={omniTheme.colors.border}
    borderRadius={omniTheme.radii.sm}
    bg={'white'}
    color={omniTheme.colors.muted}
    fontSize={'11px'}
    fontWeight={600}
  >
    {children}
  </Flex>
);
