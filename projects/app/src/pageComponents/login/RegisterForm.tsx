import React, { type Dispatch } from 'react';
import { FormControl, Box, Input, Button } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { postRegister, postSimpleRegister } from '@/web/support/user/api';
import { useSendCode } from '@/web/support/user/hooks/useSendCode';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  getBdVId,
  getFastGPTSem,
  getInviterId,
  getMsclkid,
  getSourceDomain,
  removeFastGPTSem
} from '@/web/support/marketing/utils';
import { checkPasswordRule } from '@fastgpt/global/common/string/password';
import type { LoginSuccessResponseType } from '@fastgpt/global/openapi/support/user/account/login/api';
import { omniTheme } from '@/web/common/brand/theme';

interface Props {
  loginSuccess: (e: LoginSuccessResponseType) => void;
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
}

interface RegisterType {
  username: string;
  password: string;
  password2: string;
  code: string;
}

const RegisterForm = ({ setPageType, loginSuccess }: Props) => {
  const { toast } = useToast();
  const { t } = useTranslation();

  const { feConfigs } = useSystemStore();
  const {
    register,
    handleSubmit,
    getValues,
    watch,
    formState: { errors }
  } = useForm<RegisterType>({
    mode: 'onBlur'
  });
  const username = watch('username');

  const { SendCodeBox, openCodeAuthModal } = useSendCode({ type: 'register' });

  const { runAsync: onclickRegister, loading: requesting } = useRequest(
    async ({ username, password, code }: RegisterType) => {
      loginSuccess(
        await postSimpleRegister({
          username,
          password
        })
        // await postRegister({
        //   username,
        //   code,
        //   password,
        //   inviterId: getInviterId(),
        //   bd_vid: getBdVId(),
        //   msclkid: getMsclkid(),
        //   fastgpt_sem: getFastGPTSem(),
        //   sourceDomain: getSourceDomain()
        // })
      );
      removeFastGPTSem();

      toast({
        status: 'success',
        title: t('user:register.success')
      });
    },
    {
      refreshDeps: [loginSuccess, t, toast]
    }
  );
  const onSubmitErr = (err: Record<string, any>) => {
    const val = Object.values(err)[0];
    if (!val) return;
    if (val.message) {
      toast({
        status: 'warning',
        title: val.message,
        duration: 3000,
        isClosable: true
      });
    }
  };

  const placeholder = feConfigs?.register_method
    ?.map((item) => {
      switch (item) {
        case 'email':
          return t('common:support.user.login.Email');
        case 'phone':
          return t('common:support.user.login.Phone number');
      }
    })
    .join('/');

  return (
    <>
      <Box fontWeight={600} fontSize={'clamp(18px, 1.3vw, 22px)'} color={omniTheme.colors.text}>
        {t('user:register.register_account', { account: feConfigs?.systemTitle })}
      </Box>
      <Box
        mt={9}
        onKeyDown={(e) => {
          if (!openCodeAuthModal && e.key === 'Enter' && !e.shiftKey && !requesting) {
            handleSubmit(onclickRegister, onSubmitErr)();
          }
        }}
      >
        <FormControl isInvalid={!!errors.username}>
          <Input
            bg={'white'}
            borderWidth={'1px'}
            borderColor={omniTheme.colors.border}
            borderRadius={'clamp(10px, 0.7vw, 13px)'}
            h={'clamp(48px, 4.2vh, 58px)'}
            fontSize={'clamp(13px, 0.9vw, 15px)'}
            placeholder={placeholder}
            {...register('username', {
              required: t('user:password.email_phone_void'),
              pattern: {
                value:
                  /(^1[3456789]\d{9}$)|(^[A-Za-z0-9]+([_\.][A-Za-z0-9]+)*@([A-Za-z0-9\-]+\.)+[A-Za-z]{2,6}$)/,
                message: t('user:password.email_phone_error')
              }
            })}
          ></Input>
        </FormControl>
        {/*<FormControl*/}
        {/*  mt={6}*/}
        {/*  isInvalid={!!errors.code}*/}
        {/*  display={'flex'}*/}
        {/*  alignItems={'center'}*/}
        {/*  position={'relative'}*/}
        {/*>*/}
        {/*  <Input*/}
        {/*    size={'lg'}*/}
        {/*    bg={'myGray.50'}*/}
        {/*    flex={1}*/}
        {/*    maxLength={8}*/}
        {/*    placeholder={t('user:password.verification_code')}*/}
        {/*    {...register('code', {*/}
        {/*      required: t('user:password.code_required')*/}
        {/*    })}*/}
        {/*  ></Input>*/}
        {/*  <SendCodeBox username={username} />*/}
        {/*</FormControl>*/}
        <FormControl mt={6} isInvalid={!!errors.password}>
          <Input
            bg={'white'}
            borderWidth={'1px'}
            borderColor={omniTheme.colors.border}
            borderRadius={'clamp(10px, 0.7vw, 13px)'}
            h={'clamp(48px, 4.2vh, 58px)'}
            fontSize={'clamp(13px, 0.9vw, 15px)'}
            type={'password'}
            placeholder={t('login:password_tip')}
            {...register('password', {
              required: true,
              validate: (val) => {
                // if (!checkPasswordRule(val)) {
                //   return t('login:password_tip');
                // }
                return true;
              }
            })}
          ></Input>
        </FormControl>
        <FormControl mt={6} isInvalid={!!errors.password2}>
          <Input
            bg={'white'}
            borderWidth={'1px'}
            borderColor={omniTheme.colors.border}
            borderRadius={'clamp(10px, 0.7vw, 13px)'}
            h={'clamp(48px, 4.2vh, 58px)'}
            fontSize={'clamp(13px, 0.9vw, 15px)'}
            type={'password'}
            placeholder={t('user:password.confirm')}
            {...register('password2', {
              validate: (val) =>
                getValues('password') === val ? true : t('user:password.not_match')
            })}
          />
        </FormControl>
        <Button
          type="submit"
          mt={10}
          w={'100%'}
          h={'clamp(48px, 4.2vh, 58px)'}
          borderRadius={'clamp(10px, 0.7vw, 13px)'}
          fontSize={'clamp(14px, 0.95vw, 16px)'}
          bg={omniTheme.colors.graphite}
          color={'white'}
          _hover={{ bg: omniTheme.colors.graphiteHover }}
          _active={{ bg: omniTheme.colors.graphiteHover }}
          fontWeight={'medium'}
          isLoading={requesting}
          onClick={handleSubmit(onclickRegister, onSubmitErr)}
        >
          {t('user:register.confirm')}
        </Button>
        <Box
          float={'right'}
          fontSize="mini"
          mt={3}
          fontWeight={'medium'}
          color={'primary.700'}
          cursor={'pointer'}
          _hover={{ textDecoration: 'underline' }}
          onClick={() => setPageType(LoginPageTypeEnum.passwordLogin)}
        >
          {t('user:register.to_login')}
        </Box>
      </Box>
    </>
  );
};

export default RegisterForm;
