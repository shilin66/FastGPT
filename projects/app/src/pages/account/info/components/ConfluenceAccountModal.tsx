import React from 'react';
import { ModalBody, Box, Flex, Input, ModalFooter, Button, Link } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type { UserType } from '@fastgpt/global/support/user/type.d';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const ConfluenceAccountModal = ({
  defaultData,
  onSuccess,
  onClose
}: {
  defaultData: UserType['confluenceAccount'];
  onSuccess: (e: UserType['confluenceAccount']) => Promise<any>;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { register, handleSubmit } = useForm({
    defaultValues: defaultData
  });
  const { feConfigs } = useSystemStore();

  const { mutate: onSubmit, isLoading } = useRequest({
    mutationFn: async (data: UserType['confluenceAccount']) => onSuccess(data),
    onSuccess(res) {
      onClose();
    },
    errorToast: t('common:user.Set Confluence Account Failed')
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="core/dataset/confluenceDataset"
      title={t('common:user.Confluence Account Setting')}
    >
      <ModalBody>
        <Box fontSize={'sm'} color={'myGray.500'}>
          {t('common:info.confluence_account_notice')}
          <Link
            href={`${feConfigs.confluenceUrl}/spaces/Monitor/pages/12336791603/Confluence`}
            target="_blank"
            textDecoration={'underline'}
            fontWeight={'bold'}
            fontSize={'sm'}
          >
            {t('common:common.course.Read Course')}
          </Link>
        </Box>
        <Box mt={5}>
          <Box mb={2} fontWeight={'medium'} fontSize={'sm'}>
            {t('common:user.Confluence Account')}:
          </Box>
          <Input
            autoComplete="off"
            {...register('account', {
              value: userInfo?.username
            })}
          ></Input>
        </Box>
        <Box mt={3}>
          <Flex mb={2} fontWeight={'medium'} fontSize={'sm'} alignItems={'center'}>
            <Box>{t('common:user.Confluence Api Token')}:</Box>
            <QuestionTip
              label={
                '在Confluence页面依次点击右上角「头像」-「管理账户」-「安全性」-「创建并管理API令牌」'
              }
              ml={1}
            />
          </Flex>
          <Input
            autoComplete="new-password"
            type={'password'}
            placeholder={'Your Api Token'}
            {...register('apiToken')}
          ></Input>
        </Box>
      </ModalBody>
      <ModalFooter>
        <Button mr={3} variant={'whiteBase'} onClick={onClose}>
          {t('common:common.Cancel')}
        </Button>
        <Button isLoading={isLoading} onClick={handleSubmit((data) => onSubmit(data))}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default ConfluenceAccountModal;
