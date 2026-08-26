import React from 'react';
import { Flex, Button, Input, Link } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { FeishuAppType, OutLinkEditType } from '@fastgpt/global/support/outLink/type';
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

const FeiShuEditModal = ({
  appId,
  defaultData,
  onClose,
  onCreate,
  onEdit,
  isEdit = false
}: {
  appId: string;
  defaultData: OutLinkEditType<FeishuAppType>;
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
    (e: Omit<OutLinkEditType<FeishuAppType>, 'appId' | 'type'>) =>
      createShareChat({
        ...e,
        appId,
        type: PublishChannelEnum.feishu,
        app: {
          appId: e?.app?.appId?.trim() ?? '',
          appSecret: e.app?.appSecret?.trim() ?? '',
          encryptKey: e.app?.encryptKey?.trim()
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
          appId: e?.app?.appId?.trim() ?? '',
          appSecret: e.app?.appSecret?.trim() ?? '',
          encryptKey: e.app?.encryptKey?.trim()
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
      iconSrc="core/app/publish/lark"
      title={isEdit ? t('publish:edit_feishu_bot') : t('publish:new_feishu_bot')}
      minW={['auto', '60rem']}
    >
      <OmniModalBody
        icon="core/app/publish/lark"
        title={isEdit ? t('publish:edit_feishu_bot') : t('publish:new_feishu_bot')}
        desc={t('publish:feishu_bot_desc')}
        asideItems={[
          {
            label: t('publish:basic_info'),
            desc: t('common:Name'),
            icon: 'common/setting'
          },
          {
            label: t('publish:feishu_api'),
            desc: 'App ID / App Secret / Encrypt Key',
            icon: 'core/app/publish/lark'
          }
        ]}
      >
        <OmniModalSection title={t('publish:basic_info')} desc={t('publish:feishu_bot_desc')}>
          <BasicInfo
            register={register}
            setValue={setValue}
            defaultData={defaultData}
            showResponseConfig={false}
          />
        </OmniModalSection>
        <OmniModalSection
          title={t('publish:feishu_api')}
          desc={'用于校验飞书应用身份与消息加密配置。'}
          action={
            feConfigs?.docUrl && (
              <Link
                href={getDocPath('/docs/use-cases/external-integration/feishu/')}
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
                App ID
              </FormLabel>
              <Input
                mt={2}
                placeholder={t('common:core.module.http.AppId')}
                {...register('app.appId', {
                  required: true
                })}
              />
            </OmniFieldCard>
            <OmniFieldCard>
              <FormLabel required color={'#1E293B'} fontWeight={700}>
                App Secret
              </FormLabel>
              <Input
                mt={2}
                placeholder={'App Secret'}
                {...register('app.appSecret', {
                  required: true
                })}
              />
            </OmniFieldCard>
            <OmniFieldCard gridColumn={['auto', '1 / -1']}>
              <FormLabel color={'#1E293B'} fontWeight={700}>
                Encrypt Key
              </FormLabel>
              <Input mt={2} placeholder="Encrypt Key" {...register('app.encryptKey')} />
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

export default FeiShuEditModal;
