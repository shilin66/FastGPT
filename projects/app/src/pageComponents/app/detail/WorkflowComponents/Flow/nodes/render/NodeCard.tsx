import React, { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Button, Flex, useDisclosure, type FlexProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { FlowNodeItemType, StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { NodeGradients } from '@fastgpt/global/core/workflow/node/constant';
import {
  AppNodeFlowNodeTypeMap,
  FlowNodeTypeEnum,
  isNestedParentNodeType
} from '@fastgpt/global/core/workflow/node/constant';
import {
  getGradientByColorSchema,
  getBorderColorByColorSchema,
  getColorSchemaByFlowNodeType
} from '@fastgpt/web/core/workflow/utils';
import { useReactFlow } from 'reactflow';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { ToolSourceHandle, ToolTargetHandle } from './Handle/ToolHandle';
import { ConnectionSourceHandle, ConnectionTargetHandle } from './Handle/ConnectionHandle';
import { useDebug } from '../../hooks/useDebug';
import { getToolPreviewNode, getToolVersionList } from '@/web/core/app/api/tool';
import { storeNode2FlowNode } from '@/web/core/workflow/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useContextSelector } from 'use-context-selector';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useWorkflowUtils } from '../../hooks/useUtils';
import { WorkflowBufferDataContext } from '../../../context/workflowInitContext';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import UseGuideModal from '@/components/common/Modal/UseGuideModal';
import NodeDebugResponse from './RenderDebug/NodeDebugResponse';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useBoolean, useCreation } from 'ahooks';
import { formatToolError } from '@fastgpt/global/core/app/utils';
import HighlightText from '@fastgpt/web/components/common/String/HighlightText';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import SecretInputModal from '@/pageComponents/app/tool/SecretInputModal';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import { WorkflowUIContext } from '../../../context/workflowUIContext';
import {
  PluginStatusEnum,
  PluginStatusMap,
  type PluginStatusType
} from '@fastgpt/global/core/plugin/type';
import { splitCombineToolId, getToolRawId } from '@fastgpt/global/core/app/tool/utils';
import { getAppPermission } from '@/web/core/app/api';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import NodeCanvasSummary from './NodeCanvasSummary';
import { useNodeConfiguration } from '../../context/NodeConfigurationContext';

type Props = FlowNodeItemType & {
  children?: React.ReactNode | React.ReactNode[] | string;
  minW?: string | number;
  maxW?: string | number;
  minH?: string | number;
  w?: string | number;
  h?: string | number;
  selected?: boolean;
  searchedText?: string;
  menuForbid?: {
    copilot?: boolean;
    debug?: boolean;
    copy?: boolean;
    delete?: boolean;
    fold?: boolean;
  };
  customStyle?: FlexProps;
  rtDoms?: React.ReactNode[];
  colorSchema?: keyof typeof NodeGradients;
};

const NodeCard = (props: Props) => {
  const { t } = useTranslation();
  const {
    children,
    avatar = LOGO_ICON,
    avatarLinear,
    name = t('common:core.module.template.UnKnow Module'),
    intro,
    minW = '300px',
    maxW = '666px',
    minH = 0,
    w = 'full',
    h = 'full',
    nodeId,
    selected,
    searchedText,
    menuForbid,
    isTool = false,
    isError = false,
    debugResult,
    isFolded,
    customStyle,
    inputs,
    rtDoms,
    pluginId,
    colorSchema
  } = props;

  const { hasToolNode, getNodeById, foldedNodesMap } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );
  const onUpdateNodeError = useContextSelector(WorkflowActionsContext, (v) => v.onUpdateNodeError);
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const setHoverNodeId = useContextSelector(WorkflowUIContext, (v) => v.setHoverNodeId);
  const presentationMode = useContextSelector(WorkflowUIContext, (v) => v.presentationMode);
  const setPresentationMode = useContextSelector(WorkflowUIContext, (v) => v.setPresentationMode);
  const { activeNodeId, host } = useNodeConfiguration();
  const { fitView } = useReactFlow();
  const isStructuralNode =
    isNestedParentNodeType(props.flowNodeType) || props.flowNodeType === FlowNodeTypeEnum.comment;

  const inputConfig = useMemo(
    () => inputs?.find((item) => item.key === NodeInputKeyEnum.systemInputConfig),
    [inputs]
  );

  const handleDoubleClick = useCallback(() => {
    onChangeNode({
      nodeId,
      type: 'attr',
      key: 'isFolded',
      value: false
    });
    setPresentationMode(false);

    // Fit view to show this node in center
    setTimeout(() => {
      fitView({
        nodes: [{ id: nodeId }],
        padding: 0.3
      });
    }, 100);
  }, [onChangeNode, setPresentationMode, fitView, nodeId]);

  const showToolHandle = isTool && hasToolNode;

  const gradient = useMemo(() => {
    const { source } = splitCombineToolId(pluginId ?? '');
    return getGradientByColorSchema({ colorSchema, source });
  }, [colorSchema, pluginId]);

  const foldedOverlay = useMemo(() => {
    if (!isFolded) return null;

    return (
      <Flex
        alignItems={'center'}
        w={'full'}
        h={'full'}
        px={3}
        zIndex={1}
        onDoubleClick={handleDoubleClick}
        cursor={'pointer'}
        bg={'white'}
        borderRadius={'9px'}
      >
        <Avatar
          src={avatarLinear || avatar}
          fill={'none'}
          borderRadius={'8px'}
          w={'34px'}
          h={'34px'}
        />
        <Box
          ml={2.5}
          minW={0}
          color={'#1F2937'}
          fontSize={'13px'}
          fontWeight={900}
          overflow={'hidden'}
          textOverflow={'ellipsis'}
          whiteSpace={'nowrap'}
        >
          {t(name as any)}
        </Box>
      </Flex>
    );
  }, [isFolded, avatar, avatarLinear, name, handleDoubleClick, t]);

  const { outlineColor, outlineWidth } = useMemo(() => {
    // error mode
    if (isError) return { outlineColor: '#EF4444', outlineWidth: '2px solid' };
    // common mode
    if (!presentationMode && !isFolded) {
      if (!selected) return { outlineColor: undefined, outlineWidth: undefined };
      const outlineColor = '#2563EB';
      const outlineWidth = '2px solid';
      return { outlineColor, outlineWidth };
    }
    // presentation & fold mode
    const { source } = splitCombineToolId(pluginId ?? '');
    const outlineColor = getBorderColorByColorSchema({ colorSchema, source });
    if (!outlineColor) return { outlineColor: undefined, outlineWidth: undefined };
    return {
      outlineColor,
      outlineWidth: '2px solid'
    };
  }, [presentationMode, isFolded, colorSchema, selected, isError, pluginId]);

  // Current node and parent node
  const { node, hidden } = useMemo(() => {
    const node = getNodeById(nodeId);
    const hidden = node?.parentNodeId ? foldedNodesMap[node.parentNodeId] : false;

    return { node, hidden };
  }, [foldedNodesMap, getNodeById, nodeId]);

  const isAppNode = node && AppNodeFlowNodeTypeMap[node?.flowNodeType];
  const isLoopNode = isNestedParentNodeType(node?.flowNodeType ?? '');
  const showVersion = useMemo(() => {
    // 1. MCP tool, HTTP tool set and system tool set do not have version
    if (
      isAppNode &&
      (node.toolConfig?.mcpToolSet ||
        node.toolConfig?.mcpTool ||
        node?.toolConfig?.httpToolSet ||
        node?.toolConfig?.systemToolSet)
    )
      return false;
    // 2. Team app/System commercial plugin
    if (isAppNode && node?.pluginId && !node?.pluginData?.error) return true;
    // 3. System tool
    if (isAppNode && node?.toolConfig?.systemTool) return true;

    return false;
  }, [isAppNode, node]);

  const { data: nodeTemplate } = useRequest(
    async () => {
      if (node?.pluginData?.error) {
        return undefined;
      }

      if (isAppNode) {
        return { ...node, ...node.pluginData };
      } else {
        const template = moduleTemplatesFlat.find(
          (item) => item.flowNodeType === node?.flowNodeType
        );
        return template;
      }
    },
    {
      onSuccess(res) {
        if (!res) return;
        // Execute forcibly updates the courseUrl field
        onChangeNode({
          nodeId,
          type: 'attr',
          key: 'courseUrl',
          value: res?.courseUrl
        });
      },
      manual: false
    }
  );

  /* Node header - 重构后的版本,依赖项大幅减少 */
  const error = useMemo(() => formatToolError(node?.pluginData?.error), [node?.pluginData?.error]);
  const showHeader = props.flowNodeType !== FlowNodeTypeEnum.comment;

  const RenderToolHandle = useMemo(
    () =>
      node?.flowNodeType === FlowNodeTypeEnum.toolCall ? (
        <ToolSourceHandle nodeId={nodeId} />
      ) : null,
    [node?.flowNodeType, nodeId]
  );

  const configurationContent =
    inputConfig && !inputConfig?.value ? (
      <NodeSecret
        nodeId={nodeId}
        isFolder={node?.isFolder}
        courseUrl={node?.courseUrl}
        hasSystemSecret={node?.hasSystemSecret}
        pluginId={node?.pluginId}
        systemKeyCost={node?.systemKeyCost}
        inputConfig={inputConfig}
      />
    ) : (
      children
    );

  const configurationPortal =
    !isStructuralNode && host && activeNodeId === nodeId
      ? createPortal(
          <Flex
            w={'full'}
            minW={0}
            flexDirection={'column'}
            gap={3}
            sx={{
              '& .react-flow__handle': {
                display: 'none !important'
              },
              '& > *': {
                width: '100% !important',
                maxWidth: 'none !important',
                minWidth: '0 !important',
                marginLeft: '0 !important',
                marginRight: '0 !important'
              }
            }}
          >
            {configurationContent}
          </Flex>,
          host
        )
      : null;

  return (
    <Flex
      outline={selected && (presentationMode || isFolded) ? '10px solid' : undefined}
      outlineColor={'rgba(37, 99, 235, 0.08)'}
      borderRadius={'8px'}
      boxShadow={
        selected ? '0 16px 38px rgba(37, 99, 235, 0.16)' : '0 10px 28px rgba(15, 23, 42, 0.08)'
      }
      {...customStyle}
    >
      <Flex
        hidden={hidden}
        flexDirection={'column'}
        {...(isFolded
          ? {
              w: '196px',
              h: '58px'
            }
          : isStructuralNode
            ? {
                minW,
                maxW,
                minH,
                w,
                h
              }
            : {
                minW: '304px',
                maxW: '304px',
                w: '304px',
                minH: 0,
                h: 'auto'
              })}
        outline={outlineWidth}
        outlineColor={outlineColor}
        borderRadius={'8px'}
        bg={'#FFFFFF'}
        border={'1px solid'}
        borderColor={isError ? '#FCA5A5' : selected ? '#93B4FF' : '#D7DEE8'}
        overflow={'visible'}
        transition={'box-shadow 0.18s ease, outline-color 0.18s ease, transform 0.18s ease'}
        _hover={{
          boxShadow: selected
            ? '0 16px 38px rgba(37, 99, 235, 0.18)'
            : '0 14px 34px rgba(15, 23, 42, 0.11)',
          '& .controller-menu': {
            display: 'flex'
          },
          '& .controller-debug': {
            display: 'block'
          },
          '& .node-hover-controller': {
            visibility: 'visible'
          }
        }}
        onMouseEnter={() => setHoverNodeId(nodeId)}
        onMouseLeave={() => setHoverNodeId(undefined)}
        {...(isError ? { onMouseDownCapture: () => onUpdateNodeError(nodeId, false) } : {})}
      >
        {debugResult && <NodeDebugResponse nodeId={nodeId} debugResult={debugResult} />}

        {isFolded ? (
          foldedOverlay
        ) : (
          <Box bg={'#FFFFFF'} borderRadius={'7px'} overflow={'visible'} position={'relative'}>
            {/* Header */}
            <Box position={'relative'} borderTopRadius={'7px'} overflow={'hidden'}>
              {gradient && (
                <Box
                  position={'absolute'}
                  top={0}
                  left={0}
                  right={0}
                  height={'100%'}
                  background={gradient}
                  opacity={isStructuralNode ? 0.08 : 0.045}
                  zIndex={0}
                  pointerEvents={'none'}
                />
              )}
              {showHeader && (
                <Box
                  px={3}
                  py={2.5}
                  position={'relative'}
                  zIndex={1}
                  bg={'white'}
                  borderBottom={'1px solid #E8EDF3'}
                >
                  <Flex alignItems={'center'} mb={1.5} minW={0}>
                    <NodeTitleSection
                      avatar={avatarLinear || avatar}
                      name={name}
                      searchedText={searchedText}
                      appId={pluginId}
                    />

                    <Box mr={1} />

                    {showVersion && <NodeVersion node={node!} />}

                    <NodeActionButtons
                      nodeTemplate={nodeTemplate}
                      courseUrl={node?.courseUrl}
                      rtDoms={rtDoms}
                    />

                    <NodeStatusBadge status={nodeTemplate?.status} error={error} />
                  </Flex>

                  <NodeIntro intro={intro} />
                </Box>
              )}
            </Box>

            <Flex
              flexDirection={'column'}
              flex={1}
              py={isStructuralNode && showHeader ? 2.5 : 0}
              gap={isStructuralNode ? 2 : 0}
              position={'relative'}
              bg={'white'}
              borderTopRadius={showHeader ? 0 : '7px'}
              borderBottomRadius={'7px'}
            >
              {isStructuralNode ? configurationContent : <NodeCanvasSummary node={props} />}
            </Flex>
          </Box>
        )}

        {/* Menu - Always render outside the fold/unfold condition */}
        <MenuRender nodeId={nodeId} menuForbid={menuForbid} />

        {/* Handle - Always render handles outside the fold/unfold condition */}
        <ToolTargetHandle show={showToolHandle} nodeId={nodeId} />
        <ConnectionSourceHandle nodeId={nodeId} />
        <ConnectionTargetHandle nodeId={nodeId} />
        {RenderToolHandle}

        {/* Presentation Mode Overlay */}
        {presentationMode && !isFolded && showHeader && (
          <PresentationModeOverlay
            avatar={avatarLinear || avatar}
            name={name}
            intro={intro}
            isLoopNode={isLoopNode}
            onDoubleClick={handleDoubleClick}
          />
        )}
      </Flex>
      {configurationPortal}
    </Flex>
  );
};

export default React.memo(NodeCard);

// 节点标题区域组件
const NodeTitleSection = React.memo<{
  avatar: string;
  name: string;
  searchedText?: string;
  appId?: string;
}>(({ avatar, name, searchedText, appId }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const childAppId = useMemo(() => {
    if (!appId) return;
    const rawId = getToolRawId(appId);
    const result = ObjectIdSchema.safeParse(rawId);
    if (result.success) {
      return rawId;
    }
    return undefined;
  }, [appId]);

  const { runAsync: onGetPermission } = useRequest(getAppPermission, {
    onSuccess(permission) {
      if (permission.hasWritePer) {
        window.open(`/app/detail?appId=${childAppId}`, '_blank');
      } else {
        toast({
          title: t('workflow:no_edit_permission'),
          status: 'warning'
        });
      }
    }
  });

  return (
    <Flex alignItems={'center'} minW={0} flex={1}>
      <Avatar src={avatar} borderRadius={'8px'} objectFit={'contain'} w={'32px'} h={'32px'} />
      <Box
        ml={2}
        fontSize={'14px'}
        fontWeight={800}
        color={'#1F2937'}
        minW={0}
        overflow={'hidden'}
        textOverflow={'ellipsis'}
        whiteSpace={'nowrap'}
      >
        <HighlightText
          rawText={t(name as any)}
          matchText={searchedText ?? ''}
          mode={'bg'}
          color={'#2563EB'}
        />
      </Box>
      {childAppId && (
        <Box ml={1} visibility={'hidden'} color={'#667085'}>
          <MyIconButton
            className="node-hover-controller"
            icon="common/link"
            tip={t('workflow:to_app_detail')}
            hoverBg={'rgba(37, 99, 235, 0.08)'}
            hoverColor={'#2563EB'}
            onClick={() => onGetPermission(childAppId)}
          />
        </Box>
      )}
    </Flex>
  );
});
NodeTitleSection.displayName = 'NodeTitleSection';

// 节点介绍组件
const NodeIntro = React.memo(function NodeIntro({ intro = '' }: { intro?: string }) {
  const { t } = useTranslation();

  return (
    <Box fontSize={'12px'} color={'#667085'} fontWeight={600} whiteSpace={'pre-line'} noOfLines={2}>
      {t(intro as any) || t('app:node_not_intro')}
    </Box>
  );
});

const NodeVersion = React.memo(function NodeVersion({ node }: { node: FlowNodeItemType }) {
  const { t } = useTranslation();

  const onResetNode = useContextSelector(WorkflowActionsContext, (v) => v.onResetNode);

  const { isOpen, onOpen, onClose } = useDisclosure();

  // Load version list
  const { ScrollData, data: versionList } = useScrollPagination(getToolVersionList, {
    pageSize: 20,
    params: {
      pluginId: node.pluginId
    },
    refreshDeps: [node.pluginId, isOpen],
    disabled: !isOpen,
    manual: false
  });

  const { runAsync: onUpdateVersion, loading: isUpdating } = useRequest(
    async (versionId: string) => {
      if (!node) return;

      if (node.pluginId) {
        const template = await getToolPreviewNode({ appId: node.pluginId, versionId });

        if (!!template) {
          onResetNode({
            id: node.nodeId,
            node: {
              ...template,
              colorSchema:
                template.colorSchema ?? getColorSchemaByFlowNodeType(template.flowNodeType),
              name: node.name,
              intro: node.intro,
              avatar: node.avatar
            }
          });
        }
      }
    },
    {
      refreshDeps: [node, onResetNode]
    }
  );

  const renderVersionList = useCreation(
    () => [
      {
        label: t('app:keep_the_latest'),
        value: ''
      },
      ...versionList.map((item) => ({
        label: item.versionName,
        value: item._id
      }))
    ],
    [node.isLatestVersion, node.version, t, versionList]
  );
  const valueLabel = useMemo(() => {
    return (
      <Flex alignItems={'center'} gap={0.5}>
        {node?.version === '' ? t('app:keep_the_latest') : node?.versionLabel}
        {!node.isLatestVersion && (
          <MyTag type="fill" colorSchema={'adora'} fontSize={'mini'} borderRadius={'lg'}>
            {t('app:not_the_newest')}
          </MyTag>
        )}
      </Flex>
    );
  }, [node.isLatestVersion, node?.version, node?.versionLabel, t]);

  const ScrollDataWrapper = useCallback(
    (props: { children: React.ReactNode }) => (
      <ScrollData minH={'100px'} maxH={'40vh'}>
        {props.children}
      </ScrollData>
    ),
    [ScrollData]
  );

  return (
    <MySelect
      className="nowheel"
      value={node.version}
      onChange={onUpdateVersion}
      isLoading={isUpdating}
      customOnOpen={onOpen}
      customOnClose={onClose}
      placeholder={node?.versionLabel}
      variant={'whitePrimaryOutline'}
      size={'sm'}
      list={renderVersionList}
      ScrollData={ScrollDataWrapper}
      valueLabel={valueLabel}
    />
  );
});

const MenuRender = React.memo(function MenuRender({
  nodeId,
  menuForbid
}: {
  nodeId: string;
  menuForbid?: Props['menuForbid'];
}) {
  const { t } = useTranslation();
  const { openDebugNode, DebugInputModal } = useDebug();
  const { setNodes, setEdges, getNodeList, getNodeById } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const { computedNewNodeName } = useWorkflowUtils();

  // Get current node to check if folded
  const currentNode = getNodeById(nodeId);
  const isFolded = currentNode?.isFolded;

  const onCopyNode = useCallback(
    (nodeId: string) => {
      setNodes((state) => {
        const node = state.find((node) => node.id === nodeId);
        if (!node) return state;
        const template: Omit<StoreNodeItemType, 'nodeId'> = {
          flowNodeType: node.data.flowNodeType,
          parentNodeId: node.data.parentNodeId,
          avatar: node.data.avatar,
          avatarLinear: node.data.avatarLinear,
          colorSchema: node.data.colorSchema,
          name: computedNewNodeName({
            templateName: node.data.name,
            flowNodeType: node.data.flowNodeType,
            pluginId: node.data.pluginId
          }),
          intro: node.data.intro,
          toolDescription: node.data.toolDescription,
          showStatus: node.data.showStatus,

          version: node.data.version,
          versionLabel: node.data.versionLabel,
          isLatestVersion: node.data.isLatestVersion,

          catchError: node.data.catchError,
          inputs: node.data.inputs,
          outputs: node.data.outputs,

          pluginId: node.data.pluginId,
          isFolder: node.data.isFolder,
          pluginData: node.data.pluginData,

          toolConfig: node.data.toolConfig,

          currentCost: node.data.currentCost,
          systemKeyCost: node.data.systemKeyCost,
          hasTokenFee: node.data.hasTokenFee,
          hasSystemSecret: node.data.hasSystemSecret
        };

        return [
          ...state.map((item) => ({
            ...item,
            selected: false
          })),
          storeNode2FlowNode({
            item: {
              flowNodeType: template.flowNodeType,
              avatar: template.avatar,
              avatarLinear: template.avatarLinear,
              colorSchema: template.colorSchema,
              name: template.name,
              intro: template.intro,
              nodeId: getNanoid(),
              position: { x: node.position.x + 200, y: node.position.y + 50 },
              showStatus: template.showStatus,
              pluginId: template.pluginId,
              inputs: template.inputs,
              outputs: template.outputs,
              version: template.version,
              versionLabel: template.versionLabel,
              isLatestVersion: template.isLatestVersion,
              toolConfig: template.toolConfig,
              catchError: template.catchError
            },
            selected: true,
            parentNodeId: template.parentNodeId,
            t
          })
        ];
      });
    },
    [computedNewNodeName, setNodes, t]
  );
  const onDelNode = useCallback(
    (nodeId: string) => {
      // Remove node and its child nodes
      setNodes((state) =>
        state.filter((item) => item.data.nodeId !== nodeId && item.data.parentNodeId !== nodeId)
      );

      // Remove edges connected to the node and its child nodes
      const childNodeIds = getNodeList()
        .filter((node) => node.parentNodeId === nodeId)
        .map((node) => node.nodeId);
      setEdges((state) =>
        state.filter(
          (edge) =>
            edge.source !== nodeId &&
            edge.target !== nodeId &&
            !childNodeIds.includes(edge.target) &&
            !childNodeIds.includes(edge.source)
        )
      );
    },
    [getNodeList, setEdges, setNodes]
  );

  const Render = useMemo(() => {
    const menuList = [
      ...(menuForbid?.fold
        ? []
        : [
            {
              icon: isFolded ? 'core/chat/chevronRight' : 'core/chat/chevronDown',
              label: isFolded ? t('workflow:Unfold') : t('workflow:Fold'),
              variant: 'whiteBase',
              onClick: () => {
                onChangeNode({
                  nodeId,
                  type: 'attr',
                  key: 'isFolded',
                  value: !isFolded
                });
              }
            }
          ]),
      ...(menuForbid?.debug
        ? []
        : [
            {
              icon: 'core/workflow/debug',
              label: t('common:core.workflow.Debug'),
              variant: 'whiteBase',
              onClick: () => openDebugNode({ entryNodeId: nodeId })
            }
          ]),
      ...(menuForbid?.copy
        ? []
        : [
            {
              icon: 'copy',
              label: t('common:Copy'),
              variant: 'whiteBase',
              onClick: () => onCopyNode(nodeId)
            }
          ]),
      ...(menuForbid?.delete
        ? []
        : [
            {
              icon: 'delete',
              label: t('common:Delete'),
              variant: 'whiteDanger',
              onClick: () => onDelNode(nodeId)
            }
          ])
    ];

    return (
      <>
        <Box
          className="nodrag controller-menu"
          display={'none'}
          flexDirection={'column'}
          gap={1.5}
          position={'absolute'}
          top={'-20px'}
          left={'100%'}
          pl={'20px'}
          pr={'12px'}
          pb={'12px'}
          pt={'12px'}
          bg={'rgba(255, 255, 255, 0.96)'}
          border={'1px solid rgba(148, 163, 184, 0.22)'}
          borderRadius={'14px'}
          boxShadow={'0 24px 52px rgba(15, 23, 42, 0.14)'}
          backdropFilter={'blur(12px)'}
        >
          {menuList.map((item) => (
            <Button
              key={item.icon}
              h={9}
              fontSize={'12px'}
              fontWeight={800}
              pl={2}
              pr={4}
              borderRadius={'10px'}
              variant={item.variant}
              leftIcon={<MyIcon name={item.icon as any} w={'16px'} mr={-1} />}
              onClick={item.onClick}
            >
              {t(item.label as any)}
            </Button>
          ))}
        </Box>
        <DebugInputModal />
      </>
    );
  }, [
    menuForbid?.debug,
    menuForbid?.copy,
    menuForbid?.delete,
    menuForbid?.fold,
    t,
    DebugInputModal,
    openDebugNode,
    nodeId,
    onCopyNode,
    onDelNode,
    isFolded,
    onChangeNode
  ]);

  return Render;
});

// 节点操作按钮组组件
const NodeActionButtons = React.memo<{
  nodeTemplate?: {
    diagram?: string;
    userGuide?: string;
    name?: string;
    avatar?: string;
    courseUrl?: string;
  };
  courseUrl?: string;
  rtDoms?: React.ReactNode[];
}>(({ nodeTemplate, courseUrl, rtDoms }) => {
  const { t } = useTranslation();

  const buttons = useMemo(() => {
    const result: React.ReactNode[] = [];

    if (nodeTemplate?.diagram) {
      result.push(
        <MyTooltip
          key="diagram"
          label={
            <MyImage src={nodeTemplate.diagram} w={'100%'} minH={['auto', '200px']} alt={''} />
          }
        >
          <Button variant={'grayGhost'} size={'xs'} color={'primary.600'} px={1}>
            {t('common:core.module.Diagram')}
          </Button>
        </MyTooltip>
      );
    }

    if (courseUrl || nodeTemplate?.userGuide) {
      result.push(
        <UseGuideModal
          key="userGuide"
          title={nodeTemplate?.name}
          iconSrc={nodeTemplate?.avatar}
          text={nodeTemplate?.userGuide}
          link={nodeTemplate?.courseUrl || courseUrl}
        >
          {({ onClick }) => (
            <MyTooltip label={t('workflow:Node.Open_Node_Course')}>
              <MyIconButton ml={1} icon="book" color={'primary.600'} onClick={onClick} />
            </MyTooltip>
          )}
        </UseGuideModal>
      );
    }

    if (rtDoms) {
      result.push(...rtDoms);
    }

    return result;
  }, [nodeTemplate, courseUrl, rtDoms, t]);

  if (buttons.length === 0) {
    return null;
  }

  return (
    <>
      {buttons.map((button, index) => (
        <React.Fragment key={index}>
          {index > 0 && <Box bg={'myGray.300'} w={'1px'} h={'12px'} mx={1} />}
          {button}
        </React.Fragment>
      ))}
    </>
  );
});
NodeActionButtons.displayName = 'NodeActionButtons';

// 节点错误徽章组件
const NodeStatusBadge = React.memo<{ status?: PluginStatusType; error?: string | null }>(
  ({ status, error }) => {
    const { t } = useTranslation();

    if (error) {
      return (
        <Flex
          bg={'red.50'}
          alignItems={'center'}
          h={8}
          px={2}
          rounded={'6px'}
          fontSize={'xs'}
          fontWeight={'medium'}
        >
          <MyIcon name={'common/errorFill'} w={'14px'} mr={1} />
          <Box color={'red.600'}>{t(error as any)}</Box>
        </Flex>
      );
    }
    if (status !== undefined && status !== PluginStatusEnum.Normal) {
      return (
        <MyTooltip
          label={
            status === PluginStatusEnum.Offline
              ? t('app:tool_offset_tips')
              : t('app:tool_soon_offset_tips')
          }
        >
          <MyTag
            mr={2}
            colorSchema={status === PluginStatusEnum.Offline ? 'red' : 'yellow'}
            type="borderFill"
          >
            {t(PluginStatusMap[status].label)}
          </MyTag>
        </MyTooltip>
      );
    }
    return null;
  }
);
NodeStatusBadge.displayName = 'NodeStatusBadge';

// 节点 Secret 组件
const NodeSecret = React.memo(function NodeSecret({
  nodeId,
  isFolder,
  courseUrl,
  hasSystemSecret,
  pluginId,
  systemKeyCost,
  inputConfig
}: {
  nodeId: string;
  isFolder?: boolean;
  courseUrl?: string;
  hasSystemSecret?: boolean;
  pluginId?: string;
  systemKeyCost?: number;
  inputConfig: FlowNodeInputItemType | undefined;
}) {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const [
    isOpenToolParamConfigModal,
    { setTrue: onOpenToolParamConfigModal, setFalse: onCloseToolParamConfigModal }
  ] = useBoolean(false);

  return (
    <>
      <Flex
        alignItems={'center'}
        flexDirection={'column'}
        justifyContent={'center'}
        borderRadius={'8px'}
        h={'200px'}
        bg={'white'}
        border={'1px dashed rgba(37, 99, 235, 0.28)'}
        mx={3}
        boxShadow={'0 12px 28px rgba(15, 23, 42, 0.04)'}
      >
        <Box>{t('app:tool_not_active')}</Box>
        <Button w={'83px'} mt={2} size={'lg'} onClick={onOpenToolParamConfigModal}>
          {t('app:too_to_active')}
        </Button>
      </Flex>

      {inputConfig && isOpenToolParamConfigModal && (
        <SecretInputModal
          isFolder={isFolder}
          onClose={onCloseToolParamConfigModal}
          onSubmit={(data) => {
            onChangeNode({
              nodeId,
              type: 'updateInput',
              key: inputConfig.key,
              value: {
                ...inputConfig,
                value: data
              }
            });
            onCloseToolParamConfigModal();
          }}
          courseUrl={courseUrl}
          inputConfig={inputConfig}
          hasSystemSecret={hasSystemSecret}
          parentId={pluginId}
          secretCost={systemKeyCost}
        />
      )}
    </>
  );
});

// Presentation Mode Overlay 组件
const PresentationModeOverlay = React.memo(function PresentationModeOverlay({
  avatar,
  name,
  intro,
  isLoopNode,
  onDoubleClick
}: {
  avatar: string;
  name: string;
  intro?: string;
  isLoopNode: boolean;
  onDoubleClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Flex
      position={'absolute'}
      top={0}
      left={0}
      right={0}
      bottom={0}
      bg={'rgba(255, 255, 255, 0.94)'}
      zIndex={10}
      borderRadius={'7px'}
      {...(isLoopNode
        ? {
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            px: 4,
            py: 4
          }
        : {
            alignItems: 'center',
            px: 3,
            py: 2.5
          })}
      cursor={'pointer'}
      onDoubleClick={onDoubleClick}
    >
      <Flex
        alignItems={isLoopNode ? 'flex-start' : 'center'}
        flexDirection={isLoopNode ? 'column' : 'row'}
        {...(isLoopNode
          ? {
              ml: 4,
              mt: 4
            }
          : {})}
        w={'full'}
        color={'black'}
      >
        <Avatar
          src={avatar}
          fill={'none'}
          borderRadius={'8px'}
          w={isLoopNode ? '64px' : '36px'}
          h={isLoopNode ? '64px' : '36px'}
        />
        <Box ml={isLoopNode ? 0 : 2.5} mt={isLoopNode ? 2 : 0} minW={0}>
          <Box
            fontSize={isLoopNode ? '18px' : '13px'}
            fontWeight={900}
            overflow={'hidden'}
            textOverflow={'ellipsis'}
            whiteSpace={'nowrap'}
          >
            {t(name as any)}
          </Box>
          {intro && (
            <Box mt={0.5} color={'#667085'} fontSize={isLoopNode ? '13px' : '11px'} noOfLines={1}>
              {t(intro as any)}
            </Box>
          )}
        </Box>
      </Flex>
    </Flex>
  );
});
