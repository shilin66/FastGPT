import React, { useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Heading,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { CreateSkillForm } from './CreateSkillModal';
import { ImportSkillForm } from './ImportSkillModal';

const CreateSkillPage = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const parentId = typeof router.query.parentId === 'string' ? router.query.parentId : undefined;
  const [selectedMethod, setSelectedMethod] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const isBusy = isCreating || isImporting;
  const goBack = () =>
    router.push({ pathname: '/dashboard/skill', query: parentId ? { parentId } : {} });
  const methods = [
    {
      title: t('skill:create_blank_title'),
      caption: t('skill:create_blank_caption'),
      icon: 'core/skill/default' as const,
      heading: t('skill:create_blank_heading'),
      description: t('skill:create_blank_description'),
      steps: [
        [t('skill:create_blank_step_info'), t('skill:create_blank_step_info_desc')],
        [t('skill:create_blank_step_edit'), t('skill:create_blank_step_edit_desc')],
        [t('skill:create_blank_step_test'), t('skill:create_blank_step_test_desc')]
      ]
    },
    {
      title: t('skill:import_skill_zip'),
      caption: t('skill:create_import_caption'),
      icon: 'common/folderImport' as const,
      heading: t('skill:create_import_heading'),
      description: t('skill:create_import_description'),
      steps: [
        [t('skill:create_import_step_prepare'), t('skill:create_import_step_prepare_desc')],
        [t('skill:create_import_step_check'), t('skill:create_import_step_check_desc')],
        [t('skill:create_import_step_edit'), t('skill:create_import_step_edit_desc')]
      ]
    }
  ];
  const selected = methods[selectedMethod];

  return (
    <Flex h="100%" minH={0} direction="column" bg="white">
      <Flex
        minH="64px"
        px={4}
        align="center"
        borderBottomWidth="1px"
        borderColor="myGray.200"
        flexShrink={0}
      >
        <Button
          variant="transparentBase"
          fontSize="20px"
          leftIcon={<MyIcon name="common/backLight" w={4} />}
          onClick={goBack}
          isDisabled={isBusy}
        >
          {t('skill:create_skill')}
        </Button>
      </Flex>
      <Box flex={1} overflowY="auto" px={[4, 6, 8]} py={[6, 8]}>
        <Box maxW="1440px" mx="auto">
          <Text color="myGray.600" fontSize="sm" mb={8} lineHeight="tall">
            {t('skill:create_page_intro')}
          </Text>
          <Flex direction={{ base: 'column', md: 'row' }} align="stretch" gap={{ base: 8, lg: 12 }}>
            <Tabs
              index={selectedMethod}
              onChange={setSelectedMethod}
              variant="unstyled"
              flex="1.2"
              minW={0}
            >
              <Heading as="h1" fontSize="md" fontWeight="600" color="myGray.900" mb={4}>
                {t('skill:create_method_label')}
              </Heading>
              <TabList gap={3} aria-label={t('skill:create_method_label')}>
                {methods.map((method, index) => (
                  <Tab
                    key={method.title}
                    flex={1}
                    minW={0}
                    p={4}
                    alignItems="flex-start"
                    flexDirection="column"
                    textAlign="left"
                    whiteSpace="normal"
                    borderWidth="1px"
                    borderColor="myGray.200"
                    borderRadius="lg"
                    isDisabled={isBusy}
                    _selected={{ borderColor: 'primary.500', bg: 'primary.50' }}
                    _hover={{ borderColor: 'primary.400' }}
                    _focusVisible={{
                      outline: '2px solid',
                      outlineColor: 'primary.500',
                      outlineOffset: '3px'
                    }}
                  >
                    <Flex w="100%" align="center" justify="space-between" mb={3}>
                      <MyIcon name={method.icon} w={6} color="primary.500" aria-hidden />
                      <Box
                        w={4}
                        h={4}
                        borderRadius="full"
                        borderWidth="1px"
                        borderColor={selectedMethod === index ? 'primary.500' : 'myGray.300'}
                        display="grid"
                        placeItems="center"
                        aria-hidden
                      >
                        {selectedMethod === index && (
                          <Box w={2} h={2} borderRadius="full" bg="primary.500" />
                        )}
                      </Box>
                    </Flex>
                    <Text fontSize="sm" fontWeight="600" color="myGray.900">
                      {method.title}
                    </Text>
                    <Text mt={1} fontSize="xs" color="myGray.600" lineHeight="tall">
                      {method.caption}
                    </Text>
                  </Tab>
                ))}
              </TabList>
              <TabPanels mt={6} pt={6} borderTopWidth="1px" borderColor="myGray.200">
                <TabPanel p={0}>
                  <CreateSkillForm
                    parentId={parentId}
                    onCancel={goBack}
                    onBusyChange={setIsCreating}
                    onSuccess={(skillId) => router.push(`/skill/detail?skillId=${skillId}`)}
                  />
                </TabPanel>
                <TabPanel p={0}>
                  <ImportSkillForm
                    parentId={parentId}
                    onClose={goBack}
                    onBusyChange={setIsImporting}
                  />
                </TabPanel>
              </TabPanels>
            </Tabs>
            <Box
              as="aside"
              flex={1}
              minW={0}
              pl={{ base: 0, md: 8, lg: 10 }}
              pt={{ base: 6, md: 0 }}
              borderLeftWidth={{ base: 0, md: '1px' }}
              borderTopWidth={{ base: '1px', md: 0 }}
              borderColor="myGray.200"
            >
              <Box role="status" aria-live="polite" aria-atomic="true">
                <Text color="primary.600" fontSize="sm" fontWeight="600" mb={3}>
                  {selected.title}
                </Text>
                <Heading as="h2" fontSize="2xl" color="myGray.900" lineHeight="short" mb={4}>
                  {selected.heading}
                </Heading>
                <Text color="myGray.600" fontSize="sm" lineHeight="tall">
                  {selected.description}
                </Text>
                <Box as="ol" listStyleType="none" m={0} mt={8}>
                  {selected.steps.map(([title, description], index) => (
                    <Flex as="li" key={title} gap={4} mb={6}>
                      <Flex
                        w={7}
                        h={7}
                        flexShrink={0}
                        borderRadius="full"
                        bg="myGray.100"
                        color="myGray.600"
                        align="center"
                        justify="center"
                        fontSize="xs"
                        fontWeight="600"
                        aria-hidden
                      >
                        {index + 1}
                      </Flex>
                      <Box>
                        <Text fontSize="sm" color="myGray.900" fontWeight="600" mb={1}>
                          {title}
                        </Text>
                        <Text fontSize="sm" color="myGray.600" lineHeight="tall">
                          {description}
                        </Text>
                      </Box>
                    </Flex>
                  ))}
                </Box>
              </Box>
            </Box>
          </Flex>
        </Box>
      </Box>
    </Flex>
  );
};

export default CreateSkillPage;
