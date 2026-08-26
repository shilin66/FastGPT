import React from 'react';
import { Flex, Button, Input, Link, RadioGroup, HStack, Radio } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { OutLinkEditType, TeamsAppType } from '@fastgpt/global/support/outLink/type';
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

const TeamsEditModal = ({
  appId,
  defaultData,
  onClose,
  onCreate,
  onEdit,
  isEdit = false
}: {
  appId: string;
  defaultData: OutLinkEditType<TeamsAppType>;
  onClose: () => void;
  onCreate: (id: string) => void;
  onEdit: () => void;
  isEdit?: boolean;
}) => {
  const { t } = useTranslation();
  const {
    register,
    setValue,
    watch,
    handleSubmit: submitShareChat
  } = useForm<OutLinkEditType<TeamsAppType>>({
    defaultValues: {
      ...defaultData,
      app: {
        ...defaultData.app,
        MicrosoftAppType: defaultData.app?.MicrosoftAppType || 'SingleTenant'
      }
    }
  });

  const appType = watch('app.MicrosoftAppType');

  const { runAsync: onclickCreate, loading: creating } = useRequest(
    (e: Omit<OutLinkEditType<TeamsAppType>, 'appId' | 'type'>) =>
      createShareChat({
        ...e,
        appId,
        type: PublishChannelEnum.teams,
        app: {
          MicrosoftAppType: (e.app?.MicrosoftAppType?.trim() || 'SingleTenant') as
            | 'SingleTenant'
            | 'MultiTenant',
          MicrosoftAppId: (e?.app?.MicrosoftAppId?.trim() || '') as string,
          MicrosoftAppPassword: (e.app?.MicrosoftAppPassword?.trim() || '') as string,
          MicrosoftAppTenantId: (e.app?.MicrosoftAppTenantId?.trim() || '') as string
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
          MicrosoftAppType: e.app?.MicrosoftAppType?.trim(),
          MicrosoftAppId: e?.app?.MicrosoftAppId?.trim(),
          MicrosoftAppPassword: e.app?.MicrosoftAppPassword?.trim(),
          MicrosoftAppTenantId: e.app?.MicrosoftAppTenantId?.trim()
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
      iconSrc="common/teamsFill"
      title={
        isEdit ? t('publish:teams.bot.edit_modal_title') : t('publish:teams.bot.create_modal_title')
      }
      minW={['auto', '60rem']}
    >
      <OmniModalBody
        icon="common/teamsFill"
        title={
          isEdit
            ? t('publish:teams.bot.edit_modal_title')
            : t('publish:teams.bot.create_modal_title')
        }
        desc={t('publish:teams.api')}
        asideItems={[
          {
            label: t('publish:basic_info'),
            desc: t('common:Name'),
            icon: 'common/setting'
          },
          {
            label: t('publish:teams.api'),
            desc: 'Microsoft App',
            icon: 'common/teamsFill'
          }
        ]}
      >
        <OmniModalSection title={t('publish:basic_info')} desc={t('publish:publish_name')}>
          <BasicInfo register={register} setValue={setValue} defaultData={defaultData} />
        </OmniModalSection>
        <OmniModalSection
          title={t('publish:teams.api')}
          desc={'用于连接 Microsoft Teams 机器人并配置租户范围。'}
          action={
            feConfigs?.docUrl && (
              <Link
                href={getDocPath('/docs/use-cases/external-integration/teams/')}
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
            <OmniFieldCard gridColumn={['auto', '1 / -1']}>
              <FormLabel required color={'#1E293B'} fontWeight={700}>
                App Type
              </FormLabel>
              <RadioGroup
                mt={3}
                onChange={(value: 'SingleTenant' | 'MultiTenant') =>
                  setValue('app.MicrosoftAppType', value)
                }
                value={appType}
              >
                <HStack spacing={4}>
                  <Radio value={'SingleTenant'}>SingleTenant</Radio>
                  <Radio value={'MultiTenant'}>MultiTenant</Radio>
                </HStack>
              </RadioGroup>
            </OmniFieldCard>
            <OmniFieldCard>
              <FormLabel required color={'#1E293B'} fontWeight={700}>
                App Id
              </FormLabel>
              <Input
                mt={2}
                placeholder={'MicrosoftAppId'}
                {...register('app.MicrosoftAppId', {
                  required: true
                })}
              />
            </OmniFieldCard>
            <OmniFieldCard>
              <FormLabel required color={'#1E293B'} fontWeight={700}>
                App Password
              </FormLabel>
              <Input
                mt={2}
                placeholder={'MicrosoftAppPassword'}
                {...register('app.MicrosoftAppPassword', {
                  required: true
                })}
              />
            </OmniFieldCard>
            {appType === 'SingleTenant' && (
              <OmniFieldCard gridColumn={['auto', '1 / -1']}>
                <FormLabel required color={'#1E293B'} fontWeight={700}>
                  App TenantId
                </FormLabel>
                <Input
                  mt={2}
                  placeholder={'MicrosoftAppTenantId'}
                  {...register('app.MicrosoftAppTenantId', {
                    required: appType === 'SingleTenant'
                  })}
                />
              </OmniFieldCard>
            )}
          </OmniFormGrid>
        </OmniModalSection>
      </OmniModalBody>
      <OmniModalFooter>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common:Close')}
        </Button>
        <Button
          isLoading={creating || updating}
          onClick={submitShareChat((data) => {
            if (isEdit) {
              if (data.app?.MicrosoftAppType === 'MultiTenant') {
                data.app.MicrosoftAppTenantId = '';
              }
              return onclickUpdate(data);
            } else {
              return onclickCreate(data);
            }
          })}
        >
          {t('common:Confirm')}
        </Button>
      </OmniModalFooter>
    </MyModal>
  );
};

export default TeamsEditModal;
