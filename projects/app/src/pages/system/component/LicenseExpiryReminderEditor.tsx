import React from 'react';
import {
  Box,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  Switch,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Textarea
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Markdown from '@/components/Markdown';
import {
  formatLicenseExpiryTime,
  licenseExpiryDayMs,
  licenseExpiryStages,
  renderLicenseExpiryTemplate,
  type LicenseExpiryReminderConfig
} from '@fastgpt/global/common/system/licenseExpiry';

const LicenseExpiryReminderEditor = ({
  value,
  onChange
}: {
  value: LicenseExpiryReminderConfig;
  onChange: (value: LicenseExpiryReminderConfig) => void;
}) => {
  const { t, i18n } = useTranslation();
  return (
    <Box mt={8} borderWidth={'1px'} borderColor={'myGray.200'} borderRadius={'md'} p={5}>
      <Flex justifyContent={'space-between'} alignItems={'center'} gap={4}>
        <Text fontWeight={'bold'}>{t('common:license_expiry_settings_title')}</Text>
        <FormControl display={'flex'} alignItems={'center'} w={'auto'}>
          <FormLabel htmlFor={'license-reminder-enabled'} mb={0} fontSize={'sm'}>
            {t('common:license_expiry_settings_enable')}
          </FormLabel>
          <Switch
            id={'license-reminder-enabled'}
            isChecked={value.enabled}
            onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
          />
        </FormControl>
      </Flex>
      <Text fontSize={'sm'} color={'myGray.600'} mt={3}>
        {t('common:license_expiry_settings_description')}
      </Text>
      <Text fontSize={'sm'} color={'myGray.600'} mt={2}>
        {t('common:license_expiry_settings_variables', {
          expiresAt: '{{expiresAt}}',
          remainingDays: '{{remainingDays}}'
        })}
      </Text>
      <Tabs size={'sm'} mt={5}>
        <TabList>
          {licenseExpiryStages.map((stage) => (
            <Tab key={stage}>{t('common:license_expiry_settings_stage', { days: stage })}</Tab>
          ))}
        </TabList>
        <TabPanels>
          {licenseExpiryStages.map((stage) => {
            const defaultTemplate = t(`common:license_expiry_template_${stage}`, {
              expiresAt: '{{expiresAt}}',
              remainingDays: '{{remainingDays}}'
            });
            const template = value.templates[stage] || defaultTemplate;
            const preview = renderLicenseExpiryTemplate(template, {
              expiresAt: formatLicenseExpiryTime(
                new Date(Date.now() + stage * licenseExpiryDayMs).toISOString(),
                i18n.language
              ),
              remainingDays: t('common:license_expiry_days', { days: stage })
            });
            return (
              <TabPanel key={stage} px={0}>
                <Grid templateColumns={['1fr', '1fr 1fr']} gap={5}>
                  <FormControl>
                    <FormLabel htmlFor={`license-reminder-${stage}`} fontSize={'sm'}>
                      {t('common:license_expiry_settings_template')}
                    </FormLabel>
                    <Textarea
                      id={`license-reminder-${stage}`}
                      value={value.templates[stage] || ''}
                      placeholder={defaultTemplate}
                      rows={6}
                      maxLength={10000}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          templates: { ...value.templates, [stage]: e.target.value }
                        })
                      }
                    />
                  </FormControl>
                  <Box>
                    <Text fontSize={'sm'} mb={2}>
                      {t('common:license_expiry_settings_preview')}
                    </Text>
                    <Box bg={'myGray.50'} borderRadius={'md'} p={4}>
                      <Markdown source={preview} />
                    </Box>
                  </Box>
                </Grid>
              </TabPanel>
            );
          })}
        </TabPanels>
      </Tabs>
      <Text fontSize={'sm'} color={'myGray.600'} mt={3}>
        {t('common:license_expiry_settings_renewal')}
      </Text>
    </Box>
  );
};

export default LicenseExpiryReminderEditor;
