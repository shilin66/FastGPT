import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { Box, Flex } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { useState, useMemo } from 'react';
import { OmniModalBody, OmniModalSection } from '../../components/OmniModalLayout';

export type ShowShareLinkModalProps = {
  shareLink: string;
  onClose: () => void;
  img: string;
  defaultDomain?: boolean;
  showCustomDomainSelector?: boolean;
};

export const ShareLinkContainer = ({
  shareLink,
  img,
  defaultDomain = true,
  showCustomDomainSelector = false
}: {
  shareLink: string;
  img: string;
  defaultDomain?: boolean;
  showCustomDomainSelector?: boolean;
}) => {
  const { copyData } = useCopyData();
  const { t } = useTranslation();
  const [customDomain, setCustomDomain] = useState<string | undefined>(undefined);

  // const { data: customDomainList = [] } = useRequest(listCustomDomain, {
  //   manual: !showCustomDomainSelector
  // });

  // 从 shareLink 中提取原始域名
  const originalDomain = useMemo(() => {
    try {
      const url = new URL(shareLink);
      return url.origin;
    } catch {
      return '';
    }
  }, [shareLink]);

  // 计算显示的分享链接（使用自定义域名替换原始域名）
  const displayShareLink = useMemo(() => {
    if (!customDomain || !originalDomain) {
      return shareLink;
    }
    return shareLink.replace(originalDomain, `https://${customDomain}`);
  }, [shareLink, customDomain, originalDomain]);

  // 处理域名选择选项
  // const domainOptions = useMemo(() => {
  //   const defaultOption = [
  //     {
  //       label: t('publish:use_default_domain'),
  //       value: ''
  //     }
  //   ];
  //
  //   // 只显示已激活的自定义域名
  //   const activeDomains = customDomainList
  //     .filter((item) => item.status === 'active')
  //     .map((item) => ({
  //       label: item.domain,
  //       value: item.domain
  //     }));
  //
  //   return activeDomains.length === 0
  //     ? [...defaultOption]
  //     : [...(defaultDomain ? defaultOption : []), ...activeDomains];
  // }, [customDomainList, defaultDomain, t]);

  // 当 defaultDomain=false 时，自动选择第一个自定义域名
  // useEffect(() => {
  //   if (!defaultDomain && domainOptions.length > 0 && customDomain === undefined) {
  //     setCustomDomain(domainOptions[0].value || undefined);
  //   }
  // }, [defaultDomain, domainOptions, customDomain]);

  return (
    <>
      {/*/!* 自定义域名选择器 *!/*/}
      {/*{showCustomDomainSelector && domainOptions.length > 1 && (*/}
      {/*  <Box mb={4}>*/}
      {/*    <MySelect*/}
      {/*      value={customDomain || ''}*/}
      {/*      list={domainOptions}*/}
      {/*      onChange={(value) => setCustomDomain(value || undefined)}*/}
      {/*    />*/}
      {/*  </Box>*/}
      {/*)}*/}

      <Box
        border={'1px solid rgba(37, 99, 235, 0.16)'}
        borderRadius={'14px'}
        bg={'#FFFFFF'}
        overflow={'hidden'}
        fontSize={'sm'}
        boxShadow={'0 12px 30px rgba(15, 23, 42, 0.04)'}
      >
        <Flex
          alignItems={'center'}
          gap={3}
          px={4}
          py={3}
          bg={'#F8FAFC'}
          borderBottom={'1px solid rgba(148, 163, 184, 0.18)'}
        >
          <Flex
            alignItems={'center'}
            justifyContent={'center'}
            w={'30px'}
            h={'30px'}
            flexShrink={0}
            borderRadius={'10px'}
            bg={'rgba(37, 99, 235, 0.1)'}
            color={'#2563EB'}
          >
            <MyIcon name={'common/link'} w={'16px'} />
          </Flex>
          <Box flex={1} color={'#1E293B'} fontWeight={800}>
            {t('publish:copy_link_hint')}
          </Box>
          <MyIcon
            name={'copy'}
            w={'30px'}
            h={'30px'}
            p={2}
            borderRadius={'10px'}
            bg={'rgba(37, 99, 235, 0.08)'}
            color={'#2563EB'}
            cursor={'pointer'}
            _hover={{ bg: 'rgba(37, 99, 235, 0.14)' }}
            onClick={() => copyData(displayShareLink)}
          />
        </Flex>
        <Box whiteSpace={'pre'} p={4} overflowX={'auto'} color={'#334155'} bg={'#FFFFFF'}>
          {displayShareLink}
        </Box>
      </Box>

      <Box
        mt={4}
        p={3}
        borderRadius={'14px'}
        border={'1px solid rgba(148, 163, 184, 0.18)'}
        bg={'#FFFFFF'}
      >
        <MyImage src={img} borderRadius="12px" alt="" />
      </Box>

      {/*<Box borderRadius={'md'} bg={'myGray.100'} overflow={'hidden'} fontSize={'sm'} mt="4">
      <Flex
        p={3}
        bg={'myWhite.500'}
        border="base"
        borderTopLeftRadius={'md'}
        borderTopRightRadius={'md'}
      >
        <Box flex="1">{t('publish:ip_whitelist')}</Box>
        <MyIcon
          name={'copy'}
          w={'16px'}
          color={'myGray.600'}
          cursor={'pointer'}
          _hover={{ color: 'primary.500' }}
          onClick={() => copyData(feConfigs?.ip_whitelist || '')}
        />
      </Flex>

      <Box p={3} wordBreak={'break-all'}>
        {feConfigs.ip_whitelist}
      </Box>
    </Box>*/}
    </>
  );
};

function ShowShareLinkModal({
  shareLink,
  onClose,
  img,
  defaultDomain,
  showCustomDomainSelector
}: ShowShareLinkModalProps) {
  const { t } = useTranslation();

  return (
    <MyModal
      onClose={onClose}
      title={t('publish:show_share_link_modal_title')}
      iconSrc="common/link"
      minW={['auto', '720px']}
    >
      <OmniModalBody
        icon="common/link"
        title={t('publish:show_share_link_modal_title')}
        desc={t('publish:copy_link_hint')}
        asideItems={[
          {
            label: t('publish:copy_link_hint'),
            desc: shareLink,
            icon: 'common/link'
          }
        ]}
        minH={['auto', '420px']}
      >
        <OmniModalSection
          title={t('publish:show_share_link_modal_title')}
          desc={t('publish:copy_link_hint')}
        >
          <ShareLinkContainer
            shareLink={shareLink}
            img={img}
            defaultDomain={defaultDomain}
            showCustomDomainSelector={showCustomDomainSelector}
          />
        </OmniModalSection>
      </OmniModalBody>
    </MyModal>
  );
}

export default ShowShareLinkModal;
