import React, { useRef } from 'react';
import { Button, HStack, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import dynamic from 'next/dynamic';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { AppContext } from '../../context';
import { WorkflowUtilsContext } from '../../WorkflowComponents/context/workflowUtilsContext';
import ExportConfigPopover from '../../ExportConfigPopover';

const ImportSettings = dynamic(() => import('../../WorkflowComponents/Flow/ImportSettings'));

const WorkflowConfigActions = () => {
  const { t } = useTranslation();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const flowData2StoreData = useContextSelector(WorkflowUtilsContext, (v) => v.flowData2StoreData);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const importButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <HStack spacing={2} flexShrink={0}>
        {appDetail.permission.hasWritePer && (
          <Button
            ref={importButtonRef}
            h={'34px'}
            px={3}
            borderRadius={'7px'}
            fontSize={'12px'}
            fontWeight={800}
            variant={'whiteBase'}
            border={'1px solid #DFE5EE'}
            bg={'white'}
            color={'#526075'}
            _hover={{ bg: '#EFF6FF', color: '#2563EB' }}
            leftIcon={<MyIcon name={'common/importLight'} w={'15px'} />}
            onClick={onOpen}
          >
            {t('app:import_configs')}
          </Button>
        )}
        <ExportConfigPopover
          variant={'toolbar'}
          appName={appDetail.name}
          chatConfig={appDetail.chatConfig}
          getWorkflowData={flowData2StoreData}
        />
      </HStack>
      {isOpen && (
        <ImportSettings
          onClose={() => {
            onClose();
            requestAnimationFrame(() => importButtonRef.current?.focus());
          }}
        />
      )}
    </>
  );
};

export default React.memo(WorkflowConfigActions);
