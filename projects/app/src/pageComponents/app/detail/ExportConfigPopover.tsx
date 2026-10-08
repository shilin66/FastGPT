import React, { useCallback, useState } from 'react';
import { Box, Button, Checkbox, Divider, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { filterSensitiveNodesData } from '@/web/core/workflow/utils';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { fileDownload } from '@/web/common/file/utils';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { filterSensitiveFormData } from '@/web/core/app/utils';
import { type RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import { type StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { type StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import ExportConfigToolbar from './ExportConfigToolbar';

type ExportConfigPopoverProps = {
  appName: string;
  chatConfig?: AppChatConfigType;
  filterSensitiveInfo?: boolean;
  onFilterSensitiveInfoChange?: (value: boolean) => void;
  variant?: 'menu' | 'toolbar';
} & RequireOnlyOne<{
  getWorkflowData: () =>
    | {
        nodes: StoreNodeItemType[];
        edges: StoreEdgeItemType[];
      }
    | undefined;
  appForm: AppFormEditFormType;
}>;

const ExportConfigPopover = ({
  appForm,
  getWorkflowData,
  chatConfig,
  appName,
  filterSensitiveInfo: filterSensitiveInfoProp,
  onFilterSensitiveInfoChange,
  variant = 'menu'
}: ExportConfigPopoverProps) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();

  const [localFilterSensitiveInfo, setLocalFilterSensitiveInfo] = useState<boolean>(true);
  const filterSensitiveInfo = filterSensitiveInfoProp ?? localFilterSensitiveInfo;

  const setFilterSensitiveInfo = useCallback(
    (value: boolean) => {
      onFilterSensitiveInfoChange?.(value);

      if (filterSensitiveInfoProp === undefined) {
        setLocalFilterSensitiveInfo(value);
      }
    },
    [filterSensitiveInfoProp, onFilterSensitiveInfoChange]
  );

  const onExportWorkflow = useCallback(
    async (mode: 'copy' | 'json') => {
      let config = '';

      if (appForm) {
        config = JSON.stringify(
          filterSensitiveInfo ? filterSensitiveFormData(appForm) : appForm,
          null,
          2
        );
      } else if (getWorkflowData) {
        const workflowData = getWorkflowData();
        if (!workflowData) return;
        config = JSON.stringify(
          {
            nodes: filterSensitiveInfo
              ? filterSensitiveNodesData(workflowData.nodes)
              : workflowData.nodes,
            edges: workflowData.edges,
            chatConfig
          },
          null,
          2
        );
      }

      if (!config) {
        return;
      }

      if (mode === 'copy') {
        await copyData(
          config,
          filterSensitiveInfo
            ? t('app:export_filtered_sensitive_config_successful')
            : t('app:export_config_successful')
        );
      } else if (mode === 'json') {
        fileDownload({
          text: config,
          type: 'application/json;charset=utf-8',
          filename: `${appName}.json`
        });
      }
      return true;
    },
    [appForm, appName, chatConfig, copyData, getWorkflowData, t, filterSensitiveInfo]
  );

  if (variant === 'toolbar') {
    return (
      <ExportConfigToolbar
        onExport={onExportWorkflow}
        filterSensitiveInfo={filterSensitiveInfo}
        onFilterSensitiveInfoChange={setFilterSensitiveInfo}
      />
    );
  }

  return (
    <MyPopover
      placement={'right-start'}
      offset={[0, 20]}
      hasArrow
      trigger={'hover'}
      w={'240px'}
      Trigger={
        <MyBox display={'flex'} cursor={'pointer'} onClick={(e) => e.stopPropagation()}>
          <MyIcon name={'export'} w={'16px'} mr={2} />
          <Box fontSize={'sm'}>{t('app:export_configs')}</Box>
        </MyBox>
      }
    >
      {({ onClose }) => (
        <Box p={2} onClick={(e) => e.stopPropagation()}>
          <Button
            variant={'ghost'}
            w={'full'}
            justifyContent={'flex-start'}
            h={9}
            px={2}
            fontWeight={500}
            color={'myGray.600'}
            _hover={{
              bg: 'myGray.05',
              color: 'primary.600',
              cursor: 'pointer'
            }}
            borderRadius={'xs'}
            onClick={async () => {
              if (await onExportWorkflow('copy')) onClose();
            }}
          >
            <MyIcon name={'copy'} w={'1rem'} mr={2} />
            <Box fontSize={'mini'}>{t('common:copy_to_clipboard')}</Box>
          </Button>
          <Button
            variant={'ghost'}
            w={'full'}
            justifyContent={'flex-start'}
            h={9}
            px={2}
            fontWeight={500}
            color={'myGray.600'}
            _hover={{
              bg: 'myGray.05',
              color: 'primary.600',
              cursor: 'pointer'
            }}
            borderRadius={'xs'}
            onClick={async () => {
              if (await onExportWorkflow('json')) onClose();
            }}
          >
            <MyIcon name={'configmap'} w={'1rem'} mr={2} />
            <Box fontSize={'mini'}>{t('common:export_to_json')}</Box>
          </Button>

          <Divider my={2} />

          <Flex
            py={'0.38rem'}
            px={1}
            alignItems={'center'}
            color={'myGray.600'}
            _hover={{
              bg: 'myGray.05',
              color: 'primary.600',
              cursor: 'pointer'
            }}
            borderRadius={'xs'}
          >
            <Checkbox
              flex={1}
              size="sm"
              colorScheme="primary"
              isChecked={filterSensitiveInfo}
              onChange={(e) => setFilterSensitiveInfo(e.target.checked)}
            >
              <Box fontSize={'mini'}>{t('common:filter_sensitive_info')}</Box>
            </Checkbox>
            <Box
              display={'flex'}
              alignItems={'center'}
              ml={1}
              flexShrink={0}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <QuestionTip
                color={'inherit'}
                maxW={'320px'}
                label={t('common:filter_sensitive_info_tip')}
              />
            </Box>
          </Flex>
        </Box>
      )}
    </MyPopover>
  );
};

export default React.memo(ExportConfigPopover);
