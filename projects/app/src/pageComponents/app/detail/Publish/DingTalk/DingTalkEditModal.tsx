import React from 'react';
import { Flex, Button, Input, Link } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { DingtalkAppType, OutLinkEditType } from '@fastgpt/global/support/outLink/type';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { createShareChat, updateShareChat } from '@/web/support/outLink/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import BasicInfo from '../components/BasicInfo';
import { getDocPath } from '@/web/common/system/doc';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import {
  OmniFieldCard,
  OmniFormGrid,
  OmniModalBody,
  OmniModalFooter,
  OmniModalSection
} from '../../components/OmniModalLayout';

const DingTalkEditModal = ({
  appId,
  defaultData,
  onClose,
  onCreate,
  onEdit,
  isEdit = false
}: {
  appId: string;
  defaultData: OutLinkEditType<DingtalkAppType>;
  onClose: () => void;
  onCreate: (id: string) => void;
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

  const { runAsync: onclickCreate, loading: creating } = useRequest(
    (e: Omit<OutLinkEditType<DingtalkAppType>, 'appId' | 'type'>) =>
      createShareChat({
        ...e,
        appId,
        type: PublishChannelEnum.dingtalk,
        app: {
          clientId: e?.app?.clientId?.trim() ?? '',
          clientSecret: e.app?.clientSecret?.trim() ?? ''
        }
      }),
    {
      errorToast: t('common:create_failed'),
      successToast: t('common:create_success'),
      onSuccess: onCreate
    }
  );

  const { runAsync: onclickUpdate, loading: updating } = useRequest(
    (e) =>
      updateShareChat({
        ...e,
        app: {
          clientId: e?.app?.clientId?.trim() ?? '',
          clientSecret: e.app?.clientSecret?.trim() ?? ''
        }
      }),
    {
      errorToast: t('common:update_failed'),
      successToast: t('common:update_success'),
      onSuccess: onEdit
    }
  );

  const { feConfigs } = useSystemStore();

  return (
    <MyModal
      iconSrc="common/dingtalkFill"
      title={
        isEdit ? t('publish:dingtalk.edit_modal_title') : t('publish:dingtalk.create_modal_title')
      }
      minW={['auto', '60rem']}
    >
      <OmniModalBody
        icon="common/dingtalkFill"
        title={
          isEdit ? t('publish:dingtalk.edit_modal_title') : t('publish:dingtalk.create_modal_title')
        }
        desc={t('publish:dingtalk.api')}
        asideItems={[
          {
            label: t('publish:basic_info'),
            desc: t('common:Name'),
            icon: 'common/setting'
          },
          {
            label: t('publish:dingtalk.api'),
            desc: 'Client ID / Client Secret',
            icon: 'common/dingtalkFill'
          }
        ]}
      >
        <OmniModalSection title={t('publish:basic_info')} desc={t('publish:publish_name')}>
          <BasicInfo
            register={register}
            setValue={setValue}
            defaultData={defaultData}
            showResponseConfig={false}
          />
        </OmniModalSection>
        <OmniModalSection
          title={t('publish:dingtalk.api')}
          desc={'用于连接钉钉应用并完成消息回调校验。'}
          action={
            feConfigs?.docUrl && (
              <Link
                href={getDocPath('/docs/use-cases/external-integration/dingtalk/')}
                target={'_blank'}
                ml={2}
                color={'primary.500'}
                fontSize={'sm'}
              >
                <Flex alignItems={'center'}>
                  <MyIcon w={'17px'} h={'17px'} name="book" mr="1" />
                  {t('common:read_doc')}
                </Flex>
              </Link>
            )
          }
        >
          <OmniFormGrid>
            <OmniFieldCard>
              <FormLabel required color={'#1E293B'} fontWeight={700}>
                Client ID
              </FormLabel>
              <Input
                mt={2}
                placeholder={'Client ID'}
                {...register('app.clientId', {
                  required: true
                })}
              />
            </OmniFieldCard>
            <OmniFieldCard>
              <FormLabel required color={'#1E293B'} fontWeight={700}>
                Client Secret
              </FormLabel>
              <Input
                mt={2}
                placeholder={'Client Secret'}
                {...register('app.clientSecret', {
                  required: true
                })}
              />
            </OmniFieldCard>
          </OmniFormGrid>
        </OmniModalSection>
      </OmniModalBody>
      <OmniModalFooter>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common:Close')}
        </Button>
        <Button
          isLoading={creating || updating}
          onClick={submitShareChat((data) => (isEdit ? onclickUpdate(data) : onclickCreate(data)))}
        >
          {t('common:Confirm')}
        </Button>
      </OmniModalFooter>
    </MyModal>
  );
};

export default DingTalkEditModal;
