import React, { useMemo } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import IOTitle from '../components/IOTitle';
import RenderToolInput from './render/RenderToolInput';
import RenderOutput from './render/RenderOutput';
import CodeEditor from '@fastgpt/web/components/common/Textarea/CodeEditor';
import { Box, Flex } from '@chakra-ui/react';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import {
  JS_TEMPLATE,
  PYTHON_TEMPLATE
} from '@fastgpt/global/core/workflow/template/system/sandbox/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';

const NodeCode = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs } = data;

  const splitToolInputs = useContextSelector(WorkflowContext, (ctx) => ctx.splitToolInputs);
  const onChangeNode = useContextSelector(WorkflowContext, (ctx) => ctx.onChangeNode);

  const { ConfirmModal, openConfirm } = useConfirm({
    content: t('workflow:code.Reset template confirm')
  });

  const CustomComponent = useMemo(() => {
    return {
      [NodeInputKeyEnum.codeType]: (item: FlowNodeInputItemType) => {
        return (
          <Flex mt={-3} alignItems={'flex-end'}>
            <Box flex={'1'}>
              <MySelect
                size={'xs'}
                w={'110px'}
                fontSize={'xs'}
                value={item.value}
                list={[
                  { label: 'Python3', value: 'python3' },
                  { label: 'Javascript', value: 'js' }
                ]}
                onchange={(e: string) => {
                  // 更新代码类型
                  onChangeNode({
                    nodeId,
                    type: 'updateInput',
                    key: item.key,
                    value: {
                      ...item,
                      value: e
                    }
                  });

                  // 获取代码输入项
                  const codeInput = inputs.find((input) => input.key === NodeInputKeyEnum.code);
                  if (!codeInput) return;

                  // 如果当前代码为空，应用新模板
                  if (codeInput) {
                    const template = e === 'js' ? JS_TEMPLATE : PYTHON_TEMPLATE;
                    onChangeNode({
                      nodeId,
                      type: 'updateInput',
                      key: NodeInputKeyEnum.code,
                      value: {
                        ...codeInput,
                        value: template
                      }
                    });
                  }
                }}
              />
            </Box>
            <Box
              cursor={'pointer'}
              color={'primary.500'}
              fontSize={'xs'}
              onClick={openConfirm(() => {
                // 获取当前语言和对应模板
                const currentLang = item.value || 'js';
                const template = currentLang === 'js' ? JS_TEMPLATE : PYTHON_TEMPLATE;

                const codeInput = inputs.find((input) => input.key === NodeInputKeyEnum.code);
                if (!codeInput) return;

                onChangeNode({
                  nodeId,
                  type: 'updateInput',
                  key: NodeInputKeyEnum.code,
                  value: {
                    ...codeInput,
                    value: template
                  }
                });
              })}
            >
              {t('workflow:code.Reset template')}
            </Box>
          </Flex>
        );
      },
      [NodeInputKeyEnum.code]: (item: FlowNodeInputItemType) => {
        // 获取当前编程语言类型
        const codeTypeInput = inputs.find((input) => input.key === NodeInputKeyEnum.codeType);
        const language = codeTypeInput?.value === 'python3' ? 'python' : 'typescript';

        return (
          <Box mt={-3}>
            <CodeEditor
              bg={'white'}
              borderRadius={'sm'}
              value={item.value}
              language={language}
              onChange={(e) => {
                onChangeNode({
                  nodeId,
                  type: 'updateInput',
                  key: item.key,
                  value: {
                    ...item,
                    value: e
                  }
                });
              }}
            />
          </Box>
        );
      }
    };
  }, [nodeId, onChangeNode, openConfirm, t, inputs]);

  const { isTool, commonInputs } = splitToolInputs(inputs, nodeId);

  return (
    <NodeCard minW={'400px'} selected={selected} {...data}>
      {isTool && (
        <>
          <Container>
            <RenderToolInput nodeId={nodeId} inputs={inputs} />
          </Container>
        </>
      )}
      <Container>
        <IOTitle text={t('common:common.Input')} mb={-1} />
        <RenderInput
          nodeId={nodeId}
          flowInputList={commonInputs}
          CustomComponent={CustomComponent}
        />
      </Container>
      <Container>
        <IOTitle text={t('common:common.Output')} />
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
      <ConfirmModal />
    </NodeCard>
  );
};
export default React.memo(NodeCode);
