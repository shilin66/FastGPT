import React, { useState } from 'react';
import { Box, Button, HStack, ModalBody, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { removeUnauthModels } from '@fastgpt/global/core/workflow/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { WorkflowUtilsContext } from '../context/workflowUtilsContext';
import { WorkflowTemplateBasicTypeSchema } from '@fastgpt/global/core/workflow/type';
import MyIcon from '@fastgpt/web/components/common/Icon';

const ImportAppConfigEditor = dynamic(() => import('@/pageComponents/app/ImportAppConfigEditor'), {
  ssr: false
});

type Props = {
  onClose: () => void;
};

const ImportSettings = ({ onClose }: Props) => {
  const { toast } = useToast();

  const initData = useContextSelector(WorkflowUtilsContext, (v) => v.initData);
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const { getMyModelList } = useSystemStore();

  const { runAsync: loadModels } = useRequest(getMyModelList, { manual: true });

  const onImport = async () => {
    if (!value.trim() || isImporting) return;
    setIsImporting(true);
    try {
      const data = WorkflowTemplateBasicTypeSchema.parse(JSON.parse(value));
      const myModels = await loadModels();
      await removeUnauthModels({ modules: data.nodes, allowedModels: myModels });
      await initData(data);
      toast({ title: t('app:import_configs_success'), status: 'success' });
      onClose();
    } catch (error) {
      toast({ title: t('app:import_configs_failed'), status: 'error' });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <MyModal
      isOpen
      onClose={isImporting ? undefined : onClose}
      showCloseButton={!isImporting}
      closeOnOverlayClick={!isImporting}
      iconSrc="common/importLight"
      iconColor="primary.600"
      title={t('app:import_configs')}
      size={'md'}
    >
      <ModalBody py={5}>
        <HStack
          mb={4}
          p={3}
          borderRadius={'md'}
          bg={'orange.50'}
          color={'orange.800'}
          fontSize={'sm'}
        >
          <MyIcon name={'common/warn'} w={'16px'} flexShrink={0} />
          <Box>{t('app:file_recover')}</Box>
        </HStack>
        <ImportAppConfigEditor value={value} onChange={setValue} rows={16} />
      </ModalBody>
      <ModalFooter gap={3}>
        <Button variant={'whiteBase'} onClick={onClose} isDisabled={isImporting}>
          {t('common:Cancel')}
        </Button>
        <Button
          px={5}
          py={2}
          onClick={onImport}
          isDisabled={!value.trim()}
          isLoading={isImporting}
          fontWeight={800}
          bg={'#2563EB'}
          color={'white'}
          _hover={{ bg: '#1D4ED8' }}
        >
          {t('common:Import')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(ImportSettings);
