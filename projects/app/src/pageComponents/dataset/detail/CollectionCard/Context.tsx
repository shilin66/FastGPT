import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { Dispatch, ReactNode, SetStateAction, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { createContext, useContextSelector } from 'use-context-selector';
import {
  DatasetStatusEnum,
  DatasetTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { useDisclosure } from '@chakra-ui/react';
import { checkTeamWebSyncLimit } from '@/web/support/user/team/api';
import { postCreateTrainingUsage } from '@/web/support/wallet/usage/api';
import { getDatasetCollections, postConfluenceSync, postWebsiteSync } from '@/web/core/dataset/api';
import dynamic from 'next/dynamic';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { DatasetCollectionsListItemType } from '@/global/core/dataset/type';
import { useRouter } from 'next/router';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { ImportProcessWayEnum } from '@/web/core/dataset/constants';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import DatasetImportContextProvider from '@/pageComponents/dataset/detail/Import/Context';

const WebSiteConfigModal = dynamic(() => import('./WebsiteConfig'));
const ConfluenceConfigModal = dynamic(() => import('./ConfluenceConfig'));

type CollectionPageContextType = {
  openWebSyncConfirm: () => void;
  onOpenWebsiteModal: () => void;
  openConfluenceSyncConfirm: () => void;
  onOpenConfluenceModal: () => void;
  collections: DatasetCollectionsListItemType[];
  Pagination: () => JSX.Element;
  total: number;
  getData: (e: number) => void;
  isGetting: boolean;
  pageNum: number;
  pageSize: number;
  searchText: string;
  setSearchText: Dispatch<SetStateAction<string>>;
  filterTags: string[];
  setFilterTags: Dispatch<SetStateAction<string[]>>;
};

export const CollectionPageContext = createContext<CollectionPageContextType>({
  openWebSyncConfirm: function (): () => void {
    throw new Error('Function not implemented.');
  },
  onOpenWebsiteModal: function (): void {
    throw new Error('Function not implemented.');
  },
  openConfluenceSyncConfirm: function (): () => void {
    throw new Error('Function not implemented.');
  },
  onOpenConfluenceModal: function (): void {
    throw new Error('Function not implemented.');
  },
  collections: [],
  Pagination: function (): JSX.Element {
    throw new Error('Function not implemented.');
  },
  total: 0,
  getData: function (e: number): void {
    throw new Error('Function not implemented.');
  },
  isGetting: false,
  pageNum: 0,
  pageSize: 0,
  searchText: '',
  setSearchText: function (value: SetStateAction<string>): void {
    throw new Error('Function not implemented.');
  },
  filterTags: [],
  setFilterTags: function (value: SetStateAction<string[]>): void {
    throw new Error('Function not implemented.');
  }
});

const CollectionPageContextProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { parentId = '' } = router.query as { parentId: string };

  const { datasetDetail, datasetId, updateDataset } = useContextSelector(
    DatasetPageContext,
    (v) => v
  );

  // website config
  const { openConfirm: openWebSyncConfirm, ConfirmModal: ConfirmWebSyncModal } = useConfirm({
    content: t('dataset:start_sync_website_tip')
  });
  const {
    isOpen: isOpenWebsiteModal,
    onOpen: onOpenWebsiteModal,
    onClose: onCloseWebsiteModal
  } = useDisclosure();
  const { mutate: onUpdateDatasetWebsiteConfig } = useRequest({
    mutationFn: async (websiteConfig: DatasetSchemaType['websiteConfig']) => {
      onCloseWebsiteModal();
      await checkTeamWebSyncLimit();
      await updateDataset({
        id: datasetId,
        websiteConfig,
        status: DatasetStatusEnum.syncing
      });
      const billId = await postCreateTrainingUsage({
        name: t('common:core.dataset.training.Website Sync'),
        datasetId: datasetId
      });
      await postWebsiteSync({ datasetId: datasetId, billId });

      return;
    },
    errorToast: t('common:common.Update Failed')
  });

  // confluence config
  const { openConfirm: openConfluenceSyncConfirm, ConfirmModal: ConfirmConfluenceSyncModal } =
    useConfirm({
      content: t('common:core.dataset.collection.Start Sync Tip')
    });
  const {
    isOpen: isOpenConfluenceModal,
    onOpen: onOpenConfluenceModal,
    onClose: onCloseConfluenceModal
  } = useDisclosure();
  const { mutate: onUpdateDatasetConfluenceConfig } = useRequest({
    mutationFn: async (confluenceConfig: DatasetSchemaType['confluenceConfig']) => {
      onCloseConfluenceModal();
      // await checkTeamWebSyncLimit();
      await updateDataset({
        id: datasetId,
        confluenceConfig,
        status: DatasetStatusEnum.syncing
      });
      // const billId = await postCreateTrainingUsage({
      //   name: t('common:core.dataset.training.Confluence Sync'),
      //   datasetId
      // })
      await postConfluenceSync({ datasetId });

      return;
    },
    onError: async (e) => {
      await updateDataset({
        id: datasetId,
        status: DatasetStatusEnum.active
      });
    },
    errorToast: t('common:common.Update Failed')
  });

  // collection list
  const [searchText, setSearchText] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const {
    data: collections,
    Pagination,
    total,
    getData,
    isLoading: isGetting,
    pageNum,
    pageSize
  } = usePagination(getDatasetCollections, {
    pageSize: 20,
    params: {
      datasetId,
      parentId,
      searchText,
      filterTags
    },
    // defaultRequest: false,
    refreshDeps: [parentId, searchText, filterTags]
  });

  const contextValue: CollectionPageContextType = {
    openWebSyncConfirm: openWebSyncConfirm(onUpdateDatasetWebsiteConfig),
    onOpenWebsiteModal,
    openConfluenceSyncConfirm: openConfluenceSyncConfirm(onUpdateDatasetConfluenceConfig),
    onOpenConfluenceModal,

    searchText,
    setSearchText,
    filterTags,
    setFilterTags,
    collections,
    Pagination,
    total,
    getData,
    isGetting,
    pageNum,
    pageSize
  };

  return (
    <CollectionPageContext.Provider value={contextValue}>
      {children}
      {datasetDetail.type === DatasetTypeEnum.websiteDataset && (
        <>
          {isOpenWebsiteModal && (
            <WebSiteConfigModal
              onClose={onCloseWebsiteModal}
              onSuccess={onUpdateDatasetWebsiteConfig}
              defaultValue={{
                url: datasetDetail?.websiteConfig?.url,
                selector: datasetDetail?.websiteConfig?.selector
              }}
            />
          )}
          <ConfirmWebSyncModal />
        </>
      )}

      {datasetDetail.type === DatasetTypeEnum.confluenceDataset && (
        <>
          {isOpenConfluenceModal && (
            <DatasetImportContextProvider>
              <ConfluenceConfigModal
                onClose={onCloseConfluenceModal}
                onSuccess={onUpdateDatasetConfluenceConfig}
                defaultValue={{
                  spaceKey: datasetDetail!.confluenceConfig?.spaceKey ?? '',
                  pageId: datasetDetail!.confluenceConfig?.pageId,
                  syncSubPages: datasetDetail!.confluenceConfig?.syncSubPages,
                  syncSchedule: datasetDetail!.confluenceConfig?.syncSchedule,
                  mode: datasetDetail!.confluenceConfig?.mode ?? TrainingModeEnum.chunk,
                  way: datasetDetail!.confluenceConfig!?.way ?? ImportProcessWayEnum.auto,
                  chunkSize: datasetDetail!.confluenceConfig?.chunkSize ?? 500,
                  chunkSplitter: datasetDetail!.confluenceConfig?.chunkSplitter || '',
                  qaPrompt: datasetDetail!.confluenceConfig?.qaPrompt || Prompt_AgentQA.description
                }}
              />
            </DatasetImportContextProvider>
          )}
          <ConfirmConfluenceSyncModal />
        </>
      )}
    </CollectionPageContext.Provider>
  );
};
export default CollectionPageContextProvider;
