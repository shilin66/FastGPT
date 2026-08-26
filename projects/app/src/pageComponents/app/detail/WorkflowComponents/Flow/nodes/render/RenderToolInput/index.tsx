import React, { useMemo, useState } from 'react';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import {
  Box,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  HStack
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import dynamic from 'next/dynamic';
import { defaultEditFormData } from './EditFieldModal';
import { useContextSelector } from 'use-context-selector';
import IOTitle from '../../../components/IOTitle';
import { SmallAddIcon } from '@chakra-ui/icons';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { WorkflowUtilsContext } from '../../../../context/workflowUtilsContext';
import { WorkflowActionsContext } from '../../../../context/workflowActionsContext';
const EditFieldModal = dynamic(() => import('./EditFieldModal'));

const RenderToolInput = ({
  nodeId,
  inputs
}: {
  nodeId: string;
  inputs: FlowNodeInputItemType[];
}) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const splitToolInputs = useContextSelector(WorkflowUtilsContext, (ctx) => ctx.splitToolInputs);
  const { toolInputs } = useMemoEnhance(
    () => splitToolInputs(inputs, nodeId),
    [inputs, nodeId, splitToolInputs]
  );

  const dynamicInput = useMemo(() => {
    return inputs.find((item) => item.renderTypeList[0] === FlowNodeInputTypeEnum.addInputParam);
  }, [inputs]);

  const [editField, setEditField] = useState<FlowNodeInputItemType>();

  return (
    <>
      <HStack
        mb={3}
        justifyContent={'space-between'}
        px={3}
        py={2}
        bg={'rgba(248, 250, 252, 0.92)'}
        border={'1px solid rgba(148, 163, 184, 0.18)'}
        borderRadius={'12px'}
      >
        <IOTitle
          text={t('workflow:tool_input')}
          mb={0}
          mx={0}
          mt={0}
          px={0}
          py={0}
          minH={'auto'}
          bg={'transparent'}
          borderBottom={'0'}
        />
        {dynamicInput && (
          <Button
            variant={'whitePrimary'}
            leftIcon={<SmallAddIcon />}
            iconSpacing={1}
            size={'sm'}
            onClick={() => setEditField(defaultEditFormData)}
          >
            {t('common:add_new')}
          </Button>
        )}
      </HStack>

      <Box
        borderRadius={'14px'}
        overflow={'hidden'}
        border={'1px solid rgba(148, 163, 184, 0.22)'}
        boxShadow={'0 12px 28px rgba(15, 23, 42, 0.04)'}
      >
        <TableContainer>
          <Table bg={'white'}>
            <Thead>
              <Tr>
                <Th>{t('common:item_name')}</Th>
                <Th>{t('common:item_description')}</Th>
                <Th>{t('common:required')}</Th>
                {dynamicInput && <Th></Th>}
              </Tr>
            </Thead>
            <Tbody>
              {toolInputs.map((item, index) => (
                <Tr
                  key={index}
                  position={'relative'}
                  whiteSpace={'pre-wrap'}
                  wordBreak={'break-all'}
                >
                  <Td>{item.key}</Td>
                  <Td>{item.toolDescription}</Td>
                  <Td>{item.required ? '✔' : ''}</Td>
                  {dynamicInput && (
                    <Td whiteSpace={'nowrap'}>
                      <MyIcon
                        mr={3}
                        name={'common/settingLight'}
                        w={'16px'}
                        cursor={'pointer'}
                        onClick={() => setEditField(item)}
                      />
                      <MyIcon
                        name={'delete'}
                        w={'16px'}
                        cursor={'pointer'}
                        onClick={() => {
                          onChangeNode({
                            nodeId,
                            type: 'delInput',
                            key: item.key
                          });
                        }}
                      />
                    </Td>
                  )}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </Box>

      {!!editField && (
        <EditFieldModal
          defaultValue={editField}
          nodeId={nodeId}
          onClose={() => setEditField(undefined)}
        />
      )}
    </>
  );
};

export default React.memo(RenderToolInput);
