'use client';
import React, { useState } from 'react';
import {
  Box,
  Flex,
  Button,
  Input,
  SimpleGrid,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Center,
  Heading,
  Text,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Radio,
  RadioGroup,
  Stack
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { postCreateApp } from '@/web/core/app/api';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import { useRouter } from 'next/router';
import { getEmptyAppsTemplate } from '@/web/core/app/templates';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { AppTypeEnum, ToolTypeList } from '@fastgpt/global/core/app/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { createAppTypeMap } from '@/pageComponents/app/constants';
import { serviceSideProps } from '@/web/common/i18n/utils';
import HeaderAuthForm from '@/components/common/secret/HeaderAuthForm';
import { postCreateHttpTools } from '@/web/core/app/api/httpTools';
import { getMCPTools, postCreateMCPTools } from '@/web/core/app/api/mcpTools';
import {
  headerValue2StoreHeader,
  type HeaderSecretConfigType
} from '@/components/common/secret/HeaderAuthConfig';
import type { McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import AppTypeCard from '@/pageComponents/app/create/AppTypeCard';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import {
  type HttpToolType,
  HttpToolTypeEnum
} from '@fastgpt/global/core/app/tool/httpTool/constants';

type FormType = {
  avatar: string;
  name: string;
  // http
  createType?: HttpToolType;
  // mcp
  mcpUrl?: string;
  mcpHeaderSecret?: HeaderSecretConfigType;
  mcpToolList?: McpToolConfigType[];
};

export type CreateAppType =
  | AppTypeEnum.chatAgent
  | AppTypeEnum.simple
  | AppTypeEnum.workflow
  | AppTypeEnum.workflowTool
  | AppTypeEnum.mcpToolSet
  | AppTypeEnum.httpToolSet;

const CreateAppsPage = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { query } = router;
  const { parentId, appType } = query;

  const [selectedAppType, setSelectedAppType] = useState<CreateAppType>(
    typeof appType === 'string' && Object.prototype.hasOwnProperty.call(createAppTypeMap, appType)
      ? (appType as CreateAppType)
      : AppTypeEnum.chatAgent
  );
  const isToolType = ToolTypeList.includes(selectedAppType);
  const goBack = () =>
    router.replace({
      pathname: isToolType ? '/dashboard/tool' : '/dashboard/agent',
      query: typeof parentId === 'string' ? { parentId } : {}
    });
  const selected = createAppTypeMap[selectedAppType];
  const options = Object.values(createAppTypeMap).filter(
    (option) => ToolTypeList.includes(option.type) === isToolType
  );

  const {
    register,
    setValue,
    watch,
    handleSubmit,
    trigger,
    formState: { errors }
  } = useForm<FormType>({
    defaultValues: {
      avatar: createAppTypeMap[selectedAppType]?.icon || '',
      name: '',
      createType: HttpToolTypeEnum.batch,
      mcpUrl: '',
      mcpHeaderSecret: {},
      mcpToolList: []
    }
  });
  const avatar = watch('avatar');
  const createType = watch('createType');
  const mcpUrl = watch('mcpUrl');
  const mcpHeaderSecret = watch('mcpHeaderSecret');
  const mcpToolList = watch('mcpToolList');

  const { Component: AvatarUploader, handleFileSelectorOpen: handleAvatarSelectorOpen } =
    useUploadAvatar(getUploadAvatarPresignedUrl, {
      onSuccess(avatar) {
        setValue('avatar', avatar);
      }
    });

  const { runAsync: runGetMCPTools, loading: isGettingMCPTools } = useRequest(
    (data: { url: string; headerSecret: StoreSecretValueType }) => getMCPTools(data),
    {
      onSuccess: (res: McpToolConfigType[]) => {
        setValue('mcpToolList', res);
      },
      errorToast: t('app:MCP_tools_parse_failed')
    }
  );

  const { runAsync: onClickCreate, loading: isCreating } = useRequest(
    async ({
      avatar,
      name,
      createType,
      mcpUrl,
      mcpHeaderSecret,
      mcpToolList
    }: FormType): Promise<string> => {
      const appType = selectedAppType;
      const baseParams = {
        parentId: typeof parentId === 'string' ? parentId : undefined,
        avatar: avatar,
        name: name?.trim() || t('app:unnamed_app')
      };

      if (appType === AppTypeEnum.mcpToolSet) {
        const headerSecret = headerValue2StoreHeader(mcpHeaderSecret || {});
        return postCreateMCPTools({
          ...baseParams,
          url: mcpUrl?.trim() || '',
          headerSecret,
          toolList: mcpToolList || []
        });
      }

      if (appType === AppTypeEnum.httpToolSet) {
        return postCreateHttpTools({
          ...baseParams,
          createType: createType || HttpToolTypeEnum.batch
        });
      }

      const emptyTemplate = getEmptyAppsTemplate(t);
      return postCreateApp({
        ...baseParams,
        type: appType,
        modules: emptyTemplate[appType].nodes,
        edges: emptyTemplate[appType].edges,
        chatConfig: emptyTemplate[appType].chatConfig
      });
    },
    {
      onSuccess(id) {
        router.push(`/app/detail?appId=${id}`);
      },
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed')
    }
  );

  const isBusy = isCreating || isGettingMCPTools;
  const isMcp = selectedAppType === AppTypeEnum.mcpToolSet;
  const submit = handleSubmit((data) => {
    if (isBusy || (isMcp && !data.mcpToolList?.length)) return;
    return onClickCreate(data).catch(() => {});
  });
  const steps = [
    [t('app:create_step_info'), t('app:create_step_info_desc')],
    [
      t('app:create_step_configure'),
      isMcp
        ? t('app:create_step_mcp_desc')
        : isToolType
          ? t('app:create_step_tool_desc')
          : t('app:create_step_agent_desc')
    ],
    [t('app:create_step_test'), t('app:create_step_test_desc')]
  ];

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
          {t('common:Create') + (isToolType ? t('app:type.Tool') : ' Agent')}
        </Button>
      </Flex>
      <Box flex={1} overflowY="auto" px={[4, 6, 8]} py={[6, 8]}>
        <Box maxW="1440px" mx="auto">
          <Text color="myGray.600" fontSize="sm" mb={8} lineHeight="tall">
            {isToolType ? t('app:create_tool_page_intro') : t('app:create_agent_page_intro')}
          </Text>
          <Flex direction={{ base: 'column', md: 'row' }} align="stretch" gap={{ base: 8, lg: 12 }}>
            <Box flex="1.2" minW={0}>
              <Heading
                as="h1"
                id="create-type-label"
                fontSize="md"
                fontWeight="600"
                color="myGray.900"
                mb={4}
              >
                {(isToolType ? t('app:type.Tool') : 'Agent ') + t('common:support.standard.type')}
              </Heading>
              <SimpleGrid
                columns={{ base: 1, sm: 3 }}
                gap={3}
                role="group"
                aria-labelledby="create-type-label"
              >
                {options.map((option) => (
                  <AppTypeCard
                    key={option.type}
                    option={option}
                    selectedAppType={selectedAppType}
                    isDisabled={isBusy}
                    onClick={() => {
                      setSelectedAppType(option.type as CreateAppType);
                      setValue('avatar', option.icon);
                    }}
                  />
                ))}
              </SimpleGrid>
              <Box
                as="form"
                onSubmit={submit}
                mt={6}
                pt={6}
                borderTopWidth="1px"
                borderColor="myGray.200"
              >
                <Box as="fieldset" disabled={isBusy} border={0} p={0} m={0} minW={0}>
                  <FormControl mb={6}>
                    <FormLabel htmlFor="create-app-name" fontSize="sm">
                      {t('common:app_icon_and_name')}
                    </FormLabel>
                    <Flex align="center" gap={3}>
                      <MyTooltip label={t('common:set_avatar')}>
                        <Button
                          type="button"
                          variant="whiteBase"
                          w={10}
                          h={10}
                          minW={10}
                          p={1}
                          aria-label={t('common:set_avatar')}
                          onClick={handleAvatarSelectorOpen}
                        >
                          <Avatar src={avatar} w={7} borderRadius="sm" />
                        </Button>
                      </MyTooltip>
                      <Input
                        id="create-app-name"
                        flex={1}
                        h={10}
                        placeholder={t('app:unnamed_app')}
                        {...register('name')}
                      />
                    </Flex>
                  </FormControl>
                  {/* mcp */}
                  {selectedAppType === AppTypeEnum.mcpToolSet && (
                    <>
                      <Box mb={5}>
                        <HeaderAuthForm
                          headerSecretValue={mcpHeaderSecret || {}}
                          onChange={(data) => {
                            setValue('mcpHeaderSecret', data);
                            setValue('mcpToolList', []);
                          }}
                          bg={'white'}
                        />
                      </Box>

                      <FormControl mb={5} isInvalid={!!errors.mcpUrl}>
                        <FormLabel htmlFor="create-mcp-url">{t('app:MCP_tools_url')}</FormLabel>
                        <Flex alignItems={'center'} gap={2}>
                          <Input
                            id="create-mcp-url"
                            flex={1}
                            h={10}
                            placeholder={t('app:MCP_tools_url_placeholder')}
                            {...register('mcpUrl', {
                              required: t('app:MCP_tools_url_is_empty'),
                              validate: (value) =>
                                !!value?.trim() || t('app:MCP_tools_url_is_empty'),
                              onChange: () => setValue('mcpToolList', [])
                            })}
                          />
                          <Button
                            size={'sm'}
                            variant={'whitePrimary'}
                            h={10}
                            isLoading={isGettingMCPTools}
                            onClick={async () => {
                              if (!(await trigger('mcpUrl'))) return;
                              setValue('mcpToolList', []);
                              const headerSecret = headerValue2StoreHeader(mcpHeaderSecret || {});
                              runGetMCPTools({ url: mcpUrl?.trim() || '', headerSecret }).catch(
                                () => {}
                              );
                            }}
                          >
                            {t('common:Parse')}
                          </Button>
                        </Flex>
                        <FormErrorMessage>{errors.mcpUrl?.message}</FormErrorMessage>
                      </FormControl>

                      <Box mb={5}>
                        <Box color={'myGray.900'} fontWeight={'medium'} mb={2.5}>
                          {t('app:MCP_tools_list')}
                        </Box>
                        <Box
                          borderRadius={'md'}
                          overflow={'hidden'}
                          borderWidth={'1px'}
                          position={'relative'}
                        >
                          <TableContainer maxH={360} minH={200} overflowY={'auto'}>
                            <Table bg={'white'}>
                              <Thead bg={'myGray.50'}>
                                <Tr>
                                  <Th fontSize={'mini'} py={0} h={'34px'}>
                                    {t('common:Name')}
                                  </Th>
                                  <Th fontSize={'mini'} py={0} h={'34px'}>
                                    {t('common:plugin.Description')}
                                  </Th>
                                </Tr>
                              </Thead>
                              <Tbody>
                                {(mcpToolList || []).map((item: McpToolConfigType) => (
                                  <Tr key={item.name} height={'28px'}>
                                    <Td
                                      fontSize={'mini'}
                                      color={'myGray.900'}
                                      fontWeight={'medium'}
                                      py={2}
                                      maxW={'50%'}
                                      overflow={'hidden'}
                                      textOverflow={'ellipsis'}
                                      whiteSpace={'nowrap'}
                                    >
                                      {item.name}
                                    </Td>
                                    <Td
                                      fontSize={'mini'}
                                      color={'myGray.900'}
                                      fontWeight={'medium'}
                                      py={2}
                                      maxW={'50%'}
                                      overflow={'hidden'}
                                      textOverflow={'ellipsis'}
                                      whiteSpace={'nowrap'}
                                    >
                                      {item.description}
                                    </Td>
                                  </Tr>
                                ))}
                              </Tbody>
                            </Table>
                          </TableContainer>
                          {(!mcpToolList || mcpToolList.length === 0) && (
                            <Center
                              position={'absolute'}
                              top={0}
                              left={0}
                              right={0}
                              bottom={0}
                              fontSize={'mini'}
                              color={'myGray.500'}
                              bg={'white'}
                            >
                              {t('app:no_mcp_tools_list')}
                            </Center>
                          )}
                        </Box>
                      </Box>
                    </>
                  )}
                  {/* http */}
                  {selectedAppType === AppTypeEnum.httpToolSet && (
                    <>
                      <Box mb={5}>
                        <Flex alignItems={'center'} mb={2.5}>
                          <Box color={'myGray.900'} fontWeight={'medium'}>
                            {t('app:HTTPTools_Create_Type')}
                          </Box>
                          <Flex ml={'auto'} alignItems={'center'} gap={1}>
                            <MyIcon
                              name={'common/info'}
                              w={'14px'}
                              h={'14px'}
                              color={'myGray.500'}
                            />
                            <Box fontSize={'xs'} color={'myGray.500'}>
                              {t('app:HTTPTools_Create_Type_Tip')}
                            </Box>
                          </Flex>
                        </Flex>
                        <RadioGroup
                          aria-label={t('app:HTTPTools_Create_Type')}
                          value={createType || HttpToolTypeEnum.batch}
                          onChange={(value) => setValue('createType', value as HttpToolType)}
                          isDisabled={isBusy}
                        >
                          <Stack spacing={3}>
                            {[
                              {
                                value: HttpToolTypeEnum.batch,
                                title: t('app:type.Http batch'),
                                description: t('app:type.Http batch tip')
                              },
                              {
                                value: HttpToolTypeEnum.manual,
                                title: t('app:type.Http manual'),
                                description: t('app:type.Http manual tip')
                              }
                            ].map((option) => (
                              <Radio
                                key={option.value}
                                value={option.value}
                                w="100%"
                                p={3}
                                borderWidth="1px"
                                borderRadius="lg"
                                borderColor={
                                  createType === option.value ? 'primary.500' : 'myGray.200'
                                }
                                bg={createType === option.value ? 'primary.50' : 'white'}
                              >
                                <Text
                                  as="span"
                                  display="block"
                                  fontSize="sm"
                                  fontWeight="600"
                                  color="myGray.900"
                                >
                                  {option.title}
                                </Text>
                                <Text
                                  as="span"
                                  display="block"
                                  mt={1}
                                  fontSize="xs"
                                  color="myGray.600"
                                  lineHeight="tall"
                                >
                                  {option.description}
                                </Text>
                              </Radio>
                            ))}
                          </Stack>
                        </RadioGroup>
                      </Box>
                    </>
                  )}
                </Box>
                <Text fontSize="sm" color="myGray.600" lineHeight="tall" mt={2}>
                  {isMcp ? t('app:create_mcp_hint') : t('app:create_editor_hint')}
                </Text>
                <Flex justify="flex-end" gap={3} mt={6}>
                  <Button type="button" variant="whiteBase" onClick={goBack} isDisabled={isBusy}>
                    {t('common:Cancel')}
                  </Button>
                  <Button
                    type="submit"
                    isLoading={isCreating}
                    isDisabled={isBusy || (isMcp && !mcpToolList?.length)}
                  >
                    {t('app:create_and_configure')}
                  </Button>
                </Flex>
              </Box>
            </Box>
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
                  {t(selected.title)}
                </Text>
                <Heading as="h2" fontSize="2xl" color="myGray.900" lineHeight="short" mb={4}>
                  {t(selected.intro)}
                </Heading>
                <Text color="myGray.600" fontSize="sm" lineHeight="tall">
                  {t(selected.description)}
                </Text>
                <Box as="ol" listStyleType="none" m={0} mt={8}>
                  {steps.map(([title, description], index) => (
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
      <AvatarUploader />
    </Flex>
  );
};

export default CreateAppsPage;

export async function getServerSideProps(content: Parameters<typeof serviceSideProps>[0]) {
  return { props: { ...(await serviceSideProps(content, ['app', 'user'])) } };
}
