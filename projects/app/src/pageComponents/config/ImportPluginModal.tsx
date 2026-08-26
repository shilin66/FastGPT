import React, { useState, useCallback } from 'react';
import { Box, Button, Center, Flex, Grid, IconButton } from '@chakra-ui/react';
import MyRightDrawer from '@fastgpt/web/components/common/MyDrawer/MyRightDrawer';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'react-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import FileSelectorBox, { type SelectFileItemType } from '@/components/Select/FileSelectorBox';
import {
  getPkgPluginUploadURL,
  parseUploadedPkgPlugin,
  confirmPkgPluginUpload
} from '@/web/core/plugin/admin/api';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { getDocPath } from '@/web/common/system/doc';
import { getMarketPlaceToolTags } from '@/web/core/plugin/marketplace/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { GetAdminSystemToolsResponseType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { putFileToS3 } from '@fastgpt/web/common/file/utils';

type UploadedPluginFile = SelectFileItemType & {
  status: 'uploading' | 'parsing' | 'success' | 'error' | 'duplicate';
  errorMsg?: string;
  toolId?: string;
  toolName?: string;
  toolIntro?: string;
  toolTags?: string[];
};

const ImportPluginModal = ({
  onClose,
  onSuccess,
  tools
}: {
  onClose: () => void;
  onSuccess?: () => void;
  tools: GetAdminSystemToolsResponseType;
}) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  const [selectFiles, setSelectFiles] = useState<SelectFileItemType[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedPluginFile[]>([]);

  const { data: allTags = [] } = useRequest(getMarketPlaceToolTags, {
    manual: false
  });

  const uploadAndParseFile = async (file: UploadedPluginFile) => {
    try {
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.name === file.name ? { ...f, status: 'uploading', errorMsg: undefined } : f
        )
      );

      const { formData, objectName, postURL } = await getPkgPluginUploadURL({
        filename: file.name
      });

      await putFileToS3({
        url: postURL,
        headers: formData,
        file: file.file,
        t,
        onSuccess: () => {
          setUploadedFiles((prev) =>
            prev.map((f) => (f.name === file.name ? { ...f, status: 'parsing' } : f))
          );
        }
      });

      const parseResult = await parseUploadedPkgPlugin({ objectName });

      const parentId = parseResult.find((item) => !item.parentId)?.toolId;
      if (!parentId) {
        return Promise.reject(new Error(`${t('app:custom_plugin_parse_error')}`));
      }
      const toolDetail = parseResult.find((item) => item.toolId === parentId);
      if (!toolDetail) {
        return Promise.reject(new Error(`${t('app:custom_plugin_parse_error')}`));
      }
      const isDuplicated = tools.some((tool) => tool.id.includes(toolDetail.toolId));

      setUploadedFiles((prev) =>
        prev.map((prevFile) =>
          prevFile.name === file.name
            ? {
                ...prevFile,
                status: isDuplicated ? 'duplicate' : 'success',
                toolId: parentId,
                toolName: parseI18nString(toolDetail.name || '', i18n.language),
                icon: toolDetail.icon || '',
                toolIntro: parseI18nString(toolDetail.description || '', i18n.language) || '',
                toolTags:
                  toolDetail.tags?.map((tag) => {
                    const currentTag = allTags.find((item) => item.tagId === tag);
                    return parseI18nString(currentTag?.tagName || '', i18n.language) || '';
                  }) || []
              }
            : prevFile
        )
      );
    } catch (error: any) {
      setUploadedFiles((prev) =>
        prev.map((prevFile) =>
          prevFile.name === file.name
            ? { ...prevFile, status: 'error', errorMsg: error.message }
            : prevFile
        )
      );
    }
  };

  const { runAsync: handleBatchUpload, loading: uploadLoading } = useRequest(
    async (files: SelectFileItemType[]) => {
      const newUploadedFiles: UploadedPluginFile[] = files.map((f) => ({
        ...f,
        status: 'uploading' as const
      }));
      setUploadedFiles((prev) => [...prev, ...newUploadedFiles]);

      for (const file of newUploadedFiles) {
        await uploadAndParseFile(file);
      }
    },
    {
      manual: true
    }
  );

  const onSelectFiles = useCallback(
    (files: SelectFileItemType[]) => {
      const currentUploadFiles = files.filter(
        (file) => !selectFiles.some((f) => f.name === file.name)
      );
      const filteredFiles = files.filter(
        (file) => !uploadedFiles.some((f) => f.name === file.name)
      );

      if (filteredFiles.length !== currentUploadFiles.length) {
        toast({
          title: t('app:upload_file_exists_filtered'),
          status: 'info'
        });
      }
      setSelectFiles(filteredFiles);

      if (filteredFiles.length > 0) {
        handleBatchUpload(filteredFiles);
      }
    },
    [handleBatchUpload, selectFiles, t, toast, uploadedFiles]
  );

  const handleRetry = async (file: UploadedPluginFile) => {
    await uploadAndParseFile(file);
  };

  const handleDelete = (file: UploadedPluginFile) => {
    setUploadedFiles((prev) => prev.filter((f) => f.name !== file.name));
    setSelectFiles((prev) => prev.filter((f) => f.name !== file.name));
  };

  const { runAsync: handleConfirmImport, loading: confirmLoading } = useRequest(
    async () => {
      const successToolIds = uploadedFiles
        .filter((file) => (file.status === 'success' || file.status === 'duplicate') && file.toolId)
        .map((file) => file.toolId!);

      await confirmPkgPluginUpload({ toolIds: successToolIds });
    },
    {
      manual: true,
      onSuccess: () => {
        setUploadedFiles([]);
        onSuccess?.();
        onClose();
      }
    }
  );

  return (
    <MyRightDrawer
      onClose={onClose}
      title={t('app:toolkit_import_resource')}
      maxW={['94vw', '960px']}
      h={'100%'}
      mt={0}
      px={0}
    >
      <Box px={6} py={4} borderBottom={'1px solid'} borderColor={'myGray.200'}>
        <Flex mb={3} alignItems={'center'} justifyContent={'space-between'} gap={4}>
          <Box>
            <Box color={'myGray.900'} fontSize={'sm'} fontWeight={700}>
              {t('app:toolkit_import_resource')}
            </Box>
            <Box mt={0.5} color={'myGray.500'} fontSize={'xs'}>
              {t('app:toolkit_upload_tip')}
            </Box>
          </Box>
          <Button
            variant={'whiteBase'}
            size={'sm'}
            leftIcon={<MyIcon name={'book'} w={'14px'} />}
            onClick={() => {
              window.open(
                getDocPath('/docs/introduction/guide/plugins/upload_system_tool'),
                '_blank'
              );
            }}
          >
            {t('common:Instructions')}
          </Button>
        </Flex>
        <FileSelectorBox
          maxCount={100}
          fileType=".pkg"
          selectFiles={selectFiles}
          setSelectFiles={onSelectFiles}
          h={96}
        />
      </Box>

      <Box flex={1} minH={0} px={6} py={5} overflow={'auto'}>
        <Flex mb={3} alignItems={'center'} justifyContent={'space-between'}>
          <Box color={'myGray.900'} fontSize={'sm'} fontWeight={700}>
            {t('app:toolkit_import_queue')}
          </Box>
          <Box color={'myGray.500'} fontSize={'xs'}>
            {uploadedFiles.length}
          </Box>
        </Flex>

        <Box
          border={'1px solid'}
          borderColor={'myGray.200'}
          borderRadius={'md'}
          overflow={'hidden'}
        >
          <Grid
            gridTemplateColumns={'minmax(280px, 2fr) minmax(150px, 1fr) 130px 84px'}
            minH={'40px'}
            px={4}
            alignItems={'center'}
            bg={'myGray.50'}
            borderBottom={uploadedFiles.length > 0 ? '1px solid' : undefined}
            borderColor={'myGray.200'}
            color={'myGray.600'}
            fontSize={'xs'}
            fontWeight={700}
          >
            <Box>{t('common:name')}</Box>
            <Box>{t('app:toolkit_tags')}</Box>
            <Box>{t('common:Status')}</Box>
            <Box textAlign={'center'}>{t('common:Action')}</Box>
          </Grid>

          {uploadedFiles.length === 0 ? (
            <Center minH={'180px'} flexDirection={'column'} bg={'white'}>
              <Flex
                w={10}
                h={10}
                alignItems={'center'}
                justifyContent={'center'}
                borderRadius={'md'}
                bg={'myGray.100'}
                color={'myGray.600'}
              >
                <MyIcon name={'common/uploadFileFill'} w={'20px'} />
              </Flex>
              <Box mt={3} color={'myGray.700'} fontSize={'sm'} fontWeight={600}>
                {t('app:toolkit_import_queue')}
              </Box>
              <Box mt={1} color={'myGray.500'} fontSize={'xs'}>
                {t('app:toolkit_import_resource')}
              </Box>
            </Center>
          ) : (
            uploadedFiles.map((item) => (
              <Grid
                key={item.name}
                gridTemplateColumns={'minmax(280px, 2fr) minmax(150px, 1fr) 130px 84px'}
                minH={'68px'}
                px={4}
                alignItems={'center'}
                borderBottom={'1px solid'}
                borderColor={'myGray.150'}
                _last={{ borderBottom: 'none' }}
                bg={'white'}
              >
                <Flex minW={0} alignItems={'center'} gap={3} pr={5}>
                  <Avatar
                    src={item.icon || 'core/app/type/pluginFill'}
                    borderRadius={'md'}
                    w={'34px'}
                    h={'34px'}
                    flexShrink={0}
                  />
                  <Box minW={0}>
                    <Box
                      color={'myGray.900'}
                      fontSize={'sm'}
                      fontWeight={700}
                      overflow={'hidden'}
                      textOverflow={'ellipsis'}
                      whiteSpace={'nowrap'}
                    >
                      {(item.status === 'success' || item.status === 'duplicate') && item.toolName
                        ? item.toolName
                        : item.name}
                    </Box>
                    <Box
                      mt={0.5}
                      color={'myGray.500'}
                      fontSize={'xs'}
                      overflow={'hidden'}
                      textOverflow={'ellipsis'}
                      whiteSpace={'nowrap'}
                    >
                      {(item.status === 'success' || item.status === 'duplicate') && item.toolIntro
                        ? item.toolIntro
                        : item.name}
                    </Box>
                  </Box>
                </Flex>

                <Flex minW={0} gap={1} overflow={'hidden'} pr={3}>
                  {(item.status === 'success' || item.status === 'duplicate') &&
                  item.toolTags &&
                  item.toolTags.length > 0 ? (
                    <>
                      {item.toolTags.slice(0, 2).map((tag) => (
                        <Box
                          key={tag}
                          px={1.5}
                          py={0.5}
                          borderRadius={'sm'}
                          bg={'myGray.100'}
                          color={'myGray.700'}
                          fontSize={'xs'}
                          whiteSpace={'nowrap'}
                        >
                          {tag}
                        </Box>
                      ))}
                      {item.toolTags.length > 2 && (
                        <Box color={'myGray.500'} fontSize={'xs'}>
                          +{item.toolTags.length - 2}
                        </Box>
                      )}
                    </>
                  ) : (
                    <Box color={'myGray.400'} fontSize={'xs'}>
                      -
                    </Box>
                  )}
                </Flex>

                <Flex alignItems={'center'} gap={1.5} fontSize={'xs'} fontWeight={600}>
                  <Box
                    w={2}
                    h={2}
                    borderRadius={'full'}
                    bg={
                      item.status === 'error'
                        ? 'red.500'
                        : item.status === 'duplicate'
                          ? 'yellow.400'
                          : item.status === 'success'
                            ? 'green.500'
                            : 'primary.500'
                    }
                  />
                  <Box
                    color={
                      item.status === 'error'
                        ? 'red.600'
                        : item.status === 'duplicate'
                          ? 'yellow.600'
                          : item.status === 'success'
                            ? 'green.600'
                            : 'primary.600'
                    }
                  >
                    {item.status === 'uploading'
                      ? t('app:custom_plugin_uploading')
                      : item.status === 'parsing'
                        ? t('app:custom_plugin_parsing')
                        : item.status === 'duplicate'
                          ? t('app:custom_plugin_duplicate')
                          : item.status === 'success'
                            ? t('app:custom_plugin_uploaded')
                            : t('app:custom_plugin_upload_failed')}
                  </Box>
                  {item.status === 'duplicate' && (
                    <QuestionTip label={t('app:custom_plugin_duplicate_tip')} />
                  )}
                  {item.status === 'error' && <QuestionTip label={item.errorMsg} />}
                </Flex>

                <Flex justifyContent={'center'} gap={1}>
                  {item.status === 'error' && (
                    <IconButton
                      aria-label={t('common:Restart')}
                      variant={'ghost'}
                      size={'sm'}
                      icon={<MyIcon name={'common/confirm/restoreTip'} w={'15px'} />}
                      onClick={() => handleRetry(item)}
                    />
                  )}
                  <IconButton
                    aria-label={t('common:Delete')}
                    variant={'ghost'}
                    size={'sm'}
                    color={'myGray.500'}
                    icon={<MyIcon name={'delete'} w={'15px'} />}
                    _hover={{ color: 'red.600', bg: 'red.50' }}
                    onClick={() => handleDelete(item)}
                  />
                </Flex>
              </Grid>
            ))
          )}
        </Box>
      </Box>

      <Flex
        justify={'flex-end'}
        gap={2}
        px={6}
        py={4}
        borderTop={'1px solid'}
        borderColor={'myGray.200'}
      >
        <Button variant="whiteBase" onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button
          onClick={handleConfirmImport}
          isDisabled={
            uploadedFiles.length === 0 ||
            uploadedFiles.every((f) => f.status !== 'success' && f.status !== 'duplicate')
          }
          isLoading={confirmLoading || uploadLoading}
        >
          {t('common:comfirm_import')}
        </Button>
      </Flex>
    </MyRightDrawer>
  );
};

export default ImportPluginModal;
