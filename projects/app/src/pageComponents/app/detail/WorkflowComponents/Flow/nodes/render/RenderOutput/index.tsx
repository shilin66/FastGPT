import React, { useMemo } from 'react';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { Box } from '@chakra-ui/react';
import OutputLabel from './Label';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import DynamicOutputs from './DynamicOutputs';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';

const RenderOutput = ({
  nodeId,
  flowOutputList
}: {
  nodeId: string;
  flowOutputList: FlowNodeOutputItemType[];
}) => {
  const dynamicOutputs = useMemoEnhance(
    () => flowOutputList.filter((item) => item.type === FlowNodeOutputTypeEnum.dynamic),
    [flowOutputList]
  );
  const addOutput = useMemo(
    () => dynamicOutputs.find((item) => item.key === NodeOutputKeyEnum.addOutputParam),
    [dynamicOutputs]
  );
  const filterAddOutput = useMemo(
    () => dynamicOutputs.filter((item) => item.key !== NodeOutputKeyEnum.addOutputParam),
    [dynamicOutputs]
  );
  const visibleOutputs = useMemoEnhance(
    () =>
      flowOutputList.filter((output) => {
        if (
          output.type === FlowNodeOutputTypeEnum.dynamic ||
          output.type === FlowNodeOutputTypeEnum.hidden
        ) {
          return false;
        }
        return !!output.label && output.invalid !== true;
      }),
    [flowOutputList]
  );

  if (!addOutput && visibleOutputs.length === 0) {
    return null;
  }

  return (
    <Box>
      {addOutput && (
        <DynamicOutputs nodeId={nodeId} outputs={filterAddOutput} addOutput={addOutput} />
      )}
      {visibleOutputs.map((output) => (
        <FormLabel
          key={output.key}
          required={output.required}
          position={'relative'}
          px={2.5}
          py={2}
          bg={'transparent'}
          border={'0'}
          borderRadius={0}
          boxShadow={'none'}
          _notLast={{
            mb: 0,
            borderBottom: '1px solid rgba(223, 229, 238, 0.72)'
          }}
          transition={'border-color 0.16s ease, background 0.16s ease'}
          _hover={{
            bg: 'rgba(37, 99, 235, 0.035)'
          }}
        >
          <OutputLabel nodeId={nodeId} output={output} />
        </FormLabel>
      ))}
    </Box>
  );
};

export default React.memo(RenderOutput);
