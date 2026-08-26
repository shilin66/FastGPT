import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Flex, Grid, IconButton, Input } from '@chakra-ui/react';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useForm } from 'react-hook-form';
import type { DatasetItemType } from '@fastgpt/global/core/dataset/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { postRebuildEmbedding } from '@/web/core/dataset/api/training';
import type { EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { DatasetTypeEnum, DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { DatasetRoleList } from '@fastgpt/global/support/permission/dataset/constant';
import MemberManager from '../../MemberManager';
import {
  getCollaboratorList,
  postUpdateDatasetCollaborators,
  deleteDatasetCollaborators
} from '@/web/core/dataset/api/collaborator';
import DatasetTypeTag from '@/components/core/dataset/DatasetTypeTag';
import dynamic from 'next/dynamic';
import type { EditAPIDatasetInfoFormType } from './components/EditApiServiceModal';
import { type EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { omniTheme } from '@/web/common/brand/theme';

const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));
const EditAPIDatasetInfoModal = dynamic(() => import('./components/EditApiServiceModal'));

type Props = {
  datasetId: string;
  onClose?: () => void;
};

type InspectorTab = 'models' | 'access' | 'source';

const Info = ({ datasetId, onClose }: Props) => {
  const { t } = useTranslation();
  const { datasetDetail, loadDatasetDetail, updateDataset, rebuildingCount, trainingCount } =
    useContextSelector(DatasetPageContext, (v) => v);
  const { llmModelList, embeddingModelList, getVlmModelList, feConfigs } = useSystemStore();

  const [editedDataset, setEditedDataset] = useState<EditResourceInfoFormType>();
  const [editedAPIDataset, setEditedAPIDataset] = useState<EditAPIDatasetInfoFormType>();
  const [activeTab, setActiveTab] = useState<InspectorTab>('models');
  const refetchDatasetTraining = useContextSelector(
    DatasetPageContext,
    (v) => v.refetchDatasetTraining
  );
  const { setValue, register, handleSubmit, watch, reset } = useForm<DatasetItemType>({
    defaultValues: datasetDetail
  });

  const vectorModel = watch('vectorModel');
  const agentModel = watch('agentModel');

  const vllmModelList = useMemo(() => getVlmModelList(), [getVlmModelList]);
  const vlmModel = watch('vlmModel');

  const { openConfirm: onOpenConfirmRebuild, ConfirmModal: ConfirmRebuildModal } = useConfirm({
    title: t('common:action_confirm'),
    content: t('dataset:confirm_to_rebuild_embedding_tip'),
    type: 'delete'
  });
  const { ConfirmModal: ConfirmSyncScheduleModal } = useConfirm({
    title: t('common:action_confirm')
  });

  const { runAsync: onSave } = useRequest(
    (data: DatasetItemType) => {
      return updateDataset({
        id: datasetId,
        agentModel: data.agentModel?.model,
        vlmModel: data.vlmModel?.model,
        externalReadUrl: data.externalReadUrl
      });
    },
    {
      successToast: t('common:update_success'),
      errorToast: t('common:update_failed')
    }
  );

  const { runAsync: onRebuilding } = useRequest(
    (vectorModel: EmbeddingModelItemType) => {
      return postRebuildEmbedding({
        datasetId,
        vectorModel: vectorModel.model
      });
    },
    {
      onSuccess() {
        refetchDatasetTraining();
        loadDatasetDetail(datasetId);
      },
      successToast: t('dataset:rebuild_embedding_start_tip'),
      errorToast: t('common:update_failed')
    }
  );

  const { runAsync: onEditBaseInfo } = useRequest(updateDataset, {
    onSuccess() {
      setEditedDataset(undefined);
    },
    successToast: t('common:update_success'),
    errorToast: t('common:update_failed')
  });

  useEffect(() => {
    reset(datasetDetail);
  }, [datasetDetail, datasetDetail._id, reset]);

  const isTraining = rebuildingCount > 0 || trainingCount > 0;
  const hasSourceConfig = new Set<DatasetTypeEnum>([
    DatasetTypeEnum.externalFile,
    DatasetTypeEnum.apiDataset,
    DatasetTypeEnum.yuque,
    DatasetTypeEnum.feishu,
    DatasetTypeEnum.confluence
  ]).has(datasetDetail.type);

  useEffect(() => {
    if (activeTab === 'access' && !datasetDetail.permission.hasManagePer) {
      setActiveTab('models');
    }
    if (activeTab === 'source' && !hasSourceConfig) {
      setActiveTab('models');
    }
  }, [activeTab, datasetDetail.permission.hasManagePer, hasSourceConfig]);

  const sourceConfig = useMemo(() => {
    if (datasetDetail.type === DatasetTypeEnum.apiDataset) {
      return {
        label: t('dataset:api_url'),
        value: datasetDetail.apiDatasetServer?.apiServer?.baseUrl
      };
    }
    if (datasetDetail.type === DatasetTypeEnum.yuque) {
      return {
        label: t('dataset:yuque_dataset_config'),
        value: datasetDetail.apiDatasetServer?.yuqueServer?.userId
      };
    }
    if (datasetDetail.type === DatasetTypeEnum.feishu) {
      return {
        label: t('dataset:feishu_dataset_config'),
        value: datasetDetail.apiDatasetServer?.feishuServer?.folderToken
      };
    }
    if (datasetDetail.type === DatasetTypeEnum.confluence) {
      return {
        label: t('dataset:confluence_dataset_config'),
        value:
          datasetDetail.apiDatasetServer?.confluenceServer?.pageId ||
          datasetDetail.apiDatasetServer?.confluenceServer?.spaceKey
      };
    }
  }, [datasetDetail.apiDatasetServer, datasetDetail.type, t]);

  const openSourceEditor = () => {
    setEditedAPIDataset({
      id: datasetDetail._id,
      apiDatasetServer: datasetDetail.apiDatasetServer
    });
  };

  return (
    <Flex w={'100%'} h={'100%'} flexDir={'column'} bg={omniTheme.colors.pageBg} overflow={'hidden'}>
      <Flex
        h={'52px'}
        px={4}
        align={'center'}
        justify={'space-between'}
        borderBottom={'1px solid'}
        borderColor={omniTheme.colors.border}
        bg={omniTheme.colors.surface}
        flexShrink={0}
      >
        <Flex align={'center'} minW={0}>
          <Flex
            w={'30px'}
            h={'30px'}
            align={'center'}
            justify={'center'}
            borderRadius={omniTheme.radii.sm}
            bg={omniTheme.colors.graphite}
            color={'white'}
            flexShrink={0}
          >
            <MyIcon name={'common/setting'} w={'15px'} />
          </Flex>
          <Box ml={2.5} fontSize={'14px'} fontWeight={750} color={omniTheme.colors.text}>
            {t('dataset:inspector_title')}
          </Box>
        </Flex>
        {onClose && (
          <IconButton
            aria-label={t('common:Close')}
            icon={<MyIcon name={'common/closeLight'} w={'15px'} />}
            size={'smSquare'}
            variant={'whiteBase'}
            borderRadius={omniTheme.radii.sm}
            onClick={onClose}
          />
        )}
      </Flex>

      <Box px={4} pt={4} pb={3} bg={omniTheme.colors.surface} flexShrink={0}>
        <Flex align={'center'}>
          <Avatar
            src={datasetDetail.avatar}
            w={'44px'}
            h={'44px'}
            borderRadius={omniTheme.radii.sm}
          />
          <Box ml={3} minW={0} flex={1}>
            <Flex align={'center'} gap={2} minW={0}>
              <Box
                minW={0}
                fontSize={'15px'}
                fontWeight={750}
                color={omniTheme.colors.text}
                className={'textEllipsis'}
              >
                {datasetDetail.name}
              </Box>
              {DatasetTypeMap[datasetDetail.type] && (
                <DatasetTypeTag
                  type={datasetDetail.type}
                  h={'20px'}
                  px={1.5}
                  py={0}
                  border={'none'}
                  bg={omniTheme.colors.sidebarBg}
                  fontSize={'10px'}
                  flexShrink={0}
                />
              )}
            </Flex>
            <Box
              mt={1}
              noOfLines={2}
              wordBreak={'break-word'}
              fontSize={'11px'}
              lineHeight={'17px'}
              color={omniTheme.colors.muted}
            >
              {datasetDetail.intro || t('common:core.dataset.Intro Placeholder')}
            </Box>
          </Box>
          <IconButton
            ml={2}
            aria-label={t('common:Edit')}
            icon={<MyIcon name={'edit'} w={'14px'} />}
            size={'smSquare'}
            variant={'whiteBase'}
            borderRadius={omniTheme.radii.sm}
            onClick={() =>
              setEditedDataset({
                id: datasetDetail._id,
                name: datasetDetail.name,
                avatar: datasetDetail.avatar,
                intro: datasetDetail.intro
              })
            }
          />
        </Flex>

        <Flex
          mt={3}
          h={'32px'}
          px={2.5}
          align={'center'}
          borderRadius={omniTheme.radii.sm}
          bg={omniTheme.colors.sidebarBg}
          color={omniTheme.colors.muted}
          minW={0}
        >
          <Box
            mr={2}
            fontSize={'9px'}
            lineHeight={'14px'}
            fontWeight={800}
            color={omniTheme.colors.saturatedBlue}
          >
            ID
          </Box>
          <Box
            minW={0}
            className={'textEllipsis'}
            fontFamily={'mono'}
            fontSize={'10px'}
            color={omniTheme.colors.graphite}
          >
            {datasetDetail._id}
          </Box>
        </Flex>
      </Box>

      <Grid
        gridTemplateColumns={'repeat(auto-fit, minmax(84px, 1fr))'}
        px={4}
        bg={omniTheme.colors.surface}
        borderBottomWidth={'1px'}
        borderBottomStyle={'solid'}
        borderBottomColor={omniTheme.colors.border}
        flexShrink={0}
      >
        <InspectorTabButton
          label={t('dataset:inspector_models')}
          icon={<MyIcon name={'core/app/simpleMode/ai'} w={'14px'} />}
          isActive={activeTab === 'models'}
          onClick={() => setActiveTab('models')}
        />
        {datasetDetail.permission.hasManagePer && (
          <InspectorTabButton
            label={t('dataset:inspector_access')}
            icon={<MyIcon name={'common/user'} w={'14px'} />}
            isActive={activeTab === 'access'}
            onClick={() => setActiveTab('access')}
          />
        )}
        {hasSourceConfig && (
          <InspectorTabButton
            label={t('dataset:inspector_source')}
            icon={<MyIcon name={'core/dataset/externalDataset'} w={'14px'} />}
            isActive={activeTab === 'source'}
            onClick={() => setActiveTab('source')}
          />
        )}
      </Grid>

      <Box flex={1} minH={0} overflowY={'auto'} px={4} py={4}>
        {activeTab === 'models' && (
          <Box
            overflow={'hidden'}
            borderWidth={'1px'}
            borderStyle={'solid'}
            borderColor={omniTheme.colors.border}
            borderRadius={omniTheme.radii.md}
            bg={omniTheme.colors.surface}
          >
            <ModelRouteRow
              icon={<MyIcon name={'core/dataset/modeEmbedding'} w={'16px'} />}
              label={t('common:core.ai.model.Vector Model')}
              meta={
                <MyTooltip label={t('dataset:vector_model_max_tokens_tip')}>
                  <Box>
                    {t('dataset:chunk_max_tokens')} {vectorModel.maxToken}
                  </Box>
                </MyTooltip>
              }
            >
              <AIModelSelector
                w={'100%'}
                h={'36px'}
                value={vectorModel.model}
                fontSize={'11px'}
                disableTip={
                  isTraining
                    ? t(
                        'dataset:the_knowledge_base_has_indexes_that_are_being_trained_or_being_rebuilt'
                      )
                    : undefined
                }
                list={embeddingModelList.map((item) => ({
                  label: item.name,
                  value: item.model
                }))}
                onChange={(e) => {
                  const vectorModel = embeddingModelList.find((item) => item.model === e);
                  if (!vectorModel) return;
                  return onOpenConfirmRebuild({
                    onConfirm: async () => {
                      await onRebuilding(vectorModel);
                      setValue('vectorModel', vectorModel);
                    }
                  })();
                }}
              />
            </ModelRouteRow>

            <ModelRouteRow
              icon={<MyIcon name={'core/app/aiLight'} w={'16px'} />}
              label={t('common:core.ai.model.Dataset Agent Model')}
            >
              <AIModelSelector
                w={'100%'}
                h={'36px'}
                value={agentModel.model}
                list={llmModelList.map((item) => ({
                  label: item.name,
                  value: item.model
                }))}
                fontSize={'11px'}
                onChange={(e) => {
                  const agentModel = llmModelList.find((item) => item.model === e);
                  if (!agentModel) return;
                  setValue('agentModel', agentModel);
                  return handleSubmit((data) => onSave({ ...data, agentModel }))();
                }}
              />
            </ModelRouteRow>

            <ModelRouteRow
              icon={<MyIcon name={'core/dataset/imageFill'} w={'16px'} />}
              label={t('dataset:vllm_model')}
              isLast
            >
              <AIModelSelector
                w={'100%'}
                h={'36px'}
                value={vlmModel?.model}
                list={vllmModelList.map((item) => ({
                  label: item.name,
                  value: item.model
                }))}
                fontSize={'11px'}
                onChange={(e) => {
                  const vlmModel = vllmModelList.find((item) => item.model === e);
                  if (!vlmModel) return;
                  setValue('vlmModel', vlmModel);
                  return handleSubmit((data) => onSave({ ...data, vlmModel }))();
                }}
              />
            </ModelRouteRow>
          </Box>
        )}

        {datasetDetail.permission.hasManagePer && (
          <Box display={activeTab === 'access' ? 'block' : 'none'}>
            <MemberManager
              managePer={{
                defaultRole: ReadRoleVal,
                permission: datasetDetail.permission,
                onGetCollaboratorList: () => getCollaboratorList(datasetId),
                refreshDeps: [datasetId, feConfigs.isPlus],
                roleList: DatasetRoleList,
                onUpdateCollaborators: (body) =>
                  postUpdateDatasetCollaborators({
                    ...body,
                    datasetId
                  }),
                onDelOneCollaborator: async ({ groupId, tmbId, orgId }) => {
                  if (tmbId) {
                    return deleteDatasetCollaborators({ datasetId, tmbId });
                  }
                  if (groupId) {
                    return deleteDatasetCollaborators({ datasetId, groupId });
                  }
                  if (orgId) {
                    return deleteDatasetCollaborators({ datasetId, orgId });
                  }
                }
              }}
            />
          </Box>
        )}

        {activeTab === 'source' && hasSourceConfig && (
          <Box
            borderWidth={'1px'}
            borderStyle={'solid'}
            borderColor={omniTheme.colors.border}
            borderRadius={omniTheme.radii.md}
            bg={omniTheme.colors.surface}
            overflow={'hidden'}
          >
            {datasetDetail.type === DatasetTypeEnum.externalFile ? (
              <Box p={4}>
                <Flex align={'center'} mb={2} fontSize={'12px'} fontWeight={700}>
                  <Box>{t('dataset:external_read_url')}</Box>
                  <QuestionTip label={t('dataset:external_read_url_tip')} />
                </Flex>
                <Input
                  h={'38px'}
                  fontSize={'11px'}
                  bg={omniTheme.colors.pageBg}
                  placeholder="https://test.com/read?fileId={{fileId}}"
                  {...register('externalReadUrl')}
                  onBlur={handleSubmit((data) => onSave(data))}
                />
              </Box>
            ) : (
              <Flex p={4} align={'center'} minW={0}>
                <Flex
                  w={'34px'}
                  h={'34px'}
                  align={'center'}
                  justify={'center'}
                  borderRadius={omniTheme.radii.sm}
                  bg={omniTheme.colors.saturatedBlueSoft}
                  color={omniTheme.colors.saturatedBlue}
                  flexShrink={0}
                >
                  <MyIcon name={'core/dataset/externalDataset'} w={'16px'} />
                </Flex>
                <Box ml={3} minW={0} flex={1}>
                  <Box fontSize={'12px'} fontWeight={700} color={omniTheme.colors.text}>
                    {sourceConfig?.label}
                  </Box>
                  <Box
                    mt={1}
                    fontFamily={'mono'}
                    fontSize={'10px'}
                    color={omniTheme.colors.muted}
                    className={'textEllipsis'}
                  >
                    {sourceConfig?.value || '-'}
                  </Box>
                </Box>
                <IconButton
                  ml={2}
                  aria-label={t('common:Edit')}
                  icon={<MyIcon name={'edit'} w={'14px'} />}
                  size={'smSquare'}
                  variant={'whiteBase'}
                  borderRadius={omniTheme.radii.sm}
                  onClick={openSourceEditor}
                />
              </Flex>
            )}
          </Box>
        )}
      </Box>

      <ConfirmRebuildModal countDown={10} />
      <ConfirmSyncScheduleModal />
      {editedDataset && (
        <EditResourceModal
          {...editedDataset}
          title={t('common:dataset.Edit Info')}
          onClose={() => setEditedDataset(undefined)}
          onEdit={(data) =>
            onEditBaseInfo({
              id: editedDataset.id,
              name: data.name,
              intro: data.intro,
              avatar: data.avatar
            })
          }
        />
      )}
      {editedAPIDataset && (
        <EditAPIDatasetInfoModal
          {...editedAPIDataset}
          title={t('dataset:edit_dataset_config')}
          onClose={() => setEditedAPIDataset(undefined)}
          onEdit={(data) =>
            updateDataset({
              id: datasetId,
              apiDatasetServer: data.apiDatasetServer
            })
          }
        />
      )}
    </Flex>
  );
};

const InspectorTabButton = ({
  label,
  icon,
  isActive,
  onClick
}: {
  label: string;
  icon: React.ReactElement;
  isActive: boolean;
  onClick: () => void;
}) => (
  <Button
    h={'42px'}
    minW={0}
    px={2}
    borderRadius={0}
    borderBottomWidth={'2px'}
    borderBottomStyle={'solid'}
    borderBottomColor={isActive ? omniTheme.colors.saturatedBlue : 'transparent'}
    bg={'transparent'}
    color={isActive ? omniTheme.colors.saturatedBlue : omniTheme.colors.muted}
    fontSize={'11px'}
    fontWeight={isActive ? 750 : 600}
    leftIcon={icon}
    _hover={{ color: omniTheme.colors.text, bg: 'transparent' }}
    _focusVisible={{ boxShadow: `inset 0 0 0 2px ${omniTheme.colors.saturatedBlue}` }}
    onClick={onClick}
  >
    {label}
  </Button>
);

const ModelRouteRow = ({
  icon,
  label,
  meta,
  isLast = false,
  children
}: {
  icon: React.ReactElement;
  label: string;
  meta?: React.ReactNode;
  isLast?: boolean;
  children: React.ReactNode;
}) => (
  <Box
    px={3.5}
    py={3.5}
    borderBottomWidth={isLast ? '0' : '1px'}
    borderBottomStyle={'solid'}
    borderBottomColor={omniTheme.colors.border}
  >
    <Flex align={'center'} mb={2.5} minW={0}>
      <Flex
        w={'30px'}
        h={'30px'}
        align={'center'}
        justify={'center'}
        borderRadius={omniTheme.radii.sm}
        bg={omniTheme.colors.saturatedBlueSoft}
        color={omniTheme.colors.saturatedBlue}
        flexShrink={0}
      >
        {icon}
      </Flex>
      <Box
        ml={2.5}
        minW={0}
        flex={1}
        fontSize={'12px'}
        fontWeight={700}
        color={omniTheme.colors.text}
      >
        {label}
      </Box>
      {meta && (
        <Box ml={2} fontSize={'10px'} color={omniTheme.colors.muted} whiteSpace={'nowrap'}>
          {meta}
        </Box>
      )}
    </Flex>
    {children}
  </Box>
);

export default React.memo(Info);
