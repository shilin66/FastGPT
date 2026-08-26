import React, { useMemo } from 'react';
import { Flex, Button, Input, Link } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { WecomAppType, OutLinkEditType } from '@fastgpt/global/support/outLink/type';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { createShareChat, updateShareChat } from '@/web/support/outLink/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getDocPath } from '@/web/common/system/doc';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useMyStep } from '@fastgpt/web/hooks/useStep';
import { ShareLinkContainer } from '../components/showShareLinkModal';
import {
  OmniFieldCard,
  OmniFormGrid,
  OmniModalBody,
  OmniModalFooter,
  OmniModalSection
} from '../../components/OmniModalLayout';

const WecomEditModal = ({
  appId,
  defaultData,
  onClose,
  onCreate,
  onEdit,
  isEdit = false
}: {
  appId: string;
  defaultData: OutLinkEditType<WecomAppType>;
  onClose: () => void;
  onCreate: (shareId: string) => Promise<string | undefined>;
  onEdit: () => void;
  isEdit?: boolean;
}) => {
  const { t } = useTranslation();
  const {
    register,
    setValue,
    handleSubmit: submitShareChat
  } = useForm({
    defaultValues: defaultData
  });

  const {
    runAsync: onclickCreate,
    loading: creating,
    data: createShareId
  } = useRequest(
    (e) =>
      createShareChat({
        ...e,
        appId,
        type: PublishChannelEnum.wecom
      }),
    {
      errorToast: t('common:create_failed'),
      successToast: t('common:create_success'),
      onSuccess: async (shareId) => {
        const _id = await onCreate(shareId);
        if (_id) {
          setValue('_id', _id);
        }
      }
    }
  );

  const {
    runAsync: onclickUpdate,
    loading: updating,
    data: updatedShareId
  } = useRequest((e) => updateShareChat(e), {
    errorToast: t('common:update_failed'),
    successToast: t('common:update_success'),
    onSuccess: onEdit
  });

  const shareId = useMemo(() => createShareId || updatedShareId, [createShareId, updatedShareId]);

  // 判断是否已经创建成功（有 createShareId 说明已经创建）
  const isCreated = useMemo(() => !!createShareId, [createShareId]);
  const isEditMode = useMemo(() => isEdit || isCreated, [isEdit, isCreated]);

  const { feConfigs } = useSystemStore();
  const { MyStep, activeStep, goToNext, goToPrevious } = useMyStep({
    steps: [
      {
        title: t('publish:wecom.create_modal.step.1')
      },
      {
        title: t('publish:wecom.create_modal.step.2')
      }
    ]
  });

  const baseUrl = useMemo(
    () => feConfigs?.customApiDomain || `${location.origin}/api`,
    [feConfigs?.customApiDomain]
  );

  return (
    <MyModal
      iconSrc="core/app/publish/wecom"
      title={
        isEditMode ? t('publish:wecom.edit_modal_title') : t('publish:wecom.create_modal_title')
      }
      minW={['auto', '60rem']}
      onClose={onClose}
    >
      <OmniModalBody
        icon="core/app/publish/wecom"
        title={
          isEditMode ? t('publish:wecom.edit_modal_title') : t('publish:wecom.create_modal_title')
        }
        desc={activeStep === 0 ? t('publish:wecom.api') : t('publish:wecom.create_modal.step.2')}
        asideItems={[
          {
            label: t('publish:wecom.create_modal.step.1'),
            desc: t('publish:wecom.api'),
            icon: 'common/setting'
          },
          {
            label: t('publish:wecom.create_modal.step.2'),
            desc: 'Webhook URL',
            icon: 'common/link'
          }
        ]}
      >
        <OmniModalSection
          title={
            activeStep === 0
              ? t('publish:wecom.create_modal.step.1')
              : t('publish:wecom.create_modal.step.2')
          }
          desc={
            isEditMode ? t('publish:wecom.edit_modal_title') : t('publish:wecom.create_modal_title')
          }
        >
          <MyStep />
        </OmniModalSection>
        {activeStep === 0 && (
          <>
            <OmniModalSection title={t('publish:basic_info')} desc={t('publish:publish_name')}>
              <OmniFormGrid>
                <OmniFieldCard gridColumn={['auto', '1 / -1']}>
                  <FormLabel required color={'#1E293B'} fontWeight={700}>
                    {t('common:Name')}
                  </FormLabel>
                  <Input
                    mt={2}
                    placeholder={t('publish:publish_name')}
                    maxLength={100}
                    {...register('name', {
                      required: t('common:name_is_empty')
                    })}
                  />
                </OmniFieldCard>
                {/*<Flex flexDir={'column'} gap="2">*/}
                {/*  <FormLabel>*/}
                {/*    QPM*/}
                {/*    <QuestionTip ml={1} label={t('publish:qpm_tips')}></QuestionTip>*/}
                {/*  </FormLabel>*/}
                {/*  <Input*/}
                {/*    max={1000}*/}
                {/*    {...register('limit.QPM', {*/}
                {/*      min: 0,*/}
                {/*      max: 1000,*/}
                {/*      valueAsNumber: true,*/}
                {/*      required: t('publish:qpm_is_empty')*/}
                {/*    })}*/}
                {/*  />*/}
                {/*</Flex>*/}
                {/*<Flex flexDir={'column'} gap="2">*/}
                {/*  <FormLabel>*/}
                {/*    {t('common:support.outlink.Max usage points')}*/}
                {/*    <QuestionTip*/}
                {/*      ml={1}*/}
                {/*      label={t('common:support.outlink.Max usage points tip')}*/}
                {/*    ></QuestionTip>*/}
                {/*  </FormLabel>*/}
                {/*  <Input*/}
                {/*    {...register('limit.maxUsagePoints', {*/}
                {/*      min: -1,*/}
                {/*      max: 10000000,*/}
                {/*      valueAsNumber: true,*/}
                {/*      required: true*/}
                {/*    })}*/}
                {/*  />*/}
                {/*</Flex>*/}
                {/*<Flex flexDir={'column'} gap="2">*/}
                {/*  <FormLabel>{t('common:expired_time')}</FormLabel>*/}
                {/*  <Input*/}
                {/*    type="datetime-local"*/}
                {/*    defaultValue={*/}
                {/*      defaultData.limit?.expiredTime*/}
                {/*        ? formatTime2YMDHM(defaultData.limit?.expiredTime)*/}
                {/*        : ''*/}
                {/*    }*/}
                {/*    onChange={(e) => {*/}
                {/*      setValue('limit.expiredTime', new Date(e.target.value));*/}
                {/*    }}*/}
                {/*  />*/}
                {/*</Flex>*/}
              </OmniFormGrid>
            </OmniModalSection>

            <OmniModalSection
              title={t('publish:wecom.api')}
              desc={'用于企业微信回调验证与消息解密。'}
              action={
                feConfigs?.docUrl && (
                  <Link
                    href={getDocPath('/docs/use-cases/external-integration/wecom')}
                    target={'_blank'}
                    ml={2}
                    color={'primary.500'}
                    fontSize={'sm'}
                  >
                    <Flex alignItems={'center'}>
                      <MyIcon name="book" w={'17px'} h={'17px'} mr="1" />
                      {t('common:read_doc')}
                    </Flex>
                  </Link>
                )
              }
            >
              <OmniFormGrid>
                <OmniFieldCard>
                  <FormLabel required color={'#1E293B'} fontWeight={700}>
                    Token
                  </FormLabel>
                  <Input
                    mt={2}
                    placeholder="Token"
                    {...register('app.CallbackToken', {
                      required: true
                    })}
                  />
                </OmniFieldCard>
                <OmniFieldCard>
                  <FormLabel required color={'#1E293B'} fontWeight={700}>
                    AES Key
                  </FormLabel>
                  <Input
                    mt={2}
                    placeholder="AES Key"
                    {...register('app.CallbackEncodingAesKey', { required: true })}
                  />
                </OmniFieldCard>
              </OmniFormGrid>
            </OmniModalSection>
          </>
        )}
        {activeStep === 1 && (
          <OmniModalSection title={t('publish:wecom.create_modal.step.2')} desc={baseUrl}>
            <ShareLinkContainer
              shareLink={`${baseUrl}/support/outLink/wecom/${shareId}`}
              img="/imgs/outlink/wecom-copylink-instruction.png"
              defaultDomain={false}
              showCustomDomainSelector={true}
            ></ShareLinkContainer>
          </OmniModalSection>
        )}
      </OmniModalBody>
      <OmniModalFooter>
        {activeStep === 1 && (
          <Button
            variant={'whiteBase'}
            onClick={() => {
              goToPrevious();
            }}
          >
            {t('common:last_step')}
          </Button>
        )}
        <Button
          isLoading={creating || updating}
          onClick={() => {
            if (activeStep === 0) {
              submitShareChat((data) =>
                (isEditMode ? onclickUpdate(data) : onclickCreate(data)).then(() => goToNext())
              )();
            } else {
              onClose();
            }
          }}
        >
          {t('common:Confirm')}
        </Button>
      </OmniModalFooter>
    </MyModal>
  );
};

export default WecomEditModal;
