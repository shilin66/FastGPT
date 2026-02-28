import React from 'react';
import {
  Flex,
  Box,
  Button,
  ModalBody,
  Input,
  Link,
  RadioGroup,
  HStack,
  Radio
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { OutLinkEditType, TeamsAppType } from '@fastgpt/global/support/outLink/type';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { createShareChat, updateShareChat } from '@/web/support/outLink/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import BasicInfo from '../components/BasicInfo';
import { getDocPath } from '@/web/common/system/doc';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

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

  const { runAsync: onclickCreate, loading: creating } = useRequest2(
    (e: Omit<OutLinkEditType<TeamsAppType>, 'appId' | 'type'>) =>
      createShareChat({
        ...e,
        appId,
        type: PublishChannelEnum.teams,
        app: {
          MicrosoftAppType: e.app?.MicrosoftAppType?.trim(),
          MicrosoftAppId: e?.app?.MicrosoftAppId?.trim(),
          MicrosoftAppPassword: e.app?.MicrosoftAppPassword?.trim(),
          MicrosoftAppTenantId: e.app?.MicrosoftAppTenantId?.trim()
        }
      }),
    {
      errorToast: t('common:create_failed'),
      successToast: t('common:create_success'),
      onSuccess: onCreate
    }
  );

  const { runAsync: onclickUpdate, loading: updating } = useRequest2(
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
      <ModalBody display={'grid'} gridTemplateColumns={['1fr', '1fr 1fr']} fontSize={'14px'} p={0}>
        <Box p={8} h={['auto', '400px']} borderRight={'base'}>
          <BasicInfo register={register} setValue={setValue} defaultData={defaultData} />
        </Box>
        <Flex p={8} h={['auto', '400px']} flexDirection="column" gap={6}>
          <Flex alignItems="center">
            <Box color="myGray.600">{t('publish:teams.api')}</Box>
            {feConfigs?.docUrl && (
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
            )}
          </Flex>
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 6.25rem'} required>
              App Type
            </FormLabel>
            <RadioGroup
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
          </Flex>
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 6.25rem'} required>
              App Id
            </FormLabel>
            <Input
              placeholder={'MicrosoftAppId'}
              {...register('app.MicrosoftAppId', {
                required: true
              })}
            />
          </Flex>
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 6.25rem'} required>
              App Password
            </FormLabel>
            <Input
              placeholder={'MicrosoftAppPassword'}
              {...register('app.MicrosoftAppPassword', {
                required: true
              })}
            />
          </Flex>
          {appType === 'SingleTenant' && (
            <Flex alignItems={'center'}>
              <FormLabel flex={'0 0 6.25rem'} required>
                App TenantId
              </FormLabel>
              <Input
                placeholder={'MicrosoftAppTenantId'}
                {...register('app.MicrosoftAppTenantId', {
                  required: appType === 'SingleTenant'
                })}
              />
            </Flex>
          )}
          <Box flex={1}></Box>

          <Flex justifyContent={'end'}>
            <Button variant={'whiteBase'} mr={3} onClick={onClose}>
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
          </Flex>
        </Flex>
      </ModalBody>
    </MyModal>
  );
};

export default TeamsEditModal;
