import React, { type DragEvent, useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Flex, IconButton, ModalBody, Text } from '@chakra-ui/react';
import { getErrText } from '@fastgpt/global/common/error/utils';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSelectFile } from '@fastgpt/web/common/file/hooks/useSelectFile';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { importSkill } from '@/web/core/skill/api';

const MAX_SIZE = 100 * 1024 * 1024; // 100MB
const ACCEPT_TYPES = '.zip';

type Props = {
  parentId?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
};

const isValidFile = (file: File) => {
  return file.name.toLowerCase().endsWith('.zip');
};

const getFileExt = (file: File): string => {
  const name = file.name.toLowerCase();
  const match = name.match(/\.[^.]+$/);
  return match ? match[0] : '';
};

export const ImportSkillForm = ({
  parentId,
  onClose,
  onSuccess,
  onBusyChange
}: Props & {
  onBusyChange?: (busy: boolean) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importError, setImportError] = useState('');

  const { File: FileInput, onOpen } = useSelectFile({
    fileType: ACCEPT_TYPES,
    multiple: false,
    maxCount: 1
  });

  const { run: onImport, loading: isImporting } = useRequest(
    () => {
      const formData = new FormData();
      formData.append('file', selectedFile!);
      if (parentId) formData.append('parentId', parentId);
      return importSkill(formData);
    },
    {
      onBefore() {
        setImportError('');
      },
      onError(error) {
        setImportError(getErrText(error));
      },
      onSuccess() {
        onSuccess?.();
        onClose();
      },
      successToast: t('common:import_success'),
      errorToast: t('common:import_failed')
    }
  );

  useEffect(() => onBusyChange?.(isImporting), [isImporting, onBusyChange]);

  const handleFile = useCallback(
    (file: File) => {
      if (!isValidFile(file)) {
        const ext = getFileExt(file);
        toast({
          status: 'warning',
          title: t('skill:unsupported_file_format', { ext })
        });
        return;
      }
      if (file.size > MAX_SIZE) {
        toast({
          status: 'warning',
          title: t('file:some_file_size_exceeds_limit', { maxSize: formatFileSize(MAX_SIZE) })
        });
        return;
      }
      setSelectedFile(file);
      setImportError('');
    },
    [t, toast]
  );

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <Box>
      {importError && (
        <Alert status="error" mb={4}>
          {importError}
        </Alert>
      )}
      <Text fontSize="sm" fontWeight="medium" color="myGray.900" mb={3}>
        {t('skill:create_import_file_label')}
      </Text>
      {selectedFile ? (
        <Flex
          alignItems={'center'}
          gap={2}
          border={'1px solid'}
          borderColor={'myGray.200'}
          borderRadius={'md'}
          p={3}
        >
          <MyIcon name={'common/importLight'} w={'24px'} flexShrink={0} color={'myGray.500'} />
          <Box flex={1} fontSize={'sm'} color={'myGray.700'} isTruncated>
            {selectedFile.name}
          </Box>
          <Box fontSize={'xs'} color={'myGray.500'} flexShrink={0}>
            {formatFileSize(selectedFile.size)}
          </Box>
          <IconButton
            aria-label={t('skill:create_remove_file')}
            title={t('skill:create_remove_file')}
            icon={<MyIcon name={'common/closeLight'} w={'16px'} />}
            variant="ghost"
            size="sm"
            isDisabled={isImporting}
            color={'myGray.400'}
            _hover={{ color: 'myGray.700' }}
            onClick={() => setSelectedFile(null)}
            flexShrink={0}
          />
        </Flex>
      ) : (
        <Flex
          as="button"
          type="button"
          w="100%"
          aria-label={t('skill:create_import_file_label')}
          flexDirection={'column'}
          alignItems={'center'}
          justifyContent={'center'}
          px={3}
          py={7}
          borderWidth={'1.5px'}
          borderStyle={'dashed'}
          borderRadius={'md'}
          cursor={'pointer'}
          borderColor={isDragging ? 'primary.600' : 'borderColor.high'}
          _hover={{ bg: 'primary.50', borderColor: 'primary.600' }}
          _focusVisible={{
            outline: '2px solid',
            outlineColor: 'primary.500',
            outlineOffset: '2px'
          }}
          onDragEnter={handleDragEnter}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={onOpen}
        >
          <MyIcon name={'common/uploadFileFill'} w={'32px'} />
          <Box fontWeight={'bold'} mt={2}>
            {isDragging
              ? t('file:release_the_mouse_to_upload_the_file')
              : t('file:select_and_drag_file_tip')}
          </Box>
          <Box color={'myGray.500'} fontSize={'xs'} mt={1}>
            {t('skill:import_skill_file_type_tip', { ext: ACCEPT_TYPES.split(',').join(' ') })}
          </Box>
          <Box color={'myGray.500'} fontSize={'xs'}>
            {t('skill:import_skill_max_size_tip', {
              maxCount: 1,
              maxSize: formatFileSize(MAX_SIZE)
            })}
          </Box>
        </Flex>
      )}
      <Text mt={3} fontSize="sm" color="myGray.500" lineHeight="tall">
        {t('skill:create_import_form_hint', { maxSize: formatFileSize(MAX_SIZE) })}
      </Text>
      <FileInput onSelect={(files) => files[0] && handleFile(files[0])} />
      <Flex gap={3} mt={6} justify="flex-end" flexWrap="wrap">
        <Button variant={'whiteBase'} onClick={onClose} isDisabled={isImporting}>
          {t('common:Cancel')}
        </Button>
        <Button isDisabled={!selectedFile} isLoading={isImporting} onClick={onImport}>
          {t('skill:import_skill')}
        </Button>
      </Flex>
    </Box>
  );
};

const ImportSkillModal = (props: Props) => {
  const { t } = useTranslation();
  return (
    <MyModal
      isOpen
      onClose={props.onClose}
      title={t('skill:import_skill')}
      w="480px"
      closeOnOverlayClick={false}
    >
      <ModalBody>
        <ImportSkillForm {...props} />
      </ModalBody>
    </MyModal>
  );
};

export default ImportSkillModal;
