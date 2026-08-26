import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Box,
  Button,
  Flex,
  Grid,
  Input,
  ModalBody,
  ModalFooter,
  Switch,
  Textarea,
  useDisclosure
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { getPluginToolTags } from '@/web/core/plugin/toolTag/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MultipleSelect, {
  useMultipleSelect
} from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { useTranslation } from 'next-i18next';
import type { UpdateToolBodyType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import {
  delAdminSystemTool,
  getAdminAllSystemAppTool,
  getAdminSystemToolDetail,
  postAdminCreateAppTypeTool,
  putAdminUpdateTool
} from '@/web/core/plugin/admin/tool/api';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';

export const defaultForm: UpdateToolBodyType = {
  pluginId: '',
  defaultInstalled: false,
  name: '',
  avatar: 'core/app/type/pluginFill',
  intro: '',
  status: PluginStatusEnum.Normal,
  hasTokenFee: false,
  originCost: 0,
  currentCost: 0,
  userGuide: '',
  author: '',
  associatedPluginId: ''
};

const WorkflowToolConfigModal = ({
  toolId,
  onSuccess,
  onClose
}: {
  toolId: string;
  onSuccess: () => void;
  onClose: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  const { value: selectedTags, setValue: setSelectedTags } = useMultipleSelect<string>([], false);

  const { register, reset, setValue, watch, handleSubmit } = useForm<UpdateToolBodyType>({
    defaultValues: defaultForm
  });
  const name = watch('name');
  const avatar = watch('avatar');
  const associatedPluginId = watch('associatedPluginId');
  const currentCost = watch('currentCost');
  const status = watch('status');
  const defaultInstalled = watch('defaultInstalled');
  const hasTokenFee = watch('hasTokenFee');

  React.useEffect(() => {
    setValue('tagIds', selectedTags);
  }, [selectedTags, setValue]);

  useRequest(
    async () => {
      if (toolId) {
        const res = await getAdminSystemToolDetail({ toolId });
        const form: UpdateToolBodyType = {
          pluginId: res.id,
          status: res.status,
          defaultInstalled: res.defaultInstalled,
          originCost: res.originCost,
          currentCost: res.currentCost,
          systemKeyCost: res.systemKeyCost,
          hasTokenFee: res.hasTokenFee,
          inputListVal: res.inputListVal,
          name: res.name,
          avatar: res.avatar,
          intro: res.intro,
          tagIds: res.tags || [],
          associatedPluginId: res.associatedPluginId,
          userGuide: res.userGuide || '',
          author: res.author
        };
        setSelectedTags(res.tags || []);
        return form;
      }
      return defaultForm;
    },
    {
      onSuccess(res) {
        reset(res);
      },
      manual: false
    }
  );

  const isEdit = !!toolId;

  const [searchKey, setSearchKey] = useState('');
  const [lastPluginId, setLastPluginId] = useState<string | undefined>('');

  const { data: apps = [], loading: loadingPlugins } = useRequest(
    () => getAdminAllSystemAppTool({ searchKey }),
    {
      manual: false,
      refreshDeps: [searchKey]
    }
  );

  const { data: tags = [], loading: loadingTags } = useRequest(getPluginToolTags, {
    manual: false
  });
  const pluginTypeSelectList = useMemo(
    () =>
      tags?.map((tag) => ({
        label: parseI18nString(tag.tagName, i18n.language),
        value: tag.tagId
      })) || [],
    [i18n.language, tags]
  );

  const currentApp = useMemo(() => {
    return apps.find((item) => item._id === associatedPluginId);
  }, [apps, associatedPluginId]);

  const {
    isOpen: isOpenAppListMenu,
    onClose: onCloseAppListMenu,
    onOpen: onOpenAppListMenu
  } = useDisclosure();

  const {
    Component: AvatarUploader,
    handleFileSelectorOpen: handleAvatarSelectorOpen,
    uploading: isUploadingAvatar
  } = useUploadAvatar(getUploadAvatarPresignedUrl, {
    onSuccess(avatarUrl) {
      setValue('avatar', avatarUrl);
    }
  });

  const { runAsync: onSubmit, loading: isSubmitting } = useRequest(
    (data: UpdateToolBodyType) => {
      if (!data.associatedPluginId) {
        return Promise.reject(t('app:custom_plugin_associated_plugin_required'));
      }

      const formatData: UpdateToolBodyType = {
        ...data,
        pluginId: toolId
      };

      if (formatData.pluginId) {
        return putAdminUpdateTool(formatData);
      }

      return postAdminCreateAppTypeTool(formatData);
    },
    {
      manual: true,
      successToast: t('app:custom_plugin_config_success'),
      onSuccess: () => {
        onSuccess();
        onClose();
      },
      onError() {},
      refreshDeps: [toolId]
    }
  );

  const { runAsync: onDelete, loading: isDeleting } = useRequest(delAdminSystemTool, {
    onSuccess() {
      toast({
        title: t('app:custom_plugin_delete_success'),
        status: 'success'
      });
      onSuccess();
      onClose();
    }
  });

  return (
    <MyModal
      isCentered
      isOpen
      title={t('app:custom_plugin_config_title', { name: name || t('app:custom_plugin') })}
      maxW={['94vw', '980px']}
      w={'100%'}
      iconSrc={avatar}
      position={'relative'}
      onClose={onClose}
      isLoading={loadingPlugins || loadingTags}
    >
      <ModalBody flex={1} w={'full'} maxH={'72vh'} p={0} overflowY={'auto'}>
        <Flex
          px={6}
          py={5}
          gap={5}
          alignItems={'flex-start'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
        >
          <MyTooltip
            label={
              isUploadingAvatar
                ? t('app:custom_plugin_uploading')
                : t('app:custom_plugin_click_upload_avatar')
            }
          >
            <Avatar
              flexShrink={0}
              src={avatar}
              w={'52px'}
              h={'52px'}
              cursor={isUploadingAvatar ? 'not-allowed' : 'pointer'}
              borderRadius={'md'}
              onClick={isUploadingAvatar ? undefined : handleAvatarSelectorOpen}
              opacity={isUploadingAvatar ? 0.6 : 1}
            />
          </MyTooltip>
          <Grid
            flex={1}
            minW={0}
            gridTemplateColumns={{ base: '1fr', md: 'minmax(220px, 0.8fr) minmax(320px, 1.2fr)' }}
            gap={4}
          >
            <Box>
              <Box mb={2} color={'myGray.900'} fontSize={'sm'} fontWeight={700}>
                {t('app:custom_plugin_name_label')}
              </Box>
              <Input
                autoFocus
                {...register('name', {
                  required: t('app:custom_plugin_name_required')
                })}
              />
            </Box>
            <Box>
              <Box mb={2} color={'myGray.900'} fontSize={'sm'} fontWeight={700}>
                {t('app:custom_plugin_intro_label')}
              </Box>
              <Textarea
                {...register('intro')}
                minH={'76px'}
                resize={'vertical'}
                placeholder={t('app:custom_plugin_intro_placeholder')}
              />
            </Box>
          </Grid>
        </Flex>

        <Flex
          px={6}
          py={5}
          gap={6}
          alignItems={'flex-start'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
        >
          <Box w={'170px'} flexShrink={0}>
            <Box color={'myGray.900'} fontSize={'sm'} fontWeight={800}>
              {t('app:toolkit_plugin_classification')}
            </Box>
            <Box mt={1} color={'myGray.500'} fontSize={'xs'} lineHeight={1.6}>
              {t('app:custom_plugin_associated_plugin_label')} / {t('app:custom_plugin_tags_label')}
            </Box>
          </Box>

          <Grid
            flex={1}
            minW={0}
            gridTemplateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }}
            gap={4}
          >
            <Box position={'relative'}>
              <Box mb={2} color={'myGray.700'} fontSize={'xs'} fontWeight={700}>
                {t('app:custom_plugin_associated_plugin_label')}
              </Box>
              {associatedPluginId && currentApp && (
                <Avatar
                  src={currentApp.avatar}
                  w={'20px'}
                  h={'20px'}
                  borderRadius={'sm'}
                  position={'absolute'}
                  left={3}
                  bottom={'10px'}
                  zIndex={1}
                />
              )}
              <Input
                pl={associatedPluginId && currentApp ? 10 : 3}
                placeholder={t('app:custom_plugin_associated_plugin_placeholder')}
                value={associatedPluginId ? currentApp?.name || searchKey : searchKey}
                onChange={(event) => setSearchKey(event.target.value)}
                onFocus={() => {
                  onOpenAppListMenu();
                  setLastPluginId(associatedPluginId);
                  setValue('associatedPluginId', undefined);
                }}
                onBlur={() => {
                  onCloseAppListMenu();
                  if (associatedPluginId) return;
                  setValue('associatedPluginId', lastPluginId);
                }}
              />
              {isOpenAppListMenu && apps.length > 0 && (
                <Flex
                  position={'absolute'}
                  top={'68px'}
                  left={0}
                  right={0}
                  maxH={'220px'}
                  p={1}
                  flexDirection={'column'}
                  overflow={'auto'}
                  border={'1px solid'}
                  borderColor={'myGray.200'}
                  borderRadius={'md'}
                  boxShadow={'lg'}
                  bg={'white'}
                  zIndex={10}
                >
                  {apps.map((item) => (
                    <Flex
                      key={item._id}
                      px={3}
                      py={2}
                      alignItems={'center'}
                      borderRadius={'sm'}
                      cursor={'pointer'}
                      _hover={{ bg: 'myGray.100' }}
                      onMouseDown={() => {
                        setSearchKey(item.name);
                        setValue('associatedPluginId', item._id);
                        onCloseAppListMenu();
                      }}
                    >
                      <Avatar src={item.avatar} w={'22px'} h={'22px'} borderRadius={'sm'} />
                      <Box ml={2} minW={0} fontSize={'sm'} noOfLines={1}>
                        {item.name}
                      </Box>
                    </Flex>
                  ))}
                </Flex>
              )}
            </Box>

            <Box>
              <Box mb={2} color={'myGray.700'} fontSize={'xs'} fontWeight={700}>
                {t('app:custom_plugin_tags_label')}
              </Box>
              <MultipleSelect
                list={pluginTypeSelectList}
                value={selectedTags}
                onSelect={(newTags) => {
                  if (newTags.length > 3) {
                    toast({
                      title: t('app:custom_plugin_tags_max_limit'),
                      status: 'warning'
                    });
                    return;
                  }
                  setSelectedTags(newTags);
                }}
                placeholder={t('app:custom_plugin_tags_label')}
                w={'full'}
                h={10}
                borderRadius={'md'}
              />
            </Box>

            <Box>
              <Box mb={2} color={'myGray.700'} fontSize={'xs'} fontWeight={700}>
                {t('app:custom_plugin_author_label')}
              </Box>
              <Input
                placeholder={t('app:custom_plugin_author_placeholder')}
                {...register('author')}
              />
            </Box>

            <Box>
              <Box mb={2} color={'myGray.700'} fontSize={'xs'} fontWeight={700}>
                {t('app:custom_plugin_plugin_status_label')}
              </Box>
              <MySelect<PluginStatusEnum>
                value={status}
                w={'full'}
                list={[
                  { label: t('app:toolkit_status_normal'), value: PluginStatusEnum.Normal },
                  {
                    label: t('app:toolkit_status_soon_offline'),
                    value: PluginStatusEnum.SoonOffline
                  },
                  { label: t('app:toolkit_status_offline'), value: PluginStatusEnum.Offline }
                ]}
                onChange={(value) => {
                  setValue('status', value);
                  if (value !== PluginStatusEnum.Normal) {
                    setValue('defaultInstalled', false);
                  }
                }}
                fontWeight={'normal'}
              />
            </Box>
          </Grid>
        </Flex>

        <Flex
          px={6}
          py={5}
          gap={6}
          alignItems={'stretch'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
          bg={'myGray.25'}
        >
          <Box w={'170px'} flexShrink={0}>
            <Box color={'myGray.900'} fontSize={'sm'} fontWeight={800}>
              {t('app:toolkit_runtime_policy')}
            </Box>
            <Box mt={1} color={'myGray.500'} fontSize={'xs'} lineHeight={1.6}>
              {t('app:custom_plugin_plugin_status_label')}
            </Box>
          </Box>

          <Grid
            flex={1}
            minW={0}
            gridTemplateColumns={{ base: '1fr', md: 'repeat(3, minmax(0, 1fr))' }}
            gap={0}
            bg={'white'}
            border={'1px solid'}
            borderColor={'myGray.200'}
            borderRadius={'md'}
          >
            <Flex px={4} py={3} alignItems={'center'} justifyContent={'space-between'} gap={3}>
              <Box color={'myGray.800'} fontSize={'sm'} fontWeight={600}>
                {t('app:custom_plugin_default_installed_label')}
              </Box>
              <Switch
                isChecked={defaultInstalled}
                onChange={(event) => {
                  const newDefaultInstalled = event.target.checked;
                  setValue('defaultInstalled', newDefaultInstalled);
                  if (newDefaultInstalled && status !== PluginStatusEnum.Normal) {
                    setValue('status', PluginStatusEnum.Normal);
                  }
                }}
              />
            </Flex>
            <Flex
              px={4}
              py={3}
              alignItems={'center'}
              justifyContent={'space-between'}
              gap={3}
              borderLeft={{ base: 'none', md: '1px solid' }}
              borderTop={{ base: '1px solid', md: 'none' }}
              borderColor={'myGray.200'}
            >
              <Box color={'myGray.800'} fontSize={'sm'} fontWeight={600}>
                {t('app:custom_plugin_has_token_fee_label')}
              </Box>
              <Switch
                isChecked={hasTokenFee}
                onChange={(event) => setValue('hasTokenFee', event.target.checked)}
              />
            </Flex>
            <Box
              px={4}
              py={3}
              borderLeft={{ base: 'none', md: '1px solid' }}
              borderTop={{ base: '1px solid', md: 'none' }}
              borderColor={'myGray.200'}
            >
              <Box mb={2} color={'myGray.700'} fontSize={'xs'} fontWeight={700}>
                {t('app:custom_plugin_call_price_label')}
              </Box>
              <MyNumberInput
                value={currentCost ?? 0}
                onChange={(value) => setValue('currentCost', value ?? 0)}
                max={1000}
                min={0}
                step={0.1}
                w={'full'}
                h={9}
              />
            </Box>
          </Grid>
        </Flex>

        <Flex px={6} py={5} gap={6} alignItems={'flex-start'}>
          <Box w={'170px'} flexShrink={0}>
            <Box color={'myGray.900'} fontSize={'sm'} fontWeight={800}>
              {t('app:custom_plugin_user_guide_label')}
            </Box>
            <Box mt={1} color={'myGray.500'} fontSize={'xs'} lineHeight={1.6}>
              Markdown
            </Box>
          </Box>
          <Textarea
            flex={1}
            {...register('userGuide')}
            placeholder={t('app:custom_plugin_user_guide_placeholder')}
            minH={'170px'}
            maxH={'260px'}
            resize={'vertical'}
          />
        </Flex>
      </ModalBody>
      <ModalFooter px={6} py={4} justifyContent={'space-between'}>
        {toolId ? (
          <PopoverConfirm
            type="delete"
            content={t('app:confirm_delete_tool')}
            onConfirm={() => onDelete({ toolId })}
            Trigger={
              <Button variant={'whiteDanger'} isLoading={isDeleting}>
                {t('common:Delete')}
              </Button>
            }
          />
        ) : (
          <Box />
        )}

        <Flex gap={2}>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Close')}
          </Button>
          <Button isLoading={isSubmitting || isUploadingAvatar} onClick={handleSubmit(onSubmit)}>
            {isEdit ? t('app:custom_plugin_update') : t('app:custom_plugin_create')}
          </Button>
        </Flex>
      </ModalFooter>
      <AvatarUploader />
    </MyModal>
  );
};

export default WorkflowToolConfigModal;
