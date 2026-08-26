'use client';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Flex,
  Button,
  useDisclosure,
  Link,
  Grid,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Spinner
} from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useUserStore } from '@/web/support/user/useUserStore';
import dynamic from 'next/dynamic';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';
import { getDocPath } from '@/web/common/system/doc';
import {
  StandardSubLevelEnum,
  standardSubLevelMap
} from '@fastgpt/global/support/wallet/sub/constants';
import { formatTime2YMD } from '@fastgpt/global/common/string/time';
import { getExtraPlanCardRoute } from '@/web/support/wallet/sub/constants';
import StandardPlanContentList from '@/components/support/wallet/StandardPlanContentList';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useRouter } from 'next/router';
import TeamSelector from '@/pageComponents/account/TeamSelector';
import { getWorkorderURL } from '@/web/common/workorder/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useMount } from 'ahooks';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import TimezoneSelect from '@fastgpt/web/components/common/MySelect/TimezoneSelect';
import { useI18nLng } from '@fastgpt/web/hooks/useI18n';
import { getLangMapping } from '@fastgpt/web/i18n/utils';
import { langMap, type LangEnum } from '@fastgpt/global/common/i18n/type';
import { omniTheme } from '@/web/common/brand/theme';

const RedeemCouponModal = dynamic(() => import('@/pageComponents/account/info/RedeemCouponModal'), {
  ssr: false
});
const DiscountCouponsModal = dynamic(
  () => import('@/pageComponents/account/info/DiscountCouponsModal'),
  { ssr: false }
);
const StandDetailModal = dynamic(
  () => import('@/pageComponents/account/info/standardDetailModal'),
  { ssr: false }
);
const UpdatePswModal = dynamic(() => import('@/pageComponents/account/info/UpdatePswModal'));
// const UpdateContact = dynamic(() => import('@/components/support/user/inform/UpdateContactModal'));
const CommunityModal = dynamic(() => import('@/components/CommunityModal'));

const ModelPriceModal = dynamic(() =>
  import('@/components/core/ai/ModelTable').then((mod) => mod.ModelPriceModal)
);

const Info = () => {
  const { teamPlanStatus, initUserInfo } = useUserStore();
  const standardPlan = teamPlanStatus?.standard;
  const { t } = useTranslation();
  const { isOpen: isOpenContact, onClose: onCloseContact, onOpen: onOpenContact } = useDisclosure();

  useMount(() => {
    initUserInfo();
  });

  return (
    <AccountContainer>
      <Tabs
        h={'100%'}
        display={'flex'}
        flexDirection={'column'}
        isLazy
        variant={'unstyled'}
        bg={omniTheme.colors.pageBg}
      >
        <Flex
          flex={'0 0 auto'}
          minH={'64px'}
          px={[5, 8]}
          alignItems={'center'}
          gap={5}
          bg={'white'}
          borderBottom={'1px solid'}
          borderColor={omniTheme.colors.border}
        >
          <Flex alignItems={'center'} gap={3} minW={0}>
            <Flex
              w={9}
              h={9}
              alignItems={'center'}
              justifyContent={'center'}
              borderRadius={omniTheme.radii.md}
              bg={omniTheme.colors.graphite}
              color={'white'}
              flexShrink={0}
            >
              <MyIcon name={'support/user/userLight'} w={'18px'} />
            </Flex>
            <Box minW={0}>
              <Box fontSize={'lg'} fontWeight={800} color={omniTheme.colors.text} noOfLines={1}>
                {t('account_info:profile_title')}
              </Box>
              <Box mt={0.5} fontSize={'12px'} color={omniTheme.colors.muted} noOfLines={1}>
                {t('account_info:profile_subtitle')}
              </Box>
            </Box>
          </Flex>

          {!!standardPlan && (
            <TabList
              ml={'auto'}
              gap={1}
              p={1}
              bg={omniTheme.colors.sidebarBg}
              borderRadius={'7px'}
              flexShrink={0}
            >
              <Tab
                h={8}
                px={4}
                borderRadius={'6px'}
                fontSize={'sm'}
                fontWeight={700}
                color={omniTheme.colors.muted}
                _selected={{ bg: 'white', color: omniTheme.colors.saturatedBlue }}
              >
                {t('account_info:profile_tab')}
              </Tab>
              <Tab
                h={8}
                px={4}
                borderRadius={'6px'}
                fontSize={'sm'}
                fontWeight={700}
                color={omniTheme.colors.muted}
                _selected={{ bg: 'white', color: omniTheme.colors.saturatedBlue }}
              >
                {t('account_info:package_and_usage')}
              </Tab>
            </TabList>
          )}
        </Flex>

        <TabPanels flex={1} minH={0} overflow={'hidden'}>
          <TabPanel h={'100%'} p={0} overflowY={'auto'}>
            <Box maxW={'1160px'} mx={'auto'} px={[4, 6]} py={[4, 6]}>
              <MyInfo onOpenContact={onOpenContact} />
            </Box>
          </TabPanel>
          {!!standardPlan && (
            <TabPanel h={'100%'} p={0} overflowY={'auto'}>
              <Box maxW={'920px'} mx={'auto'} px={[4, 6]} py={[4, 6]}>
                <PlanUsage />
              </Box>
            </TabPanel>
          )}
        </TabPanels>
      </Tabs>
      {isOpenContact && <CommunityModal onClose={onCloseContact} />}
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account', 'account_info', 'user']))
    }
  };
}

export default React.memo(Info);

const MyInfo = ({ onOpenContact }: { onOpenContact: () => void }) => {
  const { t } = useTranslation();
  const { userInfo, updateUserInfo } = useUserStore();
  const { toast } = useToast();

  const {
    isOpen: isOpenUpdatePsw,
    onClose: onCloseUpdatePsw,
    onOpen: onOpenUpdatePsw
  } = useDisclosure();
  const saveTimezone = useCallback(
    async (timezone: string) => {
      await updateUserInfo({ timezone });
      toast({
        title: t('account_info:update_success_tip'),
        status: 'success'
      });
    },
    [t, toast, updateUserInfo]
  );

  const afterUploadAvatar = useCallback(
    (avatar: string) => {
      if (!userInfo) return;
      updateUserInfo({ avatar }).then(() => {
        toast({
          title: t('account_info:avatar_updated'),
          status: 'success'
        });
      });
    },
    [t, toast, updateUserInfo, userInfo]
  );
  const {
    Component: AvatarUploader,
    handleFileSelectorOpen,
    uploading
  } = useUploadAvatar(getUploadAvatarPresignedUrl, {
    onSuccess: afterUploadAvatar
  });

  return (
    <Box
      bg={'white'}
      border={'1px solid'}
      borderColor={omniTheme.colors.border}
      borderRadius={'8px'}
    >
      <Flex px={[5, 7]} py={[5, 6]} alignItems={'center'} gap={4}>
        <Box
          as={'button'}
          type={'button'}
          position={'relative'}
          flexShrink={0}
          cursor={uploading ? 'wait' : 'pointer'}
          aria-label={t('account_info:change_avatar')}
          title={t('account_info:change_avatar')}
          disabled={uploading}
          borderRadius={'16px'}
          transition={'transform 160ms ease'}
          _hover={{ transform: uploading ? 'none' : 'translateY(-1px)' }}
          _focusVisible={{
            outline: `2px solid ${omniTheme.colors.saturatedBlue}`,
            outlineOffset: '3px'
          }}
          onClick={handleFileSelectorOpen}
        >
          <Avatar
            src={userInfo?.avatar}
            w={['56px', '68px']}
            h={['56px', '68px']}
            borderRadius={'16px'}
          />
          <Flex
            position={'absolute'}
            right={-1}
            bottom={-1}
            w={6}
            h={6}
            alignItems={'center'}
            justifyContent={'center'}
            borderRadius={'full'}
            bg={omniTheme.colors.saturatedBlue}
            color={'white'}
            border={'2px solid white'}
          >
            {uploading ? (
              <Spinner size={'xs'} thickness={'2px'} color={'white'} />
            ) : (
              <MyIcon name={'edit'} w={'12px'} />
            )}
          </Flex>
        </Box>
        <Box minW={0} flex={1}>
          <Box fontSize={['lg', 'xl']} fontWeight={800} color={omniTheme.colors.text} noOfLines={1}>
            {userInfo?.username}
          </Box>
          <Flex mt={1} alignItems={'center'} gap={2} color={omniTheme.colors.muted} fontSize={'sm'}>
            <MyIcon name={'support/team/group'} w={'14px'} />
            <Box noOfLines={1}>{userInfo?.team?.teamName}</Box>
          </Flex>
        </Box>
        <AvatarUploader />
      </Flex>

      <SettingSection
        icon={'common/userInfo'}
        title={t('account_info:identity_section')}
        description={t('account_info:identity_section_desc')}
      >
        <ProfileRow label={t('account_info:user_account')}>
          <Box fontWeight={700} color={omniTheme.colors.text}>
            {userInfo?.username}
          </Box>
        </ProfileRow>
        <ProfileRow label={t('account_info:user_team_team_name')}>
          <Box w={'100%'} maxW={'420px'}>
            <TeamSelector height={'36px'} w={'100%'} showManage />
          </Box>
        </ProfileRow>
      </SettingSection>

      <SettingSection
        id={'preferences'}
        icon={'common/language/zh'}
        title={t('account_info:preference_section')}
        description={t('account_info:preference_section_desc')}
      >
        <ProfileRow label={t('account_info:language')} alignTop>
          <LanguagePreference />
        </ProfileRow>
        <ProfileRow label={t('account_info:timezone')}>
          <Box w={'100%'} maxW={'420px'}>
            <TimezoneSelect
              value={userInfo?.timezone}
              onChange={(timezone) => saveTimezone(timezone)}
            />
          </Box>
        </ProfileRow>
      </SettingSection>

      {userInfo?.loginType === 'password' && (
        <SettingSection
          icon={'common/settingLight'}
          title={t('account_info:security_section')}
          description={t('account_info:security_section_desc')}
        >
          <ProfileRow label={t('account_info:password')}>
            <Flex alignItems={'center'} justifyContent={'space-between'} gap={4} w={'100%'}>
              <Box color={omniTheme.colors.muted} letterSpacing={'2px'}>
                ••••••••
              </Box>
              <Button
                h={9}
                px={4}
                variant={'whiteBase'}
                border={'1px solid'}
                borderColor={omniTheme.colors.border}
                borderRadius={omniTheme.radii.md}
                onClick={onOpenUpdatePsw}
              >
                {t('account_info:update_password')}
              </Button>
            </Flex>
          </ProfileRow>
        </SettingSection>
      )}

      <SettingSection
        icon={'common/help'}
        title={t('account_info:support_section')}
        description={t('account_info:support_section_desc')}
      >
        <Other onOpenContact={onOpenContact} />
      </SettingSection>

      {isOpenUpdatePsw && <UpdatePswModal onClose={onCloseUpdatePsw} />}
    </Box>
  );
};

const SettingSection = ({
  id,
  icon,
  title,
  description,
  children
}: {
  id?: string;
  icon: IconNameType;
  title: string;
  description: string;
  children: React.ReactNode;
}) => (
  <Grid
    id={id}
    scrollMarginTop={'16px'}
    templateColumns={['1fr', '1fr', '220px minmax(0, 1fr)']}
    gap={[4, 5, 8]}
    px={[5, 7]}
    py={[5, 6]}
    borderTop={'1px solid'}
    borderColor={omniTheme.colors.border}
  >
    <Box>
      <Flex alignItems={'center'} gap={2} color={omniTheme.colors.text}>
        <MyIcon name={icon} w={'16px'} color={omniTheme.colors.saturatedBlue} />
        <Box fontSize={'sm'} fontWeight={800}>
          {title}
        </Box>
      </Flex>
      <Box mt={1.5} fontSize={'12px'} lineHeight={1.6} color={omniTheme.colors.muted}>
        {description}
      </Box>
    </Box>
    <Box minW={0}>{children}</Box>
  </Grid>
);

const ProfileRow = ({
  label,
  children,
  alignTop = false
}: {
  label: string;
  children: React.ReactNode;
  alignTop?: boolean;
}) => (
  <Flex
    minH={'58px'}
    py={3}
    gap={[3, 5]}
    alignItems={alignTop ? 'flex-start' : 'center'}
    flexDirection={['column', 'row']}
    borderBottom={'1px solid'}
    borderColor={omniTheme.colors.border}
    _last={{ borderBottom: 'none' }}
  >
    <Box flex={['0 0 auto', '0 0 168px']} minW={0} w={'100%'}>
      <Box fontSize={'sm'} fontWeight={700} color={omniTheme.colors.text}>
        {label}
      </Box>
    </Box>
    <Flex flex={1} minW={0} w={'100%'} alignItems={'center'}>
      {children}
    </Flex>
  </Flex>
);

const LanguagePreference = () => {
  const { i18n } = useTranslation();
  const { userInfo, updateUserInfo } = useUserStore();
  const { onChangeLng } = useI18nLng();
  const [savingLanguage, setSavingLanguage] = useState<string>();
  const currentLanguage = getLangMapping(i18n.language);

  const changeLanguage = useCallback(
    async (language: `${LangEnum}`) => {
      if (language === currentLanguage || savingLanguage) return;
      setSavingLanguage(language);
      try {
        if (userInfo?.username) {
          await updateUserInfo({ language });
        }
        await onChangeLng(language);
      } finally {
        setSavingLanguage(undefined);
      }
    },
    [currentLanguage, onChangeLng, savingLanguage, updateUserInfo, userInfo?.username]
  );

  return (
    <Grid w={'100%'} maxW={'560px'} templateColumns={['1fr', 'repeat(3, minmax(0, 1fr))']} gap={2}>
      {Object.entries(langMap).map(([language, item]) => {
        const isActive = language === currentLanguage;
        return (
          <Button
            key={language}
            h={'52px'}
            px={3}
            justifyContent={'flex-start'}
            border={'1px solid'}
            borderColor={isActive ? omniTheme.colors.saturatedBlue : omniTheme.colors.border}
            borderRadius={omniTheme.radii.md}
            bg={isActive ? omniTheme.colors.saturatedBlueSoft : 'white'}
            color={isActive ? omniTheme.colors.saturatedBlue : omniTheme.colors.text}
            fontSize={'sm'}
            fontWeight={700}
            isLoading={savingLanguage === language}
            _hover={{ borderColor: omniTheme.colors.saturatedBlue }}
            leftIcon={<MyIcon name={item.avatar as IconNameType} w={'18px'} borderRadius={0} />}
            rightIcon={isActive ? <MyIcon name={'common/check'} w={'14px'} /> : undefined}
            onClick={() => changeLanguage(language as `${LangEnum}`)}
          >
            <Box flex={1} textAlign={'left'} noOfLines={1}>
              {item.label}
            </Box>
          </Button>
        );
      })}
    </Grid>
  );
};

const PlanUsage = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { userInfo, teamPlanStatus, initTeamPlanStatus } = useUserStore();
  const { subPlans, feConfigs } = useSystemStore();

  // Check if it's a wecom team
  const isWecomTeam = !!userInfo?.team?.isWecomTeam;
  const {
    isOpen: isOpenStandardModal,
    onClose: onCloseStandardModal,
    onOpen: onOpenStandardModal
  } = useDisclosure();

  const {
    isOpen: isOpenRedeemCouponModal,
    onClose: onCloseRedeemCouponModal,
    onOpen: onOpenRedeemCouponModal
  } = useDisclosure();

  const {
    isOpen: isOpenDiscountCouponsModal,
    onClose: onCloseDiscountCouponsModal,
    onOpen: onOpenDiscountCouponsModal
  } = useDisclosure();

  const planName = useMemo(() => {
    if (!teamPlanStatus?.standard?.currentSubLevel) return '';
    if (isWecomTeam && teamPlanStatus.standard.currentSubLevel === StandardSubLevelEnum.free)
      return 'common:support.wallet.subscription.standardSubLevel.trial';

    return (
      subPlans?.standard?.[teamPlanStatus.standard.currentSubLevel]?.name ||
      standardSubLevelMap[teamPlanStatus.standard.currentSubLevel].label
    );
  }, [teamPlanStatus?.standard?.currentSubLevel, isWecomTeam, subPlans]);
  const standardPlan = teamPlanStatus?.standard;

  const isFreeTeam = useMemo(() => {
    if (!teamPlanStatus || !teamPlanStatus?.standard) return false;
    const hasExtraDatasetSize =
      teamPlanStatus.datasetMaxSize > teamPlanStatus.standard.maxDatasetSize;
    const hasExtraPoints = teamPlanStatus.totalPoints > teamPlanStatus.standard.totalPoints;
    if (
      teamPlanStatus?.standard?.currentSubLevel === StandardSubLevelEnum.free &&
      !hasExtraDatasetSize &&
      !hasExtraPoints
    ) {
      return true;
    }
    return false;
  }, [teamPlanStatus]);

  const datasetIndexUsageMap = useMemo(() => {
    if (!teamPlanStatus) {
      return {
        total: t('account_info:unlimited'),
        rate: 0
      };
    }

    const rate = teamPlanStatus.datasetMaxSize
      ? (teamPlanStatus.usedDatasetIndexSize / teamPlanStatus.datasetMaxSize) * 100
      : 0;

    return {
      total: teamPlanStatus.datasetMaxSize ?? t('account_info:unlimited'),
      rate
    };
  }, [t, teamPlanStatus]);

  const aiPointsUsageMap = useMemo(() => {
    if (!teamPlanStatus) {
      return {
        total: t('account_info:unlimited'),
        rate: 0
      };
    }

    const rate = teamPlanStatus.totalPoints
      ? (teamPlanStatus.usedPoints / teamPlanStatus.totalPoints) * 100
      : 0;

    return {
      total: teamPlanStatus.totalPoints ?? t('account_info:unlimited'),
      rate
    };
  }, [t, teamPlanStatus]);

  const limitData = useMemo(() => {
    if (!teamPlanStatus) {
      return [];
    }

    const data = [
      {
        label: t('account_info:member_amount'),
        value: teamPlanStatus.usedMember,
        max: teamPlanStatus?.standard?.maxTeamMember ?? t('account_info:unlimited'),
        rate: (teamPlanStatus.usedMember / (teamPlanStatus?.standard?.maxTeamMember || 1)) * 100
      },
      {
        label: t('account_info:app_amount'),
        value: teamPlanStatus.usedAppAmount,
        max: teamPlanStatus?.standard?.maxAppAmount ?? t('account_info:unlimited'),
        rate: (teamPlanStatus.usedAppAmount / (teamPlanStatus?.standard?.maxAppAmount || 1)) * 100
      },
      {
        label: t('account_info:dataset_amount'),
        value: teamPlanStatus.usedDatasetSize,
        max: teamPlanStatus?.standard?.maxDatasetAmount ?? t('account_info:unlimited'),
        rate:
          (teamPlanStatus.usedDatasetSize / (teamPlanStatus?.standard?.maxDatasetAmount || 1)) * 100
      }
    ];

    if (teamPlanStatus?.standard?.appRegistrationCount) {
      data.push({
        label: t('account_info:app_registration_count'),
        value: teamPlanStatus.usedRegistrationCount || 0,
        max: teamPlanStatus.standard.appRegistrationCount,
        rate:
          ((teamPlanStatus.usedRegistrationCount || 0) /
            teamPlanStatus.standard.appRegistrationCount) *
          100
      });
    }

    return data;
  }, [t, teamPlanStatus]);

  return standardPlan ? (
    <Box mt={[6, 0]}>
      <Flex fontSize={['md', 'lg']} h={'30px'}>
        <Flex
          alignItems={'center'}
          color="var(--light-general-on-surface, var(--Gray-Modern-900, #111824))"
          fontFamily='"PingFang SC"'
          fontSize="16px"
          fontStyle="normal"
          fontWeight={500}
          lineHeight="24px"
          letterSpacing="0.15px"
        >
          <MyIcon mr={2} name={'support/account/plans'} w={'20px'} />
          {t('account_info:package_and_usage')}
        </Flex>
        <ModelPriceModal>
          {({ onOpen }) => (
            <Button ml={3} size={'sm'} onClick={onOpen}>
              {t('account_info:billing_standard')}
            </Button>
          )}
        </ModelPriceModal>
        <Button ml={3} variant={'whitePrimary'} size={'sm'} onClick={onOpenStandardModal}>
          {t('account_info:package_details')}
        </Button>
        {userInfo?.permission.isOwner && feConfigs?.show_coupon && (
          <Button ml={3} variant={'whitePrimary'} size={'sm'} onClick={onOpenRedeemCouponModal}>
            {t('account_info:redeem_coupon')}
          </Button>
        )}
        {userInfo?.permission.isOwner && feConfigs?.show_discount_coupon && (
          <Button ml={3} variant={'whitePrimary'} size={'sm'} onClick={onOpenDiscountCouponsModal}>
            {t('account_info:discount_coupon')}
          </Button>
        )}
      </Flex>
      <Box
        mt={[3, 6]}
        bg={'white'}
        borderWidth={'1px'}
        borderColor={'borderColor.low'}
        borderRadius={'md'}
      >
        <Flex px={[5, 7]} pt={[3, 6]}>
          <Box flex={'1 0 0'}>
            <Box color={'myGray.600'} fontSize="sm">
              {t('account_info:current_package')}
            </Box>
            <Box fontWeight={'bold'} fontSize="lg">
              {t(planName)}
            </Box>
          </Box>
          <Button
            onClick={() => {
              router.push(
                subPlans?.planDescriptionUrl ? getDocPath(subPlans.planDescriptionUrl) : '/price'
              );
            }}
            w={'8rem'}
            size="sm"
          >
            {t('account_info:upgrade_package')}
          </Button>
        </Flex>
        <Box px={[5, 7]} pb={[3, 6]}>
          {isFreeTeam && (
            <Box mt="2" color={'#485264'} fontSize="sm">
              {t('account_info:account_knowledge_base_cleanup_warning')}
            </Box>
          )}
          {(standardPlan.currentSubLevel !== StandardSubLevelEnum.free || isWecomTeam) && (
            <Flex mt="2" color={'#485264'} fontSize="xs">
              <Box>{t('account_info:package_expiry_time')}:</Box>
              <Box ml={2}>{formatTime2YMD(standardPlan?.expiredTime)}</Box>
            </Flex>
          )}
        </Box>

        <Box py={3} borderTopWidth={'1px'} borderTopColor={'borderColor.base'}>
          <Box py={[0, 3]} px={[5, 7]} overflow={'auto'}>
            <StandardPlanContentList
              level={standardPlan?.currentSubLevel}
              mode={'month'}
              standplan={standardPlan}
            />
          </Box>
        </Box>
      </Box>
      <Box
        mt={6}
        bg={'white'}
        borderWidth={'1px'}
        borderColor={'borderColor.low'}
        borderRadius={'md'}
        px={[5, 10]}
        pt={4}
        pb={[4, 7]}
      >
        <Flex>
          <Flex flex={'1 0 0'} alignItems={'flex-end'}>
            <Box fontSize={'md'} fontWeight={'bold'} color={'myGray.900'}>
              {t('account_info:resource_usage')}
            </Box>
            <Box ml={1} display={['none', 'block']} fontSize={'xs'} color={'myGray.500'}>
              {t('account_info:standard_package_and_extra_resource_package')}
            </Box>
          </Flex>
          <Link
            href={getWebReqUrl(getExtraPlanCardRoute())}
            transform={'translateX(15px)'}
            display={'flex'}
            alignItems={'center'}
            color={'primary.600'}
            cursor={'pointer'}
            fontSize={'sm'}
          >
            {t('account_info:purchase_extra_package')}
            <MyIcon ml={1} name={'common/rightArrowLight'} w={'12px'} />
          </Link>
        </Flex>
        <Box width={'100%'} mt={5} fontSize={'sm'}>
          <Flex alignItems={'center'} mb={2}>
            <Box fontSize={'16px'} fontWeight={'medium'} color={'myGray.900'} mr={1}>
              {t('common:support.wallet.subscription.AI points usage')}
            </Box>
            <QuestionTip label={t('account_info:ai_points_usage_tip')} />
            <Box ml={4} fontSize={'14px'} fontWeight={'medium'} color={'myGray.600'}>
              {Math.round(teamPlanStatus?.usedPoints || 0)} / {aiPointsUsageMap.total}
            </Box>
          </Flex>
          <Flex h={2} w={'full'} p={0.5} bg={'primary.50'} borderRadius={'md'}>
            <Box
              borderRadius={'sm'}
              transition="width 0.3s"
              w={`${aiPointsUsageMap.rate}%`}
              bg={`${aiPointsUsageMap.rate < 50 ? 'primary' : aiPointsUsageMap.rate < 80 ? 'yellow' : 'red'}.500`}
            />
          </Flex>
        </Box>

        <Box mt="6" width={'100%'} fontSize={'sm'}>
          <Flex gap={4} alignItems={'center'} mb={2}>
            <Box fontSize={'16px'} fontWeight={'medium'} color={'myGray.900'}>
              {t('common:support.user.team.Dataset usage')}
            </Box>
            <Box fontSize={'14px'} fontWeight={'medium'} color={'myGray.600'}>
              {Math.round(teamPlanStatus?.usedDatasetIndexSize || 0)} / {datasetIndexUsageMap.total}
            </Box>
          </Flex>
          <Flex h={2} w={'full'} p={0.5} bg={'primary.50'} borderRadius={'md'}>
            <Box
              borderRadius={'sm'}
              transition="width 0.3s"
              w={`${datasetIndexUsageMap.rate}%`}
              bg={`${datasetIndexUsageMap.rate < 50 ? 'primary' : datasetIndexUsageMap.rate < 80 ? 'yellow' : 'red'}.500`}
            />
          </Flex>
        </Box>

        <MyDivider />

        {limitData.map((item) => {
          const isAppRegistration = item.label === t('account_info:app_registration_count');

          return (
            <Box
              key={item.label}
              _notFirst={{
                mt: 6
              }}
              width={'100%'}
              fontSize={'sm'}
            >
              <Flex gap={4} alignItems={'center'} mb={2}>
                <Box fontSize={'16px'} fontWeight={'medium'} color={'myGray.900'}>
                  {item.label}
                </Box>
                <Box fontSize={'14px'} fontWeight={'medium'} color={'myGray.600'}>
                  {item.value}/{item.max}
                </Box>
                {isAppRegistration && subPlans?.appRegistrationUrl && (
                  <Link
                    href={subPlans?.appRegistrationUrl}
                    target="_blank"
                    ml={'auto'}
                    display={'flex'}
                    alignItems={'center'}
                    color={'primary.600'}
                    cursor={'pointer'}
                    fontSize={'sm'}
                  >
                    {t('account_info:apply_app_registration')}
                    <MyIcon ml={1} name={'common/rightArrowLight'} w={'12px'} />
                  </Link>
                )}
              </Flex>
              <Flex h={2} w={'full'} p={0.5} bg={'primary.50'} borderRadius={'md'}>
                <Box
                  borderRadius={'sm'}
                  transition="width 0.3s"
                  w={`${item.rate}%`}
                  bg={`${item.rate < 50 ? 'green' : item.rate < 80 ? 'yellow' : 'red'}.500`}
                />
              </Flex>
            </Box>
          );
        })}
      </Box>
      {isOpenStandardModal && <StandDetailModal onClose={onCloseStandardModal} />}
      {isOpenRedeemCouponModal && (
        <RedeemCouponModal
          onClose={onCloseRedeemCouponModal}
          onSuccess={() => initTeamPlanStatus()}
        />
      )}
      {isOpenDiscountCouponsModal && <DiscountCouponsModal onClose={onCloseDiscountCouponsModal} />}
    </Box>
  ) : null;
};

const Other = ({ onOpenContact }: { onOpenContact: () => void }) => {
  const { feConfigs, setNotSufficientModalType, subPlans } = useSystemStore();
  const { teamPlanStatus } = useUserStore();
  const { t } = useTranslation();

  const { runAsync: onFeedback } = useRequest(
    async () => {
      const plan = teamPlanStatus?.standard?.currentSubLevel
        ? subPlans?.standard?.[teamPlanStatus?.standard?.currentSubLevel]
        : undefined;

      const ticketResponseTime =
        teamPlanStatus?.standard?.ticketResponseTime ?? plan?.ticketResponseTime;
      const hasTicketAccess = !!ticketResponseTime;
      if (!hasTicketAccess) {
        setNotSufficientModalType(TeamErrEnum.ticketNotAvailable);
        return;
      }

      const data = await getWorkorderURL();
      if (data) {
        window.open(data.redirectUrl);
      }
    },
    {
      manual: true
    }
  );

  return (
    <Flex gap={2} flexWrap={'wrap'} py={2}>
      {feConfigs?.docUrl && (
        <Button
          as={Link}
          href={getDocPath('/docs/introduction')}
          target={'_blank'}
          h={9}
          px={4}
          variant={'whiteBase'}
          border={'1px solid'}
          borderColor={omniTheme.colors.border}
          borderRadius={omniTheme.radii.md}
          textDecoration={'none !important'}
          leftIcon={<MyIcon name={'common/courseLight'} w={'16px'} />}
        >
          {t('account_info:help_document')}
        </Button>
      )}
      {feConfigs?.concatMd && (
        <Button
          h={9}
          px={4}
          variant={'whiteBase'}
          border={'1px solid'}
          borderColor={omniTheme.colors.border}
          borderRadius={omniTheme.radii.md}
          leftIcon={<MyIcon name={'modal/concat'} w={'16px'} />}
          onClick={onOpenContact}
        >
          {t('account_info:contact_us')}
        </Button>
      )}
      {feConfigs?.show_workorder && (
        <Button
          h={9}
          px={4}
          variant={'whiteBase'}
          border={'1px solid'}
          borderColor={omniTheme.colors.border}
          borderRadius={omniTheme.radii.md}
          leftIcon={<MyIcon name={'feedback'} w={'16px'} />}
          onClick={() => onFeedback()}
        >
          {t('common:question_feedback')}
        </Button>
      )}
    </Flex>
  );
};
