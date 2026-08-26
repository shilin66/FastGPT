import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { type Node } from 'reactflow';
import NodeTemplateListHeader from './components/NodeTemplates/header';
import NodeTemplateList from './components/NodeTemplates/list';
import NodeTemplateTypeRail from './components/NodeTemplates/TypeRail';
import { useNodeTemplates } from './components/NodeTemplates/useNodeTemplates';
import { Box, Flex } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useMemoizedFn } from 'ahooks';
import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../context/workflowInitContext';

type ModuleTemplateListProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const sliderWidth = 304;

const NodeTemplatesModal = ({ isOpen, onClose }: ModuleTemplateListProps) => {
  const setNodes = useContextSelector(WorkflowBufferDataContext, (v) => v.setNodes);

  const {
    templateType,
    parentId,
    searchKey,
    setSearchKey,
    templatesIsLoading,
    templates,
    onUpdateTemplateType,
    onUpdateParentId,
    selectedTagIds,
    setSelectedTagIds,
    toolTags
  } = useNodeTemplates();

  const onAddNode = useMemoizedFn(async ({ newNodes }: { newNodes: Node<FlowNodeItemType>[] }) => {
    setNodes((state) => {
      const unselectedNodes: Node<FlowNodeItemType>[] = state.map((node) => ({
        ...node,
        selected: false
      }));
      return unselectedNodes.concat(newNodes);
    });
  });

  return (
    <>
      <Box
        zIndex={2}
        display={isOpen ? 'block' : 'none'}
        position={'absolute'}
        top={0}
        left={0}
        bottom={0}
        w={`${sliderWidth}px`}
        maxW={'100%'}
        onClick={onClose}
        fontSize={'sm'}
      />
      <MyBox
        isLoading={templatesIsLoading}
        display={'flex'}
        zIndex={3}
        flexDirection={'row'}
        position={'absolute'}
        top={'64px'}
        left={0}
        h={isOpen ? 'calc(100% - 64px)' : '0'}
        w={isOpen ? ['100%', `${sliderWidth}px`] : '0'}
        bg={'white'}
        borderRight={'1px solid #DFE5EE'}
        boxShadow={'8px 0 24px rgba(15, 23, 42, 0.06)'}
        borderRadius={0}
        transition={'.2s ease'}
        userSelect={'none'}
        overflow={'hidden'}
      >
        <NodeTemplateTypeRail
          templateType={templateType}
          onUpdateTemplateType={onUpdateTemplateType}
          onClose={onClose}
        />
        <Flex minW={0} flex={1} flexDirection={'column'} py={3}>
          <NodeTemplateListHeader
            templateType={templateType}
            onUpdateTemplateType={onUpdateTemplateType}
            parentId={parentId}
            searchKey={searchKey}
            setSearchKey={setSearchKey}
            onUpdateParentId={onUpdateParentId}
            selectedTagIds={selectedTagIds}
            setSelectedTagIds={setSelectedTagIds}
            toolTags={toolTags}
          />
          <NodeTemplateList
            onAddNode={onAddNode}
            templates={templates}
            templateType={templateType}
            onUpdateParentId={onUpdateParentId}
          />
        </Flex>
      </MyBox>
    </>
  );
};

export default React.memo(NodeTemplatesModal);
