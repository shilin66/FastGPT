import React from 'react';
import { Button, Flex, Input } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { WechatAppType, OutLinkEditType } from '@fastgpt/global/support/outLink/type';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { createShareChat, updateShareChat } from '@/web/support/outLink/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import {
  OmniFieldCard,
  OmniFormGrid,
  OmniModalBody,
  OmniModalFooter,
  OmniModalSection
} from '../../components/OmniModalLayout';

const WechatEditModal = ({
  appId,
  defaultData,
  onClose,
  onCreate,
  onEdit,
  isEdit = false
}: {
  appId: string;
  defaultData: OutLinkEditType<WechatAppType>;
  onClose: () => void;
  onCreate: (shareId: string) => Promise<string | undefined>;
  onEdit: () => void;
  isEdit?: boolean;
}) => {
  const { t } = useTranslation();
  const { register, setValue, handleSubmit } = useForm({
    defaultValues: defaultData
  });

  const { runAsync: onclickCreate, loading: creating } = useRequest(
    (e) =>
      createShareChat({
        ...e,
        appId,
        type: PublishChannelEnum.wechat
      }),
    {
      errorToast: t('common:create_failed'),
      successToast: t('common:create_success'),
      onSuccess: async (shareId) => {
        const _id = await onCreate(shareId);
        if (_id) setValue('_id', _id);
        onClose();
      }
    }
  );

  const { runAsync: onclickUpdate, loading: updating } = useRequest((e) => updateShareChat(e), {
    errorToast: t('common:update_failed'),
    successToast: t('common:update_success'),
    onSuccess: () => {
      onEdit();
      onClose();
    }
  });

  return (
    <MyModal
      iconSrc="core/app/publish/wechat"
      title={isEdit ? t('publish:wechat.edit') : t('publish:wechat.create')}
      minW={['auto', '500px']}
      onClose={onClose}
    >
      <OmniModalBody
        icon="core/app/publish/wechat"
        title={isEdit ? t('publish:wechat.edit') : t('publish:wechat.create')}
        desc={t('publish:wechat.name_placeholder')}
        asideItems={[
          {
            label: t('publish:basic_info'),
            desc: t('common:Name'),
            icon: 'common/setting'
          },
          {
            label: t('common:support.outlink.Max usage points'),
            desc: t('common:support.outlink.Max usage points tip'),
            icon: 'common/setting'
          }
        ]}
        minH={['auto', '360px']}
      >
        <OmniModalSection
          title={t('publish:basic_info')}
          desc={t('publish:wechat.name_placeholder')}
        >
          <OmniFormGrid gridTemplateColumns={'1fr'}>
            <OmniFieldCard>
              <FormLabel required color={'#1E293B'} fontWeight={700}>
                {t('common:Name')}
              </FormLabel>
              <Input
                mt={2}
                placeholder={t('publish:wechat.name_placeholder')}
                maxLength={100}
                {...register('name', { required: t('common:name_is_empty') })}
              />
            </OmniFieldCard>
            <OmniFieldCard>
              <Flex alignItems={'center'}>
                <FormLabel color={'#1E293B'} fontWeight={700}>
                  {t('common:support.outlink.Max usage points')}
                </FormLabel>
                <QuestionTip ml={1} label={t('common:support.outlink.Max usage points tip')} />
              </Flex>
              <Input
                mt={2}
                {...register('limit.maxUsagePoints', {
                  min: -1,
                  max: 10000000,
                  valueAsNumber: true
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
          onClick={handleSubmit((data) => (isEdit ? onclickUpdate(data) : onclickCreate(data)))}
        >
          {t('common:Confirm')}
        </Button>
      </OmniModalFooter>
    </MyModal>
  );
};

export default WechatEditModal;
