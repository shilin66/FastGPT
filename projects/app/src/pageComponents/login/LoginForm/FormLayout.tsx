import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { OAuthEnum } from '@fastgpt/global/support/user/constant';
import { useRouter } from 'next/router';
import { type Dispatch, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import I18nLngSelector from '@/components/Select/I18nLngSelector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { checkIsWecomTerminal } from '@fastgpt/global/support/user/login/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import Avatar from '@fastgpt/web/components/common/Avatar';
import dynamic from 'next/dynamic';
import { POST } from '@/web/common/api/request';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { OMNICOCKPIT_NAME } from '@/web/common/brand/constants';
import { omniTheme } from '@/web/common/brand/theme';

type Props = {
  children: React.ReactNode;
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
  pageType: `${LoginPageTypeEnum}`;
};

type OAuthItem = {
  label: string;
  provider: OAuthEnum | LoginPageTypeEnum;
  icon: any;
  pageType?: LoginPageTypeEnum;
  redirectUrl?: string;
};

const FormLayout = ({ children, setPageType, pageType }: Props) => {
  const { t } = useTranslation();
  const router = useRouter();
  const rootLogin = router.query.rootLogin === '1';

  const { setLoginStore, feConfigs } = useSystemStore();
  const { isPc } = useSystem();

  const { lastRoute = '/dashboard/agent' } = router.query as { lastRoute: string };
  const computedLastRoute = useMemo(() => {
    return router.pathname === '/chat' ? router.asPath : lastRoute;
  }, [lastRoute, router.pathname, router.asPath]);

  const state = useRef(getNanoid(8));
  const redirectUri = `${location.origin}/login/provider`;

  const isWecomWorkTerminal = checkIsWecomTerminal();

  const oAuthList: OAuthItem[] = useMemo(
    () => [
      ...(feConfigs?.sso?.url
        ? [
            {
              label: feConfigs.sso.title || 'Unknown',
              provider: OAuthEnum.sso,
              icon: feConfigs.sso.icon
            }
          ]
        : []),
      ...(feConfigs?.oauth?.wechat && pageType !== LoginPageTypeEnum.wechat
        ? [
            {
              label: t('common:support.user.login.Wechat'),
              provider: OAuthEnum.wechat,
              icon: 'common/wechatFill',
              pageType: LoginPageTypeEnum.wechat
            }
          ]
        : []),
      ...(pageType !== LoginPageTypeEnum.passwordLogin
        ? [
            {
              label: t('common:support.user.login.Password login'),
              provider: LoginPageTypeEnum.passwordLogin,
              icon: 'support/permission/privateLight',
              pageType: LoginPageTypeEnum.passwordLogin
            }
          ]
        : []),
      ...(feConfigs?.oauth?.microsoft
        ? [
            {
              label: t('common:support.user.login.Microsoft'),
              provider: OAuthEnum.microsoft,
              icon: 'common/microsoftFill',
              redirectUrl: `https://login.microsoftonline.com/${feConfigs?.oauth?.microsoft.tenantId}/oauth2/v2.0/authorize?response_type=code&client_id=${feConfigs?.oauth?.microsoft.clientId}&redirect_uri=${redirectUri}&state=${state.current}&scope=user.read&prompt=select_account`
            }
          ]
        : []),
      ...(feConfigs?.oauth?.google
        ? [
            {
              label: t('common:support.user.login.Google'),
              provider: OAuthEnum.google,
              icon: 'common/googleFill',
              redirectUrl: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${feConfigs?.oauth?.google}&redirect_uri=${redirectUri}&state=${state.current}&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.profile%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email%20openid&include_granted_scopes=true`
            }
          ]
        : []),
      ...(feConfigs?.oauth?.github
        ? [
            {
              label: t('common:support.user.login.Github'),
              provider: OAuthEnum.github,
              icon: 'common/gitFill',
              redirectUrl: `https://github.com/login/oauth/authorize?client_id=${feConfigs?.oauth?.github}&redirect_uri=${redirectUri}&state=${state.current}&scope=user:email%20read:user`
            }
          ]
        : [])
      // ...(feConfigs?.oauth?.microsoft
      //   ? [
      //       {
      //         label:
      //           feConfigs?.oauth?.microsoft?.customButton ||
      //           t('common:support.user.login.Microsoft'),
      //         provider: OAuthEnum.microsoft,
      //         icon: 'common/microsoft',
      //         redirectUrl: `https://login.microsoftonline.com/${feConfigs?.oauth?.microsoft?.tenantId || 'common'}/oauth2/v2.0/authorize?client_id=${feConfigs?.oauth?.microsoft?.clientId}&response_type=code&redirect_uri=${redirectUri}&response_mode=query&scope=https%3A%2F%2Fgraph.microsoft.com%2Fuser.read&state=${state.current}`
      //       }
      //     ]
      //   : [])
    ],
    [feConfigs, pageType, redirectUri, t]
  );

  const show_oauth = useMemo(
    () => !!(feConfigs?.sso?.url || oAuthList.length > 0),
    [feConfigs?.sso?.url, oAuthList.length]
  );

  const onClickOauth = useCallback(
    async (item: OAuthItem) => {
      if (item.provider === OAuthEnum.sso) {
        const redirectUrl = await POST<string>('/proApi/support/user/account/login/getAuthURL', {
          redirectUri,
          isWecomWorkTerminal
        });
        setLoginStore({
          provider: item.provider as OAuthEnum,
          lastRoute: computedLastRoute,
          state: state.current
        });
        router.replace(redirectUrl, '_self');
        return;
      }

      if (item.provider === OAuthEnum.wecom) {
        const redirectUrl = await POST<string>(
          '/proApi/support/user/account/login/wecom/getRedirectUrl',
          {
            redirectUri,
            isWecomWorkTerminal,
            state: state.current
          }
        );
        setLoginStore({
          provider: item.provider as OAuthEnum,
          lastRoute: computedLastRoute,
          state: state.current
        });
        router.replace(redirectUrl, '_self');
        return;
      }

      if (item.redirectUrl) {
        setLoginStore({
          provider: item.provider as OAuthEnum,
          lastRoute: computedLastRoute,
          state: state.current
        });
        router.replace(item.redirectUrl, '_self');
      }
      item.pageType && setPageType(item.pageType);
    },
    [computedLastRoute, isWecomWorkTerminal, redirectUri, router, setLoginStore, setPageType]
  );

  // Auto login
  useEffect(() => {
    if (rootLogin) return;
    const sso = oAuthList.find((item) => item.provider === OAuthEnum.sso);
    // sso auto login
    if (sso && (feConfigs?.sso?.autoLogin || isWecomWorkTerminal)) onClickOauth(sso);
    if (feConfigs.oauth?.wechat && isWecomWorkTerminal) {
      onClickOauth({
        provider: OAuthEnum.wecom
      } as any);
    }
  }, [
    rootLogin,
    feConfigs?.sso?.autoLogin,
    isWecomWorkTerminal,
    onClickOauth,
    oAuthList,
    feConfigs.oauth?.wechat
  ]);

  return (
    <Flex flexDirection="column" h={isPc ? 'auto' : '100%'}>
      <Flex alignItems="center" justifyContent={isPc ? 'flex-start' : 'space-between'}>
        <Flex alignItems="center" gap={isPc ? '10px' : 0} pr="4">
          <Flex
            w="42px"
            h="42px"
            bg={omniTheme.colors.pageBg}
            borderRadius={isPc ? '11px' : 'semilg'}
            borderWidth="1px"
            borderColor={omniTheme.colors.border}
            alignItems="center"
            justifyContent="center"
            boxShadow={`inset 0 0 0 1px ${omniTheme.colors.surface}`}
          >
            <MyImage src={LOGO_ICON} w={isPc ? '24px' : '22.5px'} alt="icon" />
          </Flex>
          <Box
            ml={isPc ? 0 : 3}
            fontSize={isPc ? '15px' : 'lg'}
            fontWeight={isPc ? 750 : 'bold'}
            color={omniTheme.colors.text}
          >
            {feConfigs?.systemTitle || OMNICOCKPIT_NAME}
          </Box>
        </Flex>
        {!isPc && <I18nLngSelector />}
      </Flex>
      {children}
      {show_oauth && (
        <Box mt={isPc ? '22px' : '80px'}>
          <Flex
            position="relative"
            mb={isPc ? '15px' : 5}
            alignItems="center"
            gap={isPc ? '10px' : 0}
          >
            <Box h="1px" flex="1" bg={omniTheme.colors.border} />
            <Box px={isPc ? 0 : 3} color="myGray.500" fontSize={isPc ? '10px' : 'mini'}>
              {isPc ? t('login:other_login_methods') : 'or'}
            </Box>
            <Box h="1px" flex="1" bg={omniTheme.colors.border} />
          </Flex>

          <Flex gap={isPc ? '10px' : 4} alignItems="center" justifyContent="center">
            {oAuthList.map((item) => (
              <MyTooltip key={item.provider} label={item.label}>
                <IconButton
                  minW={isPc ? '38px' : undefined}
                  size={isPc ? undefined : 'lgSquare'}
                  w={isPc ? '38px' : 'clamp(40px, 2.8vw, 52px)'}
                  h={isPc ? '38px' : 'clamp(40px, 2.8vw, 52px)'}
                  borderRadius="50%"
                  aria-label={item.label}
                  variant={'whitePrimary'}
                  border="1px solid"
                  borderColor={omniTheme.colors.border}
                  bg={omniTheme.colors.surface}
                  _hover={{ bg: omniTheme.colors.pageBg, borderColor: omniTheme.login.blueLight }}
                  _focusVisible={{ boxShadow: omniTheme.login.focusRing }}
                  icon={<Avatar src={item.icon as any} w={isPc ? '18px' : '20px'} />}
                  onClick={() => onClickOauth(item)}
                />
              </MyTooltip>
            ))}
          </Flex>
        </Box>
      )}
    </Flex>
  );
};

export default dynamic(() => Promise.resolve(FormLayout), {
  ssr: false
});
