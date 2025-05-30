import React, { useEffect } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import {
  Box,
  Button,
  Flex,
  FormLabel,
  Input,
  Link,
  ModalBody,
  ModalFooter,
  Stack,
  Switch
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import NextLink from 'next/link';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useContextSelector } from 'use-context-selector';
import {
  ChunkSettingModeEnum,
  DataChunkSplitModeEnum,
  DatasetCollectionDataProcessModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import type { ChunkSettingsType } from '@fastgpt/global/core/dataset/type';
import type { CollectionChunkFormType } from '@/pageComponents/dataset/detail/Form/CollectionChunkForm';
import CollectionChunkForm, {
  collectionChunkForm2StoreChunkData
} from '@/pageComponents/dataset/detail/Form/CollectionChunkForm';
import { getLLMDefaultChunkSize } from '@fastgpt/global/core/dataset/training/utils';
import { useMyStep } from '@fastgpt/web/hooks/useStep';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { getDocPath } from '@/web/common/system/doc';
import { defaultFormData } from '@/pageComponents/dataset/detail/Import/Context';

export type ConfluenceConfigFormType = {
  confluenceConfig: {
    spaceKey: string;
    pageId?: string;
    syncSubPages?: boolean;
    syncSchedule?: boolean;
  };
  chunkSettings: ChunkSettingsType;
};

const ConfluenceConfigModal = ({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: (data: ConfluenceConfigFormType) => void;
}) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { userInfo } = useUserStore();
  const steps = [
    {
      title: t('common:core.dataset.confluence.Config')
    },
    {
      title: t('dataset:params_config')
    }
  ];
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const confluenceConfig = datasetDetail.confluenceConfig;
  const chunkSettings = datasetDetail.chunkSettings;
  const { register, handleSubmit, watch, setValue, getValues } = useForm({
    defaultValues: {
      spaceKey: confluenceConfig?.spaceKey || '',
      pageId: confluenceConfig?.pageId || '',
      syncSubPages: confluenceConfig?.syncSubPages || false,
      syncSchedule: confluenceConfig?.syncSchedule || false
    }
  });
  const isEdit = !!confluenceConfig?.spaceKey;
  const confirmTip = isEdit
    ? t('common:core.dataset.website.Confirm Update Tips')
    : t('common:core.dataset.website.Confirm Create Tips');

  const { ConfirmModal, openConfirm } = useConfirm({
    type: 'common'
  });

  const { activeStep, goToPrevious, goToNext, MyStep } = useMyStep({
    defaultStep: 0,
    steps
  });

  const pageId = watch('pageId');
  const syncSubPages = watch('syncSubPages');
  const syncSchedule = watch('syncSchedule');
  useEffect(() => {
    if (!pageId) {
      setValue('syncSubPages', false); // 当 pageId 为空时，设置 syncSubPages 为 false
    }
  }, [pageId, setValue]);

  const form = useForm<CollectionChunkFormType>({
    defaultValues: {
      trainingType: chunkSettings?.trainingType || DatasetCollectionDataProcessModeEnum.chunk,
      imageIndex: chunkSettings?.imageIndex || false,
      autoIndexes: chunkSettings?.autoIndexes || false,

      chunkSettingMode: chunkSettings?.chunkSettingMode || ChunkSettingModeEnum.auto,
      chunkSplitMode: chunkSettings?.chunkSplitMode || DataChunkSplitModeEnum.size,

      paragraphChunkAIMode:
        chunkSettings?.paragraphChunkAIMode || defaultFormData.paragraphChunkAIMode,
      paragraphChunkDeep: chunkSettings?.paragraphChunkDeep || defaultFormData.paragraphChunkDeep,
      paragraphChunkMinSize:
        chunkSettings?.paragraphChunkMinSize || defaultFormData.paragraphChunkMinSize,

      chunkSize: chunkSettings?.chunkSize || defaultFormData.chunkSize,

      indexSize: chunkSettings?.indexSize || datasetDetail.vectorModel?.defaultToken || 512,

      chunkSplitter: chunkSettings?.chunkSplitter || '',
      qaPrompt: chunkSettings?.qaPrompt || Prompt_AgentQA.description
    }
  });
  return (
    <MyModal
      isOpen
      iconSrc="core/dataset/confluenceDataset"
      title={t('common:core.dataset.confluence.Config')}
      onClose={onClose}
      w={'550px'}
    >
      <ModalBody w={'full'}>
        <Stack w={'75%'} marginX={'auto'}>
          <MyStep />
        </Stack>
        <MyDivider />
        {activeStep == 0 && (
          <>
            <Box
              fontSize={'xs'}
              color={'myGray.900'}
              bgColor={'blue.50'}
              padding={'4'}
              borderRadius={'8px'}
            >
              {t('common:core.dataset.confluence.Config Description')}
              <Link
                href={getDocPath('/docs/guide/knowledge_base/confluence_dataset/')}
                target="_blank"
                textDecoration={'underline'}
                fontWeight={'bold'}
              >
                {t('common:read_doc')}
              </Link>
            </Box>

            {!(userInfo?.confluenceAccount?.account && userInfo?.confluenceAccount?.apiToken) &&
            !isEdit ? (
              <Link
                as={NextLink}
                // className="hover-data"
                alignItems={'center'}
                display={'flex'}
                color={'primary.500'}
                href={`/account/info`}
                mt={5}
              >
                {t('common:core.dataset.Go Confluence Account Config')}
              </Link>
            ) : (
              <>
                <Flex justifyContent={'space-between'} mt={5} fontWeight={'medium'}>
                  <FormLabel flex={'0 0 150px'}>
                    {t('common:core.dataset.confluence.Space Key')}
                    <QuestionTip
                      label={`查看浏览器地址栏上显示的Confluence地址,eg: ${feConfigs.confluenceUrl}/spaces/~63bd11e204b5f5c7b5ed0a0a/pages/12033720325，取space后面的值:~63bd11e204b5f5c7b5ed0a0a`}
                      ml={1}
                    />
                  </FormLabel>
                  <Input
                    placeholder={t('common:core.dataset.collection.Confluence Space Key')}
                    {...register('spaceKey', {
                      required: true
                    })}
                  />
                </Flex>
                <Flex justifyContent={'space-between'} mt={5} flex={'0 0 120px'} fontWeight={'sm'}>
                  <FormLabel flex={'0 0 150px'} fontSize={'sm'}>
                    {t('common:core.dataset.confluence.Page Id')}({t('common:choosable')})
                    <QuestionTip
                      label={`同步指定的页面，如果不配置，将会同步整个空间。\n查看浏览器地址栏上显示的Confluence地址,eg: ${feConfigs.confluenceUrl}/spaces/~63bd11e204b5f5c7b5ed0a0a/pages/12033720325，取pages后面的值:12033720325`}
                      ml={1}
                    />
                  </FormLabel>
                  <Input
                    placeholder={t('common:core.dataset.collection.Confluence Page ID')}
                    {...register('pageId', {
                      required: false
                    })}
                  />
                </Flex>
                <Flex
                  mt={5}
                  alignItems={'center'}
                  fontWeight={'medium'}
                  justifyContent={'space-between'}
                >
                  <FormLabel>
                    {t('common:core.dataset.confluence.Page SyncSubPages')}
                    <QuestionTip label={'开启后将同步页面ID对应的页面及其子页面'} ml={1} />
                  </FormLabel>
                  <Switch
                    size={'md'}
                    isChecked={syncSubPages}
                    isDisabled={!pageId}
                    {...register('syncSubPages')}
                  />
                </Flex>
                <Flex
                  mt={5}
                  alignItems={'center'}
                  fontWeight={'medium'}
                  justifyContent={'space-between'}
                >
                  <FormLabel>
                    {t('common:core.dataset.schedule.Sync schedule')}
                    <QuestionTip label={'开启后将每隔一小时同步一次最新的内容'} ml={1} />
                  </FormLabel>
                  <Switch size={'md'} isChecked={syncSchedule} {...register('syncSchedule')} />
                </Flex>
              </>
            )}
          </>
        )}
        {activeStep == 1 && <CollectionChunkForm form={form} />}
      </ModalBody>
      {((userInfo?.confluenceAccount?.account && userInfo?.confluenceAccount?.apiToken) ||
        isEdit) && (
        <ModalFooter>
          {activeStep == 0 && (
            <>
              <Button variant={'whiteBase'} onClick={onClose}>
                {t('common:Close')}
              </Button>
              <Button
                ml={2}
                onClick={handleSubmit((data) => {
                  if (!data.spaceKey) return;
                  goToNext();
                })}
              >
                {t('common:next_step')}
              </Button>
            </>
          )}

          {activeStep == 1 && (
            <>
              <Button variant={'whiteBase'} onClick={goToPrevious}>
                {t('common:last_step')}
              </Button>
              <Button
                ml={2}
                onClick={form.handleSubmit((data) => {
                  openConfirm(
                    () =>
                      onSuccess({
                        confluenceConfig: getValues(),
                        chunkSettings: collectionChunkForm2StoreChunkData({
                          ...data,
                          agentModel: datasetDetail.agentModel,
                          vectorModel: datasetDetail.vectorModel
                        })
                      }),
                    undefined,
                    confirmTip
                  )();
                })}
              >
                {t('common:core.dataset.website.Start Sync')}
              </Button>
            </>
          )}
        </ModalFooter>
      )}
      <ConfirmModal />
    </MyModal>
  );
};

export default ConfluenceConfigModal;
