import React, { useState, useRef, useMemo } from 'react';
import {
  Box,
  Flex,
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Td,
  Tbody,
  MenuButton,
  Switch,
  Checkbox,
  HStack,
  Button
} from '@chakra-ui/react';
import {
  delDatasetCollectionById,
  putDatasetCollectionById,
  postLinkCollectionSync
} from '@/web/core/dataset/api/collection';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useRouter } from 'next/router';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import {
  DatasetCollectionTypeEnum,
  DatasetStatusEnum,
  DatasetCollectionSyncResultMap,
  DatasetCollectionDataProcessModeMap,
  DatasetTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';
import { TabEnum } from '../../../../pages/dataset/detail/index';
import dynamic from 'next/dynamic';
import SelectCollections from '@/web/core/dataset/components/SelectCollections';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import type { DatasetCollectionSyncResultEnum } from '@fastgpt/global/core/dataset/constants';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useContextSelector } from 'use-context-selector';
import { CollectionPageContext } from './Context';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { collectionCanSync } from '@fastgpt/global/core/dataset/collection/utils';
import { useFolderDrag } from '@/components/common/folder/useFolderDrag';
import TagsPopOver from './TagsPopOver';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import TrainingStates from './TrainingStates';
import { useTableMultipleSelect } from '@fastgpt/web/hooks/useTableMultipleSelect';
import { omniTheme } from '@/web/common/brand/theme';

const Header = dynamic(() => import('./Header'));
const EmptyCollectionTip = dynamic(() => import('./EmptyCollectionTip'));

const CollectionCard = () => {
  const BoxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { datasetDetail, loadDatasetDetail } = useContextSelector(DatasetPageContext, (v) => v);
  const { feConfigs } = useSystemStore();

  const [trainingStatesCollection, setTrainingStatesCollection] = useState<{
    collectionId: string;
  }>();

  const { collections, Pagination, total, getData, isGetting, pageNum, pageSize } =
    useContextSelector(CollectionPageContext, (v) => v);

  // Add file status icon
  const formatCollections = useMemo(
    () =>
      collections.map((collection) => {
        const icon = getCollectionIcon({ type: collection.type, name: collection.name });
        const status = (() => {
          if (collection.hasError) {
            return {
              statusText: t('common:core.dataset.collection.status.error'),
              statusColor: '#DC2626'
            };
          }
          if (collection.trainingAmount > 0) {
            return {
              statusText: t('common:dataset.collections.Collection Embedding', {
                total: collection.trainingAmount
              }),
              statusColor: omniTheme.colors.saturatedBlue
            };
          }
          return {
            statusText: t('common:core.dataset.collection.status.active'),
            statusColor: '#0F9F6E'
          };
        })();

        return {
          ...collection,
          icon,
          ...status
        };
      }),
    [collections, t]
  );

  const {
    selectedItems,
    toggleSelect,
    isSelected,
    setSelectedItems,
    FloatingActionBar,
    isSelecteAll,
    selectAllTrigger
  } = useTableMultipleSelect({
    list: formatCollections,
    getItemId: (e) => e._id
  });

  const [moveCollectionData, setMoveCollectionData] = useState<{ collectionId: string }>();

  const { onOpenModal: onOpenEditTitleModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('common:Rename')
  });
  const { runAsync: onUpdateCollection, loading: isUpdating } = useRequest(
    putDatasetCollectionById,
    {
      onSuccess() {
        getData(pageNum);
      },
      successToast: t('common:update_success')
    }
  );

  const { openConfirm: openDeleteConfirm, ConfirmModal: ConfirmDeleteModal } = useConfirm({
    content: t('common:dataset.Confirm to delete the file'),
    type: 'delete'
  });
  const { runAsync: onDelCollection } = useRequest(
    (collectionIds: string[]) => {
      return delDatasetCollectionById({
        collectionIds
      });
    },
    {
      onSuccess() {
        getData(pageNum);
      },
      successToast: t('common:delete_success'),
      errorToast: t('common:delete_failed')
    }
  );

  const { openConfirm: openSyncConfirm, ConfirmModal: ConfirmSyncModal } = useConfirm({
    content: t('dataset:collection_sync_confirm_tip')
  });
  const { runAsync: onclickStartSync, loading: isSyncing } = useRequest(postLinkCollectionSync, {
    onSuccess(res: DatasetCollectionSyncResultEnum) {
      getData(pageNum);
      toast({
        status: 'success',
        title: t(DatasetCollectionSyncResultMap[res]?.label as any)
      });
    },
    errorToast: t('common:core.dataset.error.Start Sync Failed')
  });

  const hasTrainingData = useMemo(
    () => !!formatCollections.find((item) => item.trainingAmount > 0),
    [formatCollections]
  );

  useRequest(
    async () => {
      if (datasetDetail.status !== DatasetStatusEnum.active) {
        loadDatasetDetail(datasetDetail._id);
      }
      if (hasTrainingData) {
        getData(pageNum);
      }
    },
    {
      pollingInterval: 6000,
      manual: false
    }
  );

  const { getBoxProps, isDropping } = useFolderDrag({
    activeStyles: {
      bg: 'primary.100'
    },
    onDrop: async (dragId: string, targetId: string) => {
      try {
        await putDatasetCollectionById({
          id: dragId,
          parentId: targetId
        });
        getData(pageNum);
      } catch (error) {}
    }
  });

  const isLoading = isUpdating || isSyncing || isGetting || isDropping;

  return (
    <MyBox isLoading={isLoading} h={'100%'} overflow={'hidden'} bg={omniTheme.colors.surface}>
      <Flex ref={BoxRef} flexDirection={'column'} h={'100%'}>
        {/* header */}
        <Header hasTrainingData={hasTrainingData} />

        {/* collection table */}
        <TableContainer overflow={'auto'} fontSize={'sm'} flex={'1 0 0'} h={0}>
          <Table variant={'simple'} draggable={false} minW={'900px'} sx={{ tableLayout: 'fixed' }}>
            <Thead
              draggable={false}
              position={'sticky'}
              top={0}
              zIndex={1}
              bg={omniTheme.colors.pageBg}
            >
              <Tr h={'40px'}>
                <Th px={4} py={0} w={'34%'} borderColor={omniTheme.colors.border}>
                  <HStack>
                    <Checkbox isChecked={isSelecteAll} onChange={selectAllTrigger} />
                    <Box>{t('common:Name')}</Box>
                  </HStack>
                </Th>
                <Th px={4} py={0} w={'18%'} borderColor={omniTheme.colors.border}>
                  {t('dataset:collection_data_count')}
                </Th>
                <Th px={4} py={0} w={'20%'} borderColor={omniTheme.colors.border}>
                  {t('dataset:collection.Create update time')}
                </Th>
                <Th px={4} py={0} w={'16%'} borderColor={omniTheme.colors.border}>
                  {t('common:Status')}
                </Th>
                <Th px={4} py={0} w={'8%'} borderColor={omniTheme.colors.border}>
                  {t('dataset:Enable')}
                </Th>
                <Th px={2} py={0} w={'48px'} borderColor={omniTheme.colors.border} />
              </Tr>
            </Thead>
            <Tbody>
              {formatCollections.map((collection) => (
                <Tr
                  key={collection._id}
                  h={'64px'}
                  borderBottom={'1px solid'}
                  borderColor={omniTheme.colors.border}
                  _hover={{ bg: '#F7FAFF' }}
                  cursor={'pointer'}
                  {...getBoxProps({
                    dataId: collection._id,
                    isFolder: collection.type === DatasetCollectionTypeEnum.folder
                  })}
                  draggable={false}
                  onClick={() => {
                    if (collection.type === DatasetCollectionTypeEnum.folder) {
                      router.push({
                        query: {
                          datasetId: datasetDetail._id,
                          parentId: collection._id
                        }
                      });
                    } else {
                      router.push({
                        query: {
                          datasetId: datasetDetail._id,
                          collectionId: collection._id,
                          currentTab: TabEnum.dataCard
                        }
                      });
                    }
                  }}
                >
                  <Td px={4} py={2} draggable borderColor={omniTheme.colors.border}>
                    <HStack spacing={3} minW={0}>
                      <HStack onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          isChecked={isSelected(collection)}
                          onChange={(e) => toggleSelect(collection)}
                        />
                      </HStack>
                      <Flex
                        w={'32px'}
                        h={'32px'}
                        align={'center'}
                        justify={'center'}
                        borderRadius={omniTheme.radii.sm}
                        bg={omniTheme.colors.sidebarBg}
                        flexShrink={0}
                      >
                        <MyIcon name={collection.icon as any} w={'18px'} />
                      </Flex>
                      <Box minW={0}>
                        <Flex alignItems={'center'} minW={0}>
                          <MyTooltip label={t('common:click_drag_tip')} shouldWrapChildren={false}>
                            <Box
                              color={omniTheme.colors.text}
                              fontWeight={650}
                              className="textEllipsis"
                            >
                              {collection.name}
                            </Box>
                          </MyTooltip>
                        </Flex>
                        {feConfigs?.isPlus && !!collection.tags?.length && (
                          <TagsPopOver currentCollection={collection} hoverBg={'white'} />
                        )}
                      </Box>
                    </HStack>
                  </Td>
                  <Td px={4} py={2} borderColor={omniTheme.colors.border}>
                    <Box fontWeight={700} color={omniTheme.colors.text}>
                      {collection.dataAmount || '-'}
                    </Box>
                    <Box mt={0.5} fontSize={'11px'} color={omniTheme.colors.muted}>
                      {collection.trainingType
                        ? t(
                            (DatasetCollectionDataProcessModeMap[collection.trainingType]?.label ||
                              '-') as any
                          )
                        : '-'}
                    </Box>
                  </Td>
                  <Td px={4} py={2} fontSize={'11px'} color={omniTheme.colors.muted}>
                    <Box>{formatTime2YMDHM(collection.updateTime)}</Box>
                    <Box mt={0.5}>{formatTime2YMDHM(collection.createTime)}</Box>
                  </Td>
                  <Td px={4} py={2} borderColor={omniTheme.colors.border}>
                    <MyTooltip label={t('common:Click_to_expand')}>
                      <Flex
                        display={'inline-flex'}
                        align={'center'}
                        gap={2}
                        color={collection.statusColor}
                        fontSize={'12px'}
                        fontWeight={650}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTrainingStatesCollection({ collectionId: collection._id });
                        }}
                      >
                        <Box
                          w={'6px'}
                          h={'6px'}
                          borderRadius={'50%'}
                          bg={collection.statusColor}
                          flexShrink={0}
                        />
                        <Box className={'textEllipsis'}>{t(collection.statusText as any)}</Box>
                        <MyIcon name={'common/maximize'} w={'10px'} flexShrink={0} />
                      </Flex>
                    </MyTooltip>
                  </Td>
                  <Td
                    px={4}
                    py={2}
                    borderColor={omniTheme.colors.border}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Switch
                      isChecked={!collection.forbid}
                      size={'sm'}
                      onChange={(e) =>
                        onUpdateCollection({
                          id: collection._id,
                          forbid: !e.target.checked
                        })
                      }
                    />
                  </Td>
                  <Td
                    px={2}
                    py={2}
                    borderColor={omniTheme.colors.border}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {collection.permission.hasWritePer && (
                      <MyMenu
                        width={100}
                        offset={[-70, 5]}
                        Button={
                          <MenuButton
                            w={'1.5rem'}
                            h={'1.5rem'}
                            borderRadius={'md'}
                            _hover={{
                              color: 'primary.500',
                              '& .icon': {
                                bg: 'myGray.200'
                              }
                            }}
                          >
                            <MyIcon
                              className="icon"
                              name={'more'}
                              h={'1rem'}
                              w={'1rem'}
                              px={1}
                              py={1}
                              borderRadius={'md'}
                              cursor={'pointer'}
                            />
                          </MenuButton>
                        }
                        menuList={[
                          {
                            children: [
                              ...(collectionCanSync(collection.type)
                                ? [
                                    {
                                      label: (
                                        <Flex alignItems={'center'}>
                                          <MyIcon
                                            name={'common/refreshLight'}
                                            w={'0.9rem'}
                                            mr={2}
                                          />
                                          {t('dataset:collection_sync')}
                                        </Flex>
                                      ),
                                      onClick: () =>
                                        openSyncConfirm({
                                          onConfirm: () => {
                                            onclickStartSync(collection._id);
                                          }
                                        })()
                                    }
                                  ]
                                : []),
                              {
                                label: (
                                  <Flex alignItems={'center'}>
                                    <MyIcon name={'common/file/move'} w={'0.9rem'} mr={2} />
                                    {t('common:Move')}
                                  </Flex>
                                ),
                                onClick: () =>
                                  setMoveCollectionData({ collectionId: collection._id })
                              },
                              {
                                label: (
                                  <Flex alignItems={'center'}>
                                    <MyIcon name={'edit'} w={'0.9rem'} mr={2} />
                                    {t('common:Rename')}
                                  </Flex>
                                ),
                                onClick: () =>
                                  onOpenEditTitleModal({
                                    defaultVal: collection.name,
                                    onSuccess: (newName) =>
                                      onUpdateCollection({
                                        id: collection._id,
                                        name: newName
                                      })
                                  })
                              }
                            ]
                          },
                          {
                            children: [
                              {
                                label: (
                                  <Flex alignItems={'center'}>
                                    <MyIcon
                                      mr={1}
                                      name={'delete'}
                                      w={'0.9rem'}
                                      _hover={{ color: 'red.600' }}
                                    />
                                    <Box>{t('common:Delete')}</Box>
                                  </Flex>
                                ),
                                type: 'danger',
                                onClick: () =>
                                  openDeleteConfirm({
                                    onConfirm: () => onDelCollection([collection._id]),
                                    customContent:
                                      collection.type === DatasetCollectionTypeEnum.folder
                                        ? t(
                                            'common:dataset.collections.Confirm to delete the folder'
                                          )
                                        : t('common:dataset.Confirm to delete the file')
                                  })()
                              }
                            ]
                          }
                        ]}
                      />
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>

          {total === 0 && <EmptyCollectionTip />}
        </TableContainer>

        <FloatingActionBar
          pt={4}
          Controler={
            <HStack>
              <Button
                variant={'whiteBase'}
                onClick={() =>
                  openDeleteConfirm({
                    onConfirm: () =>
                      onDelCollection(selectedItems.map((e) => e._id)).then(() =>
                        setSelectedItems([])
                      ),
                    customContent: t('dataset:confirm_delete_collection', {
                      num: selectedItems.length
                    })
                  })()
                }
              >
                {t('dataset:batch_delete')}
              </Button>
            </HStack>
          }
        >
          {total > pageSize && (
            <Flex justifyContent={'center'}>
              <Pagination />
            </Flex>
          )}
        </FloatingActionBar>

        <ConfirmDeleteModal />
        <ConfirmSyncModal />
        <EditTitleModal />

        {!!trainingStatesCollection && (
          <TrainingStates
            datasetId={datasetDetail._id}
            collectionId={trainingStatesCollection.collectionId}
            onClose={() => setTrainingStatesCollection(undefined)}
          />
        )}

        {!!moveCollectionData && (
          <SelectCollections
            datasetId={datasetDetail._id}
            type="folder"
            defaultSelectedId={[moveCollectionData.collectionId]}
            onClose={() => setMoveCollectionData(undefined)}
            onSuccess={async ({ parentId }) => {
              await putDatasetCollectionById({
                id: moveCollectionData.collectionId,
                parentId
              });
              getData(pageNum);
              setMoveCollectionData(undefined);
              toast({
                status: 'success',
                title: t('common:move_success')
              });
            }}
          />
        )}
      </Flex>
    </MyBox>
  );
};

export default React.memo(CollectionCard);
