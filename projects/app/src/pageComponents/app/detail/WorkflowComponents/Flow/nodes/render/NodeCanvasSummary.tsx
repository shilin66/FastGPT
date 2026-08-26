import React, { useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { Position } from 'reactflow';
import { useTranslation } from 'next-i18next';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { MySourceHandle } from './Handle';
import {
  getCanvasBranches,
  getCanvasNodeSummary,
  type CanvasBranch
} from './nodeCanvasSummaryModel';
import { nodeCanvasGeometry } from './nodeCanvasGeometry';

const colors = {
  blue: '#2563EB',
  graphite: '#27364A',
  text: '#1F2937',
  muted: '#667085',
  border: '#DFE5EE',
  danger: '#DC2626'
} as const;

const BranchLane = ({
  nodeId,
  branch
}: {
  readonly nodeId: string;
  readonly branch: CanvasBranch;
}) => (
  <Flex
    minH={'34px'}
    alignItems={'center'}
    position={'relative'}
    borderTop={'1px solid'}
    borderColor={colors.border}
    color={colors.text}
    fontSize={'12px'}
    fontWeight={800}
  >
    <Box minW={0} pr={5} noOfLines={1}>
      {branch.label}
    </Box>
    <MySourceHandle
      nodeId={nodeId}
      handleId={getHandleId(nodeId, 'source', branch.id)}
      position={Position.Right}
      translate={nodeCanvasGeometry.summarySourceHandleTranslate}
    />
  </Flex>
);

const CatchErrorLane = ({ nodeId }: { readonly nodeId: string }) => {
  const { t } = useTranslation();

  return (
    <Flex
      mt={2.5}
      pt={2.5}
      minH={'34px'}
      alignItems={'center'}
      position={'relative'}
      borderTop={'1px solid'}
      borderColor={colors.border}
      color={colors.danger}
      fontSize={'12px'}
      fontWeight={800}
    >
      <Box minW={0} pr={5} noOfLines={1}>
        {t('workflow:node_canvas.error_route')}
      </Box>
      <MySourceHandle
        nodeId={nodeId}
        handleId={getHandleId(nodeId, 'source_catch', Position.Right)}
        position={Position.Right}
        translate={nodeCanvasGeometry.summarySourceHandleTranslate}
      />
    </Flex>
  );
};

const NodeCanvasSummary = ({ node }: { readonly node: FlowNodeItemType }) => {
  const { t } = useTranslation();
  const translate = useMemo(() => (key: string) => t(key as any), [t]);
  const branches = useMemo(() => getCanvasBranches(node, translate), [node, translate]);
  const summary = useMemo(() => getCanvasNodeSummary(node, translate), [node, translate]);

  return (
    <Box px={3} py={3}>
      {branches.length > 0 ? (
        <Box>
          <Flex pb={2} alignItems={'center'} justifyContent={'space-between'}>
            <Box color={colors.muted} fontSize={'11px'} fontWeight={800}>
              {t('workflow:node_canvas.branch_routes')}
            </Box>
            <Box color={colors.blue} fontSize={'11px'} fontWeight={900}>
              {branches.length}
            </Box>
          </Flex>
          {branches.map((branch) => (
            <BranchLane key={branch.id} nodeId={node.nodeId} branch={branch} />
          ))}
          {node.catchError && <CatchErrorLane nodeId={node.nodeId} />}
        </Box>
      ) : (
        <>
          <Flex alignItems={'stretch'} gap={2.5}>
            <Box w={'3px'} borderRadius={'3px'} bg={node.isError ? colors.danger : colors.blue} />
            <Box minW={0} flex={1}>
              <Box color={colors.muted} fontSize={'10px'} fontWeight={800}>
                {t('workflow:node_canvas.execution_signature')}
              </Box>
              <Box
                mt={1}
                color={colors.graphite}
                fontSize={'13px'}
                fontWeight={900}
                lineHeight={1.45}
                noOfLines={2}
                overflowWrap={'anywhere'}
              >
                {summary.signature}
              </Box>
            </Box>
          </Flex>
          {summary.facts.length > 0 && (
            <Flex mt={3} pt={2.5} borderTop={'1px solid'} borderColor={colors.border}>
              {summary.facts.map((fact, index) => (
                <Box
                  key={`${fact.label}-${index}`}
                  minW={0}
                  flex={1}
                  pl={index === 0 ? 0 : 3}
                  borderLeft={index === 0 ? '0' : '1px solid'}
                  borderColor={colors.border}
                >
                  <Box color={colors.muted} fontSize={'10px'} fontWeight={800}>
                    {fact.label}
                  </Box>
                  <Box mt={1} color={colors.text} fontSize={'12px'} fontWeight={900} noOfLines={1}>
                    {fact.value}
                  </Box>
                </Box>
              ))}
            </Flex>
          )}
          {node.catchError && <CatchErrorLane nodeId={node.nodeId} />}
        </>
      )}
    </Box>
  );
};

export default React.memo(NodeCanvasSummary);
