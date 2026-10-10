import React, { useMemo, useState, useCallback } from 'react';
import {
  Flex,
  Box,
  Button,
  ModalBody,
  ModalFooter,
  Grid,
  Checkbox,
  VStack,
  IconButton,
  useDisclosure
} from '@chakra-ui/react';
import { ChevronRightIcon, CloseIcon } from '@chakra-ui/icons';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { DatasetListItemType } from '@fastgpt/global/core/dataset/type';
import type { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { useTranslation } from 'next-i18next';
import { ResourceSelectModal } from './ResourceSelectModal';
import { omniTheme } from '@/web/common/brand/theme';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useDatasetSelect } from '@/components/core/dataset/SelectModal';
import FolderPath from '@/components/common/folder/Path';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import QuickCreateDatasetModal from '@/pageComponents/app/detail/components/QuickCreateDatasetModal';
import { useUserStore } from '@/web/support/user/useUserStore';

// Dataset selection modal component
export const DatasetSelectModal = ({
  defaultSelectedDatasets = [],
  onChange,
  onClose
}: {
  defaultSelectedDatasets: SelectedDatasetType[];
  onChange: (e: SelectedDatasetType[]) => void;
  onClose: () => void;
}) => {
  // Translation function
  const { t } = useTranslation();
  // Current selected datasets, initialized with defaultSelectedDatasets
  const [selectedDatasets, setSelectedDatasets] =
    useState<SelectedDatasetType[]>(defaultSelectedDatasets);
  const { toast } = useToast();
  const { userInfo } = useUserStore();

  // Use server-side search, following the logic of the dataset list page
  const {
    paths,
    parentId,
    setParentId,
    searchKey,
    setSearchKey,
    datasets,
    isFetching,
    loadDatasets
  } = useDatasetSelect();

  // The vector model of the first selected dataset
  const activeVectorModel = selectedDatasets[0]?.vectorModel?.model;

  // Check if a dataset is selected
  const isDatasetSelected = useCallback(
    (datasetId: string) => {
      return selectedDatasets.some((dataset) => dataset.datasetId === datasetId);
    },
    [selectedDatasets]
  );

  // Check if a dataset is disabled (vector model mismatch)
  const isDatasetDisabled = (item: DatasetListItemType) => {
    return !!activeVectorModel && activeVectorModel !== item.vectorModel.model;
  };

  // Cache compatible datasets by vector model to avoid repeated filtering
  const compatibleDatasetsByModel = useMemo(() => {
    const visibleDatasets = datasets.filter(
      (item: DatasetListItemType) => item.type !== DatasetTypeEnum.folder
    );

    const targetModel = activeVectorModel || visibleDatasets[0]?.vectorModel?.model;
    if (!targetModel) {
      return [];
    }

    return visibleDatasets.filter(
      (item: DatasetListItemType) => item.vectorModel.model === targetModel
    );
  }, [datasets, activeVectorModel]);

  // Check if all compatible datasets are selected
  const isAllSelected = useMemo(() => {
    if (compatibleDatasetsByModel.length === 0) {
      return false;
    }

    const selectedDatasetIds = new Set(selectedDatasets.map((dataset) => dataset.datasetId));
    return compatibleDatasetsByModel.every((item: DatasetListItemType) =>
      selectedDatasetIds.has(item._id)
    );
  }, [compatibleDatasetsByModel, selectedDatasets]);

  const onSelect = (item: DatasetListItemType, checked: boolean) => {
    if (checked) {
      if (isDatasetDisabled(item)) {
        return toast({
          status: 'warning',
          title: t('app:dataset.Select_dataset_model_tip')
        });
      }
      setSelectedDatasets((prev) => [
        ...prev,
        {
          datasetId: item._id,
          avatar: item.avatar,
          name: item.name,
          vectorModel: item.vectorModel
        }
      ]);
    } else {
      setSelectedDatasets((prev) => prev.filter((dataset) => dataset.datasetId !== item._id));
    }
  };

  const {
    isOpen: isQuickCreateOpen,
    onOpen: onOpenQuickCreate,
    onClose: onCloseQuickCreate
  } = useDisclosure();
  const isRootEmpty = useMemo(() => {
    return datasets.length === 0 && paths.length === 0 && !searchKey && !isFetching;
  }, [datasets.length, isFetching, paths.length, searchKey]);

  const onToggleAll = (checked: boolean) => {
    if (checked) {
      const newSelections = compatibleDatasetsByModel
        .filter((item) => !isDatasetSelected(item._id))
        .map((item) => ({
          datasetId: item._id,
          avatar: item.avatar,
          name: item.name,
          vectorModel: item.vectorModel
        }));
      setSelectedDatasets((prev) => [...prev, ...newSelections]);
    } else {
      const ids = new Set(compatibleDatasetsByModel.map((item) => item._id));
      setSelectedDatasets((prev) => prev.filter((item) => !ids.has(item.datasetId)));
    }
  };

  return (
    <ResourceSelectModal
      iconSrc="/imgs/workflow/db.png"
      title={t('common:core.chat.Select dataset')}
      description={t('app:resource_dataset_hint')}
      onClose={onClose}
      h={'min(780px, calc(100dvh - 64px))'}
      isLoading={isFetching}
    >
      <Flex direction={'column'} flex={1} minH={0} overflow={'hidden'}>
        <Box
          px={5}
          py={3}
          bg={omniTheme.colors.surface}
          borderBottom={'1px solid'}
          borderColor={omniTheme.colors.border}
        >
          <SearchInput
            placeholder={t('app:Search_dataset')}
            aria-label={String(t('app:Search_dataset'))}
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value?.trim())}
          />
        </Box>
        <ModalBody p={0} flex={1} minH={0} overflow={'hidden'}>
          {isRootEmpty ? (
            <VStack h={'full'} justifyContent={'center'}>
              <EmptyTip text={t('app:dataset_empty_tips')} py={4} />
              {userInfo?.team?.permission.hasDatasetCreatePer && (
                <Button onClick={onOpenQuickCreate}>{t('common:Create')}</Button>
              )}
            </VStack>
          ) : (
            <Grid
              gridTemplateColumns={{
                base: 'minmax(0, 1fr)',
                md: 'minmax(0, 1fr) 300px'
              }}
              gridTemplateRows={{ base: 'minmax(0, 1fr) minmax(0, 0.6fr)', md: 'minmax(0, 1fr)' }}
              h={'full'}
              overflow={'hidden'}
            >
              <Flex direction={'column'} minH={0} overflow={'hidden'} bg={omniTheme.colors.surface}>
                <Flex
                  px={5}
                  py={2}
                  align={'center'}
                  minH={10}
                  fontSize={'sm'}
                  color={omniTheme.colors.muted}
                >
                  {searchKey ? (
                    t('chat:search_results')
                  ) : (
                    <FolderPath
                      paths={paths.map((path: ParentTreePathItemType) => ({
                        parentId: path.parentId,
                        parentName: path.parentName
                      }))}
                      FirstPathDom={t('common:root_folder')}
                      onClick={(id) => setParentId(id)}
                    />
                  )}
                </Flex>
                <VStack
                  align={'stretch'}
                  spacing={0}
                  px={4}
                  pb={4}
                  flex={1}
                  minH={0}
                  overflowY={'auto'}
                >
                  {datasets.length === 0 && !isFetching && (
                    <EmptyTip
                      text={searchKey ? t('app:resource_no_results') : t('common:folder.empty')}
                      py={12}
                    />
                  )}
                  {datasets.map((item: DatasetListItemType) => {
                    const isFolder = item.type === DatasetTypeEnum.folder;
                    const selected = isDatasetSelected(item._id);
                    const content = (
                      <Flex align={'center'} gap={3} minW={0} w={'full'} textAlign={'left'}>
                        <Avatar
                          src={item.avatar}
                          w={6}
                          h={6}
                          borderRadius={omniTheme.radii.sm}
                          flexShrink={0}
                        />
                        <Box flex={1} minW={0}>
                          <Box
                            title={item.name}
                            fontSize={'13px'}
                            fontWeight={500}
                            className={'textEllipsis'}
                            color={omniTheme.colors.graphite}
                            lineHeight={1.5}
                          >
                            {item.name}
                          </Box>
                          <Box
                            mt={0.5}
                            fontSize={'xs'}
                            color={omniTheme.colors.muted}
                            lineHeight={1.5}
                          >
                            {isFolder
                              ? t('common:Folder')
                              : `${t('app:Index')}: ${item.vectorModel.name}`}
                          </Box>
                        </Box>
                        {isFolder && <ChevronRightIcon w={5} color={omniTheme.colors.muted} />}
                      </Flex>
                    );
                    return isFolder ? (
                      <Button
                        key={item._id}
                        variant={'ghost'}
                        h={'auto'}
                        px={3}
                        py={2}
                        whiteSpace={'normal'}
                        borderBottomWidth={'1px'}
                        borderColor={'myGray.100'}
                        borderRadius={0}
                        onClick={() => {
                          setSearchKey('');
                          setParentId(item._id);
                        }}
                      >
                        {content}
                      </Button>
                    ) : (
                      <Checkbox
                        key={item._id}
                        aria-label={item.name}
                        isChecked={selected}
                        isDisabled={isDatasetDisabled(item)}
                        onChange={(e) => onSelect(item, e.target.checked)}
                        colorScheme={'blue'}
                        size={'md'}
                        px={3}
                        py={2}
                        minH={'52px'}
                        w={'full'}
                        borderBottomWidth={'1px'}
                        borderColor={'myGray.100'}
                        bg={selected ? 'primary.50' : omniTheme.colors.surface}
                        borderRadius={omniTheme.radii.sm}
                        _hover={{ bg: selected ? 'primary.50' : omniTheme.colors.pageBg }}
                        sx={{ '.chakra-checkbox__label': { flex: 1, minWidth: 0, marginLeft: 3 } }}
                      >
                        {content}
                      </Checkbox>
                    );
                  })}
                </VStack>
                {datasets.length > 0 && (
                  <Flex
                    px={5}
                    py={2.5}
                    borderTopWidth={'1px'}
                    borderColor={omniTheme.colors.border}
                  >
                    <Checkbox
                      colorScheme={'blue'}
                      isChecked={isAllSelected}
                      isDisabled={compatibleDatasetsByModel.length === 0}
                      onChange={(e) => onToggleAll(e.target.checked)}
                    >
                      <Box fontSize={'sm'}>{t('common:Select_all')}</Box>
                    </Checkbox>
                  </Flex>
                )}
              </Flex>
              <Flex
                direction={'column'}
                minH={0}
                overflow={'hidden'}
                borderLeftWidth={{ base: 0, md: '1px' }}
                borderTopWidth={{ base: '1px', md: 0 }}
                borderColor={omniTheme.colors.border}
                bg={omniTheme.colors.pageBg}
              >
                <Flex px={4} py={3} align={'center'} justify={'space-between'}>
                  <Box fontSize={'sm'} fontWeight={600} color={omniTheme.colors.graphite}>
                    {t('app:Selected')}
                  </Box>
                  <Box
                    role={'status'}
                    px={2}
                    py={0.5}
                    bg={'primary.50'}
                    color={'primary.700'}
                    borderRadius={omniTheme.radii.sm}
                    fontSize={'sm'}
                  >
                    {selectedDatasets.length}
                  </Box>
                </Flex>
                <VStack
                  align={'stretch'}
                  spacing={0}
                  flex={1}
                  minH={0}
                  overflowY={'auto'}
                  px={3}
                  pb={3}
                >
                  {selectedDatasets.length === 0 ? (
                    <Flex
                      direction={'column'}
                      align={'center'}
                      textAlign={'center'}
                      gap={2}
                      mt={12}
                      px={4}
                    >
                      <MyIcon
                        name={'core/dataset/commonDatasetOutline'}
                        w={7}
                        color={'myGray.400'}
                        mb={1}
                      />
                      <Box fontSize={'sm'} color={omniTheme.colors.muted}>
                        {t('app:No_selected_dataset')}
                      </Box>
                      <Box fontSize={'xs'} lineHeight={1.7} color={omniTheme.colors.muted}>
                        {t('app:resource_selection_empty')}
                      </Box>
                    </Flex>
                  ) : (
                    selectedDatasets.map((item) => (
                      <Flex
                        key={item.datasetId}
                        px={2}
                        py={3}
                        gap={2}
                        align={'center'}
                        borderBottomWidth={'1px'}
                        borderColor={omniTheme.colors.border}
                      >
                        <Avatar
                          src={item.avatar}
                          w={6}
                          h={6}
                          borderRadius={omniTheme.radii.sm}
                          flexShrink={0}
                        />
                        <Box flex={1} minW={0}>
                          <Box
                            title={item.name}
                            className={'textEllipsis'}
                            fontSize={'13px'}
                            fontWeight={500}
                            lineHeight={1.5}
                            color={omniTheme.colors.graphite}
                          >
                            {item.name}
                          </Box>
                          <Box
                            fontSize={'xs'}
                            color={omniTheme.colors.muted}
                            mt={0.5}
                            lineHeight={1.5}
                          >
                            {datasets.find((candidate) => candidate._id === item.datasetId)
                              ?.vectorModel?.name || item.vectorModel?.model}
                          </Box>
                        </Box>
                        <IconButton
                          aria-label={String(
                            t('app:agent_config_dataset_remove', { name: item.name })
                          )}
                          title={String(t('app:agent_config_dataset_remove', { name: item.name }))}
                          icon={<CloseIcon w={2.5} />}
                          size={'xs'}
                          variant={'ghost'}
                          flexShrink={0}
                          color={omniTheme.colors.muted}
                          _hover={{ bg: 'red.50', color: 'red.600' }}
                          onClick={() =>
                            setSelectedDatasets((prev) =>
                              prev.filter((dataset) => dataset.datasetId !== item.datasetId)
                            )
                          }
                        />
                      </Flex>
                    ))
                  )}
                </VStack>
              </Flex>
            </Grid>
          )}
        </ModalBody>
        <ModalFooter justifyContent={'space-between'} flexWrap={'wrap'}>
          {userInfo?.team?.permission.hasDatasetCreatePer ? (
            <Button
              variant={'whiteBase'}
              size={'sm'}
              onClick={onOpenQuickCreate}
              leftIcon={<MyIcon name={'common/addLight'} w={4} />}
            >
              {t('common:new_create')}
            </Button>
          ) : (
            <Box />
          )}
          <Box ml={'auto'} fontSize={'sm'} color={omniTheme.colors.muted} role={'status'}>
            {t('common:selected_count', { count: selectedDatasets.length })}
          </Box>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          {!isRootEmpty && (
            <Button
              onClick={() => {
                onChange(selectedDatasets);
                onClose();
              }}
            >
              {t('common:Confirm')}
            </Button>
          )}
        </ModalFooter>
      </Flex>

      {isQuickCreateOpen && (
        <QuickCreateDatasetModal
          parentId={parentId}
          onClose={onCloseQuickCreate}
          onSuccess={(newDataset) => {
            setSelectedDatasets((prev) => [...prev, newDataset]);
            loadDatasets();
          }}
        />
      )}
    </ResourceSelectModal>
  );
};

export default DatasetSelectModal;
