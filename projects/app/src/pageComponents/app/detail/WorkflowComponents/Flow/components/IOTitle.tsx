import React from 'react';
import { Box, type StackProps, HStack, Switch, Text } from '@chakra-ui/react';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import ToolParamConfig from './ToolParamConfig';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../context/workflowInitContext';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { Position } from 'reactflow';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';

const IOTitle = ({
  text,
  inputs,
  nodeId,
  catchError,
  ...props
}: {
  text?: 'Input' | 'Output' | string;
  inputs?: FlowNodeInputItemType[];
  nodeId?: string;
  catchError?: boolean;
} & StackProps) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const onEdgesChange = useContextSelector(WorkflowBufferDataContext, (v) => v.onEdgesChange);
  const edges = useContextSelector(WorkflowBufferDataContext, (v) => v.edges);

  const handleCatchErrorChange = (checked: boolean) => {
    if (!nodeId) return;

    onChangeNode({
      nodeId,
      type: 'attr',
      key: 'catchError',
      value: checked
    });

    // Delete edges
    onEdgesChange([
      {
        type: 'remove',
        id: edges.find(
          (edge) => edge.sourceHandle === getHandleId(nodeId, 'source_catch', Position.Right)
        )?.id!
      }
    ]);
  };

  return (
    <HStack
      minH={'30px'}
      px={2.5}
      py={1}
      fontSize={'12px'}
      alignItems={'center'}
      fontWeight={800}
      mx={0}
      mt={0}
      mb={1}
      border={'1px solid rgba(223, 229, 238, 0.72)'}
      borderRadius={'10px'}
      bg={'rgba(241, 245, 249, 0.78)'}
      {...props}
    >
      <Box w={'8px'} h={'8px'} borderRadius={'3px'} bg={'#2563EB'} />
      <Box color={'#27364A'}>{text}</Box>
      <Box flex={1} />

      {/* Error catch switch for output */}
      {catchError !== undefined && (
        <HStack spacing={2} className="nodrag">
          <Text fontSize={'12px'} color={'#64748B'} fontWeight={700}>
            {t('workflow:error_catch')}
          </Text>
          <Switch
            size={'sm'}
            isChecked={catchError}
            onChange={(e) => handleCatchErrorChange(e.target.checked)}
          />
        </HStack>
      )}

      <ToolParamConfig nodeId={nodeId} inputs={inputs} />
    </HStack>
  );
};

export default React.memo(IOTitle);
