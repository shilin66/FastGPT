import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { type Dispatch, type ReactNode, type SetStateAction, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { createContext, useContextSelector } from 'use-context-selector';
import { DatasetStatusEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { useRequest, useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useDisclosure } from '@chakra-ui/react';
import { checkTeamWebSyncLimit } from '@/web/support/user/team/api';
import { getDatasetCollections, postConfluenceSync, postWebsiteSync } from '@/web/core/dataset/api';
import dynamic from 'next/dynamic';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { type DatasetCollectionsListItemType } from '@/global/core/dataset/type';
import { useRouter } from 'next/router';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { type WebsiteConfigFormType } from './WebsiteConfig';
import type { ConfluenceConfigFormType } from '@/pageComponents/dataset/detail/CollectionCard/ConfluenceConfig';

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

  const { datasetDetail, datasetId, updateDataset, loadDatasetDetail } = useContextSelector(
    DatasetPageContext,
    (v) => v
  );

  // website config
  const { openConfirm: openWebSyncConfirm, ConfirmModal: ConfirmWebSyncModal } = useConfirm({
    content: t('dataset:start_sync_website_tip')
  });
  const syncWebsite = async () => {
    await checkTeamWebSyncLimit();
    postWebsiteSync({ datasetId: datasetId }).then(() => {
      loadDatasetDetail(datasetId);
    });
  };
  const {
    isOpen: isOpenWebsiteModal,
    onOpen: onOpenWebsiteModal,
    onClose: onCloseWebsiteModal
  } = useDisclosure();
  const { runAsync: onUpdateDatasetWebsiteConfig } = useRequest2(
    async (websiteConfig: WebsiteConfigFormType) => {
      await updateDataset({
        id: datasetId,
        websiteConfig: websiteConfig.websiteConfig,
        chunkSettings: websiteConfig.chunkSettings
      });
      await syncWebsite();
    },
    {
      onSuccess() {
        onCloseWebsiteModal();
      }
    }
  );

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
    mutationFn: async (confluenceConfig: ConfluenceConfigFormType) => {
      onCloseConfluenceModal();
      // await checkTeamWebSyncLimit();
      await updateDataset({
        id: datasetId,
        confluenceConfig: confluenceConfig.confluenceConfig,
        chunkSettings: confluenceConfig.chunkSettings,
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
        status: DatasetStatusEnum.error
      });
    },
    errorToast: t('common:update_failed')
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
    openWebSyncConfirm: openWebSyncConfirm(syncWebsite),
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
            />
          )}
          <ConfirmWebSyncModal />
        </>
      )}

      {datasetDetail.type === DatasetTypeEnum.confluenceDataset && (
        <>
          {isOpenConfluenceModal && (
            <ConfluenceConfigModal
              onClose={onCloseConfluenceModal}
              onSuccess={onUpdateDatasetConfluenceConfig}
            />
          )}
          <ConfirmConfluenceSyncModal />
        </>
      )}
    </CollectionPageContext.Provider>
  );
};
export default CollectionPageContextProvider;
