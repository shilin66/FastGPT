'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Flex } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import dynamic from 'next/dynamic';
import PageContainer from '@/components/PageContainer';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import MetaDataCard from '@/pageComponents/dataset/detail/MetaDataCard';
import NavBar from '@/pageComponents/dataset/detail/NavBar';
import MyBox from '@fastgpt/web/components/common/MyBox';
import {
  DatasetPageContext,
  DatasetPageContextProvider
} from '@/web/core/dataset/context/datasetPageContext';
import CollectionPageContextProvider from '@/pageComponents/dataset/detail/CollectionCard/Context';
import { useContextSelector } from 'use-context-selector';
import NextHead from '@/components/common/NextHead';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { omniTheme } from '@/web/common/brand/theme';

const CollectionCard = dynamic(
  () => import('@/pageComponents/dataset/detail/CollectionCard/index')
);
const DataCard = dynamic(() => import('@/pageComponents/dataset/detail/DataCard'));
const Test = dynamic(() => import('@/pageComponents/dataset/detail/Test'));
const Info = dynamic(() => import('@/pageComponents/dataset/detail/Info/index'));
const Import = dynamic(() => import('@/pageComponents/dataset/detail/Import'));

export enum TabEnum {
  dataCard = 'dataCard',
  collectionCard = 'collectionCard',
  test = 'test',
  info = 'info',
  import = 'import'
}
type Props = { datasetId: string; currentTab: TabEnum };

const Detail = ({ datasetId, currentTab }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { isPc } = useSystem();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const loadDatasetDetail = useContextSelector(DatasetPageContext, (v) => v.loadDatasetDetail);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  const showDatasetInfo = [TabEnum.collectionCard, TabEnum.test].includes(currentTab);

  useRequest(() => loadDatasetDetail(datasetId), {
    onError(err: any) {
      router.replace(`/dataset/list`);
      toast({
        title: t(getErrText(err, t('common:load_failed')) as any),
        status: 'error'
      });
    },
    manual: false
  });

  return (
    <>
      <NextHead title={datasetDetail?.name} icon={datasetDetail?.avatar} />

      {isPc ? (
        <Flex
          h={'100%'}
          minW={0}
          bg={omniTheme.colors.surface}
          flexDir={'column'}
          overflow={'hidden'}
        >
          {currentTab !== TabEnum.import && (
            <NavBar
              currentTab={currentTab}
              isInfoOpen={isInfoOpen}
              onToggleInfo={() => setIsInfoOpen((value) => !value)}
            />
          )}
          <Flex flex={1} minH={0}>
            <Box
              flex={1}
              minW={0}
              overflowY={
                [TabEnum.collectionCard, TabEnum.test].includes(currentTab) ? 'hidden' : 'auto'
              }
            >
              {currentTab === TabEnum.collectionCard && (
                <CollectionPageContextProvider>
                  <CollectionCard />
                </CollectionPageContextProvider>
              )}
              {currentTab === TabEnum.test && <Test datasetId={datasetId} />}
              {currentTab === TabEnum.dataCard && <DataCard />}
              {currentTab === TabEnum.import && <Import />}
            </Box>

            {currentTab === TabEnum.dataCard && (
              <Flex
                flex={'0 0 20rem'}
                minW={0}
                overflowY={'auto'}
                borderLeft={'1px solid'}
                borderColor={omniTheme.colors.border}
                bg={omniTheme.colors.surface}
              >
                <MetaDataCard datasetId={datasetId} />
              </Flex>
            )}
            {showDatasetInfo && (
              <Flex
                display={isInfoOpen ? 'flex' : 'none'}
                flex={'0 0 clamp(360px, 22vw, 400px)'}
                minW={0}
                overflow={'hidden'}
                borderLeftWidth={'1px'}
                borderLeftStyle={'solid'}
                borderLeftColor={omniTheme.colors.border}
                bg={omniTheme.colors.pageBg}
              >
                <Info datasetId={datasetId} onClose={() => setIsInfoOpen(false)} />
              </Flex>
            )}
          </Flex>
        </Flex>
      ) : (
        <PageContainer insertProps={{ bg: 'white' }}>
          <MyBox display={'flex'} flexDirection={'column'} h={'100%'} pt={1}>
            <NavBar currentTab={currentTab} />

            {!!datasetDetail._id && (
              <Box flex={'1 0 0'} pb={0} overflow={'auto'}>
                {currentTab === TabEnum.collectionCard && (
                  <CollectionPageContextProvider>
                    <CollectionCard />
                  </CollectionPageContextProvider>
                )}
                {currentTab === TabEnum.dataCard && <DataCard />}
                {currentTab === TabEnum.test && <Test datasetId={datasetId} />}
                {currentTab === TabEnum.info && <Info datasetId={datasetId} />}
                {currentTab === TabEnum.import && <Import />}
              </Box>
            )}
          </MyBox>
        </PageContainer>
      )}
    </>
  );
};

const Render = (data: Props) => (
  <DatasetPageContextProvider datasetId={data.datasetId}>
    <Detail {...data} />
  </DatasetPageContextProvider>
);
export default Render;

export async function getServerSideProps(context: any) {
  const currentTab = context?.query?.currentTab || TabEnum.collectionCard;
  const datasetId = context?.query?.datasetId;

  return {
    props: {
      currentTab,
      datasetId,
      ...(await serviceSideProps(context, ['dataset', 'file', 'user']))
    }
  };
}
