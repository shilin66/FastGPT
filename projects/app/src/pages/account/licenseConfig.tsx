'use client';
import { Box, Button, Card, Flex, Input } from '@chakra-ui/react';
import React, { useEffect } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { serviceSideProps } from '@/web/common/i18n/utils';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import type { LicenseDataType } from '@fastgpt/global/common/system/types';
1;
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { createLicenseData, getLicenseData } from '@/web/support/license/api';
import MyBox from '@fastgpt/web/components/common/MyBox';

const LicenseConfig = () => {
  const { t } = useTranslation();

  const {
    data: licenseData = {},
    loading: isGetting,
    run: refetch
  } = useRequest2(() => getLicenseData(), {
    manual: false
  });

  const { register, handleSubmit, reset } = useForm<LicenseDataType>({
    defaultValues: licenseData
  });
  // 添加数据更新监听
  useEffect(() => {
    if (licenseData) {
      reset(licenseData);
    }
  }, [licenseData, reset]);

  const InputStyles = {
    maxW: '750px',
    bg: 'myGray.50',
    w: '100%',
    rows: 3
  };

  const { runAsync: updateLicense, loading: updatingLicense } = useRequest2(
    async (data: LicenseDataType) => {
      await createLicenseData(data);
    },
    {
      onSuccess: () => {
        refetch();
      },
      successToast: t('common:Success')
    }
  );

  return (
    <AccountContainer>
      <MyBox py={[3, '28px']} px={['5vw', '64px']} isLoading={isGetting}>
        <Flex alignItems={'center'} fontSize={'lg'} h={'30px'}>
          <MyIcon mr={2} name={'common/settingLight'} w={'20px'} />
          {t('account:license_config')}
        </Flex>

        <Card mt={6} px={[3, 10]} py={[3, 7]} fontSize={'sm'}>
          <Flex alignItems={'center'} w={['85%', '750px']}>
            <Box flex={'0 0 150px'}>License Server:&nbsp;</Box>
            <Box flex={'1 0 0'}>
              <Input {...register('licenseServer', { required: true })} {...InputStyles} />
            </Box>
          </Flex>
          <Flex mt={6} alignItems={'center'} w={['85%', '750px']}>
            <Box flex={'0 0 150px'}>Client Id:&nbsp;</Box>
            <Box flex={'1 0 0'}>
              <Input {...register('clientId', { required: true })} {...InputStyles} />
            </Box>
          </Flex>
          <Flex mt={6} alignItems={'center'} w={['85%', '750px']}>
            <Box flex={'0 0 150px'}>License Key:&nbsp;</Box>
            <Box flex={'1 0 0'}>
              <MyTextarea
                {...register('licenseKey')}
                {...InputStyles}
                style={{ resize: 'none', height: '200px' }}
              />
            </Box>
          </Flex>
          <Flex mt={6} alignItems={'center'} w={['85%', '750px']}>
            <Button isLoading={updatingLicense} onClick={handleSubmit(updateLicense)}>
              {t('common:Update')}
            </Button>
          </Flex>
        </Card>
      </MyBox>
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account', 'account_setting']))
    }
  };
}

export default LicenseConfig;
