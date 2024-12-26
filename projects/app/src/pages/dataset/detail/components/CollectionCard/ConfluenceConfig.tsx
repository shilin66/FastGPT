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
  Switch,
  useDisclosure
} from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useForm } from 'react-hook-form';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import NextLink from 'next/link';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import DataProcess from '@/pages/dataset/detail/components/Import/commonProgress/DataProcess';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '@/pages/dataset/detail/components/Import/Context';
import { ImportProcessWayEnum } from '@/web/core/dataset/constants';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';

const ConfluenceConfigModal = ({
  onClose,
  onSuccess,
  defaultValue = {
    spaceKey: '',
    pageId: '',
    syncSubPages: false,
    syncSchedule: false,
    mode: TrainingModeEnum.chunk,
    way: ImportProcessWayEnum.auto,
    chunkSize: 512,
    chunkSplitter: '',
    qaPrompt: ''
  }
}: {
  onClose: () => void;
  onSuccess: (data: DatasetSchemaType['confluenceConfig']) => void;
  defaultValue?: DatasetSchemaType['confluenceConfig'];
}) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { userInfo } = useUserStore();
  const { toast } = useToast();
  const processParamsForm = useContextSelector(DatasetImportContext, (v) => v.processParamsForm);
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const { register, handleSubmit, watch, setValue } = useForm({
    defaultValues: defaultValue
  });
  const isEdit = !!defaultValue.spaceKey;
  const confirmTip = isEdit
    ? t('common:core.dataset.website.Confirm Update Tips')
    : t('common:core.dataset.website.Confirm Create Tips');

  const { ConfirmModal, openConfirm } = useConfirm({
    type: 'common'
  });
  const {
    isOpen: isOpenDataProcessModal,
    onOpen: onOpenDataProcessModal,
    onClose: onCloseDataProcessModal
  } = useDisclosure();

  useEffect(() => {
    if (defaultValue) {
      const vectorModel = datasetDetail.vectorModel;
      const agentModel = datasetDetail.agentModel;
      const model = defaultValue.mode || TrainingModeEnum.chunk;
      const way = defaultValue.way || ImportProcessWayEnum.auto;
      processParamsForm.setValue('mode', model);
      processParamsForm.setValue('way', way);
      if (model === TrainingModeEnum.chunk) {
        processParamsForm.setValue(
          'embeddingChunkSize',
          defaultValue.chunkSize || vectorModel?.defaultToken || 512
        );
        if (way === ImportProcessWayEnum.custom) {
          processParamsForm.setValue('customSplitChar', defaultValue.chunkSplitter || '');
        }
      } else {
        processParamsForm.setValue(
          'qaChunkSize',
          defaultValue.chunkSize ||
            Math.min(agentModel.maxResponse, Math.floor(agentModel.maxContext * 0.7))
        );
        if (way === ImportProcessWayEnum.custom) {
          processParamsForm.setValue(
            'qaPrompt',
            defaultValue.qaPrompt || Prompt_AgentQA.description
          );
          processParamsForm.setValue('customSplitChar', defaultValue.chunkSplitter || '');
        }
      }
    }
  }, [datasetDetail.agentModel, datasetDetail.vectorModel, defaultValue, processParamsForm]);
  const pageId = watch('pageId');
  const syncSubPages = watch('syncSubPages');
  const syncSchedule = watch('syncSchedule');
  useEffect(() => {
    if (!pageId) {
      setValue('syncSubPages', false); // 当 pageId 为空时，设置 syncSubPages 为 false
    }
  }, [pageId, setValue]);
  return (
    <MyModal
      isOpen
      iconSrc="core/dataset/confluenceDataset"
      title={t('common:core.dataset.confluence.Config')}
      onClose={onClose}
      maxW={'500px'}
    >
      <ModalBody>
        <Box fontSize={'sm'} color={'myGray.600'}>
          {t('common:core.dataset.confluence.Config Description')}
          <Link
            href={`${feConfigs.confluenceUrl}/spaces/Monitor/pages/12336791603/Confluence`}
            target="_blank"
            textDecoration={'underline'}
            fontWeight={'bold'}
          >
            {t('common:common.course.Read Course')}
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
            href={`/account`}
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
                {t('common:core.dataset.confluence.Page Id')}({t('common:common.choosable')})
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
            <Flex mt={5}>
              <Button
                // size="xs"
                variant={'whiteBase'}
                color={'blue'}
                alignItems={'center'}
                fontWeight={'medium'}
                onClick={onOpenDataProcessModal}
              >
                {t('common:common.Advanced Settings')}
              </Button>
              {isOpenDataProcessModal && <DataProcessingModal onClose={onCloseDataProcessModal} />}
            </Flex>
          </>
        )}
      </ModalBody>
      {((userInfo?.confluenceAccount?.account && userInfo?.confluenceAccount?.apiToken) ||
        isEdit) && (
        <ModalFooter>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:common.Close')}
          </Button>
          <Button
            ml={2}
            onClick={handleSubmit((data) => {
              data.mode = processParamsForm.getValues('mode');
              data.way = processParamsForm.getValues('way');

              if (data.way === ImportProcessWayEnum.custom) {
                data.chunkSplitter = processParamsForm.getValues('customSplitChar');
              } else {
                data.chunkSplitter = '';
              }
              if (data.mode === TrainingModeEnum.chunk) {
                data.chunkSize = processParamsForm.getValues('embeddingChunkSize');
              } else {
                if (data.way === ImportProcessWayEnum.custom) {
                  data.chunkSize = processParamsForm.getValues('qaChunkSize');
                  data.qaPrompt = processParamsForm.getValues('qaPrompt');
                } else {
                  data.chunkSize = Math.min(
                    datasetDetail.agentModel.maxResponse,
                    Math.floor(datasetDetail.agentModel.maxContext * 0.7)
                  );
                  data.qaPrompt = Prompt_AgentQA.description;
                }
              }
              if (!data.spaceKey) return;
              openConfirm(
                () => {
                  onSuccess(data);
                },
                undefined,
                confirmTip
              )();
            })}
          >
            {t('common:core.dataset.website.Start Sync')}
          </Button>
        </ModalFooter>
      )}
      <ConfirmModal />
    </MyModal>
  );
};

export default ConfluenceConfigModal;

const DataProcessingModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  return (
    <MyModal
      isOpen
      iconSrc="core/dataset/confluenceDataset"
      title={t('common:common.Advanced Settings')}
      onClose={onClose}
      maxW={'800px'}
      maxH={'1200px'}
    >
      <ModalBody h={'100%'}>
        <DataProcess showPreviewChunks={false} isModal={true} />
      </ModalBody>
      <ModalFooter>
        <Button
          ml={2}
          onClick={() => {
            onClose();
          }}
        >
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};
