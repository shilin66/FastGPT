import React, { useEffect, type Dispatch } from 'react';
import { FormControl, Flex, Input, Button, Box } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { postLogin, getPreLogin } from '@/web/support/user/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import FormLayout from './FormLayout';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSearchParams } from 'next/navigation';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { useRouter } from 'next/router';
import { useMount } from 'ahooks';
import type { LangEnum } from '@fastgpt/global/common/i18n/type';
import type { LoginSuccessResponseType } from '@fastgpt/global/openapi/support/user/account/login/api';
import { omniTheme } from '@/web/common/brand/theme';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import LoginFieldLabel from './LoginFieldLabel';

interface Props {
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
  loginSuccess: (e: LoginSuccessResponseType) => void;
}

interface LoginFormType {
  username: string;
  password: string;
}

const LoginForm = ({ setPageType, loginSuccess }: Props) => {
  const { t, i18n } = useTranslation();
  const { isPc } = useSystem();
  const { feConfigs } = useSystemStore();
  const query = useSearchParams();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginFormType>();

  const { runAsync: onclickLogin, loading: requesting } = useRequest(
    async ({ username, password }: LoginFormType) => {
      const { code } = await getPreLogin(username);
      loginSuccess(
        await postLogin({
          username,
          password,
          code,
          language: i18n.language as LangEnum
        })
      );
    },
    {
      refreshDeps: [loginSuccess],
      successToast: t('login:login_success'),
      onError: (error: any) => {
        // 密码错误，需要清空 query 参数
        if (error.statusText === UserErrEnum.account_psw_error) {
          router.replace(
            router.pathname,
            {
              query: {
                ...router.query,
                u: '',
                p: ''
              }
            },
            {
              shallow: false
            }
          );
        }
      }
    }
  );

  const isCommunityVersion = !!(feConfigs?.register_method && !feConfigs?.isPlus);

  const placeholder = (() => {
    if (isCommunityVersion) {
      return t('login:use_root_login');
    }
    return [t('common:support.user.login.Username')]
      .concat(
        feConfigs?.login_method?.map((item) => {
          switch (item) {
            case 'email':
              return t('common:support.user.login.Email');
            case 'phone':
              return t('common:support.user.login.Phone number');
          }
        }) ?? []
      )
      .join('/');
  })();

  useMount(() => {
    const username = query.get('u');
    const password = query.get('p');
    if (username && password) {
      onclickLogin({
        username,
        password
      });
    }
  });

  return (
    <FormLayout setPageType={setPageType} pageType={LoginPageTypeEnum.passwordLogin}>
      <Box mt={isPc ? '26px' : 7}>
        <Box
          fontSize={isPc ? '25px' : 'clamp(26px, 1.7vw, 34px)'}
          lineHeight={isPc ? '35px' : 'normal'}
          fontWeight={800}
          color={omniTheme.colors.text}
        >
          {t('login:welcome_back')}
        </Box>
        <Box
          mt={isPc ? '8px' : 2.5}
          mb={isPc ? '25px' : 0}
          fontSize={isPc ? '12px' : 'clamp(13px, 0.9vw, 16px)'}
          lineHeight={isPc ? '16.5px' : 1.6}
          color={omniTheme.colors.muted}
        >
          {t('login:login_sub_title')}
        </Box>
      </Box>
      <Box
        mt={isPc ? 0 : 7}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !requesting) {
            handleSubmit(onclickLogin)();
          }
        }}
      >
        <FormControl isInvalid={!!errors.username}>
          <LoginFieldLabel isPc={isPc}>{t('common:support.user.login.Username')}</LoginFieldLabel>
          <Input
            h={isPc ? '44px' : 'clamp(48px, 4.2vh, 58px)'}
            px={isPc ? '13px' : 4}
            bg="white"
            borderWidth="1px"
            borderColor={omniTheme.colors.border}
            borderRadius={isPc ? '9px' : 'clamp(10px, 0.7vw, 13px)'}
            fontSize={isPc ? '12px' : 'clamp(13px, 0.9vw, 15px)'}
            _placeholder={{ color: omniTheme.login.placeholder }}
            _focusVisible={{
              borderColor: omniTheme.login.blueLight,
              boxShadow: omniTheme.login.focusRing
            }}
            autoComplete="username"
            placeholder={isPc ? t('login:username_placeholder') : placeholder}
            {...register('username', {
              required: true
            })}
          ></Input>
        </FormControl>
        <FormControl mt={isPc ? '13px' : 3.5} isInvalid={!!errors.password}>
          <LoginFieldLabel isPc={isPc}>{t('common:support.user.login.Password')}</LoginFieldLabel>
          <Input
            h={isPc ? '44px' : 'clamp(48px, 4.2vh, 58px)'}
            px={isPc ? '13px' : 4}
            bg="white"
            borderWidth="1px"
            borderColor={omniTheme.colors.border}
            borderRadius={isPc ? '9px' : 'clamp(10px, 0.7vw, 13px)'}
            fontSize={isPc ? '12px' : 'clamp(13px, 0.9vw, 15px)'}
            _placeholder={{ color: omniTheme.login.placeholder }}
            _focusVisible={{
              borderColor: omniTheme.login.blueLight,
              boxShadow: omniTheme.login.focusRing
            }}
            type="password"
            autoComplete="current-password"
            placeholder={
              isPc
                ? t('login:password_input_placeholder')
                : isCommunityVersion
                  ? t('login:root_password_placeholder')
                  : t('common:support.user.login.Password')
            }
            {...register('password', {
              required: true,
              maxLength: {
                value: 60,
                message: t('login:password_condition')
              }
            })}
          ></Input>
        </FormControl>
        {/*<PolicyTip isCenter={false} />*/}

        <Button
          type="submit"
          mt={isPc ? '18px' : 7}
          w="100%"
          h={isPc ? '44px' : 'clamp(48px, 4.2vh, 58px)'}
          borderRadius={isPc ? '9px' : 'clamp(10px, 0.7vw, 13px)'}
          fontSize={isPc ? '13px' : 'clamp(14px, 0.95vw, 16px)'}
          bg={omniTheme.colors.graphite}
          color="white"
          _hover={{ bg: omniTheme.login.graphiteLight }}
          _active={{ bg: omniTheme.colors.graphiteHover }}
          _focusVisible={{ boxShadow: omniTheme.login.focusRing }}
          fontWeight={700}
          isLoading={requesting}
          onClick={handleSubmit(onclickLogin)}
        >
          {t('login:Login')}
        </Button>

        <Flex
          mt={isPc ? '13px' : 0}
          align="center"
          justifyContent={isPc ? 'space-between' : 'flex-end'}
          color="primary.700"
          fontSize="11px"
          fontWeight="medium"
        >
          {isPc && feConfigs?.find_password_method && feConfigs.find_password_method.length > 0 ? (
            <Box
              cursor="pointer"
              _hover={{ textDecoration: 'underline' }}
              onClick={() => setPageType(LoginPageTypeEnum.forgetPassword)}
            >
              {t('login:forget_password')}
            </Box>
          ) : isPc ? (
            <Box />
          ) : null}
          {feConfigs?.register_method && feConfigs.register_method.length > 0 && (
            <Flex alignItems="center">
              {!isPc && <Box mx={3} h="12px" w="1px" bg="myGray.250" />}
              <Box
                cursor="pointer"
                _hover={{ textDecoration: 'underline' }}
                onClick={() => setPageType(LoginPageTypeEnum.register)}
              >
                {t('login:register')}
              </Box>
            </Flex>
          )}
        </Flex>
      </Box>
    </FormLayout>
  );
};

export default LoginForm;
