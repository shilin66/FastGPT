import React from 'react';
import { Flex, Button, Input, Link } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { OffiAccountAppType, OutLinkEditType } from '@fastgpt/global/support/outLink/type';
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

const OffiAccountEditModal = ({
  appId,
  defaultData,
  onClose,
  onCreate,
  onEdit,
  isEdit = false
}: {
  appId: string;
  defaultData: OutLinkEditType<OffiAccountAppType>;
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
    (e: OutLinkEditType<OffiAccountAppType>) => {
      if (e?.app) {
        e.app.appId = e.app.appId?.trim();
        e.app.secret = e.app.secret?.trim();
        e.app.CallbackToken = e.app.CallbackToken?.trim();
        e.app.CallbackEncodingAesKey = e.app.CallbackEncodingAesKey?.trim();
      }
      return createShareChat({
        ...e,
        appId,
        type: PublishChannelEnum.officialAccount
      });
    },
    {
      errorToast: t('common:create_failed'),
      successToast: t('common:create_success'),
      onSuccess: onCreate
    }
  );

  const { runAsync: onclickUpdate, loading: updating } = useRequest(
    (e) => {
      if (e?.app) {
        e.app.appId = e.app.appId?.trim();
        e.app.secret = e.app.secret?.trim();
        e.app.CallbackToken = e.app.CallbackToken?.trim();
        e.app.CallbackEncodingAesKey = e.app.CallbackEncodingAesKey?.trim();
      }
      return updateShareChat(e);
    },
    {
      errorToast: t('common:update_failed'),
      successToast: t('common:update_success'),
      onSuccess: onEdit
    }
  );

  const { feConfigs } = useSystemStore();

  return (
    <MyModal
      iconSrc="/imgs/modal/shareFill.svg"
      title={
        isEdit
          ? t('publish:official_account.edit_modal_title')
          : t('publish:official_account.create_modal_title')
      }
      minW={['auto', '60rem']}
    >
      <OmniModalBody
        icon="core/app/publish/offiaccount"
        title={
          isEdit
            ? t('publish:official_account.edit_modal_title')
            : t('publish:official_account.create_modal_title')
        }
        desc={t('publish:official_account.params')}
        asideItems={[
          {
            label: t('publish:basic_info'),
            desc: t('common:Name'),
            icon: 'common/setting'
          },
          {
            label: t('publish:official_account.params'),
            desc: 'App ID / Secret / Token',
            icon: 'core/app/publish/offiaccount'
          }
        ]}
      >
        <OmniModalSection title={t('publish:basic_info')} desc={t('publish:publish_name')}>
          <BasicInfo register={register} setValue={setValue} defaultData={defaultData} />
        </OmniModalSection>
        <OmniModalSection
          title={t('publish:official_account.params')}
          desc={'用于完成公众号消息服务与回调安全配置。'}
          action={
            feConfigs?.docUrl && (
              <Link
                href={getDocPath('/docs/use-cases/external-integration/official_account/')}
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
                App ID
              </FormLabel>
              <Input
                mt={2}
                placeholder="App ID"
                {...register('app.appId', {
                  required: true
                })}
              />
            </OmniFieldCard>
            <OmniFieldCard>
              <FormLabel required color={'#1E293B'} fontWeight={700}>
                Secret
              </FormLabel>
              <Input
                mt={2}
                placeholder="Secret"
                {...register('app.secret', {
                  required: true
                })}
              />
            </OmniFieldCard>
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
              <FormLabel color={'#1E293B'} fontWeight={700}>
                AES Key
              </FormLabel>
              <Input mt={2} placeholder="AES Key" {...register('app.CallbackEncodingAesKey')} />
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

export default OffiAccountEditModal;
