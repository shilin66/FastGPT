import React, { useCallback, useMemo } from 'react';
import {
  Background,
  ControlButton,
  MiniMap,
  type MiniMapNodeProps,
  Panel,
  useReactFlow
} from 'reactflow';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../context/workflowInitContext';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import styles from './index.module.scss';
import { useKeyPress } from 'ahooks';
import { WorkflowSnapshotContext } from '../../context/workflowSnapshotContext';
import { WorkflowUIContext } from '../../context/workflowUIContext';

const buttonStyle = {
  border: 'none',
  borderRadius: '6px',
  padding: '7px'
};

const FlowController = React.memo(function FlowController() {
  const { fitView, zoomIn, zoomOut, getNodes } = useReactFlow();
  const { undo, redo, canRedo, canUndo } = useContextSelector(WorkflowSnapshotContext, (v) => v);
  const { getNodeById } = useContextSelector(WorkflowBufferDataContext, (v) => v);
  const {
    workflowControlMode,
    setWorkflowControlMode,
    mouseInCanvas,
    presentationMode,
    setPresentationMode
  } = useContextSelector(WorkflowUIContext, (v) => v);
  const { t } = useTranslation();

  const isMac = !window ? false : window.navigator.userAgent.toLocaleLowerCase().includes('mac');

  useKeyPress(['ctrl.z', 'meta.z', 'ctrl.shift.z', 'meta.shift.z', 'ctrl.y', 'meta.y'], (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!mouseInCanvas) return;

    const isRedo = (e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y';

    if (isRedo) {
      redo();
    } else {
      undo();
    }
  });

  useKeyPress(['ctrl.add', 'meta.add', 'ctrl.equalsign', 'meta.equalsign'], (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!mouseInCanvas) return;
    zoomIn();
  });
  useKeyPress(['ctrl.dash', 'meta.dash'], (e) => {
    e.preventDefault();
    if (!mouseInCanvas) return;
    zoomOut();
  });

  useKeyPress(['shift.space'], (e) => {
    e.preventDefault();
    if (!mouseInCanvas) return;
    setPresentationMode((v) => !v);
  });

  /*
    id: Render node id
   */
  const MiniMapNode = useCallback(
    ({ x, y, width, height, color, id }: MiniMapNodeProps) => {
      // If the node parentNode is folded, the child node will not be displayed
      const node = getNodeById(id);
      const parentNode = node?.parentNodeId ? getNodeById(node?.parentNodeId) : undefined;
      if (parentNode?.isFolded) {
        return null;
      }

      return <rect x={x} y={y} width={width} height={height} fill={color} />;
    },
    [getNodeById]
  );

  const Render = useMemo(() => {
    return (
      <>
        <MiniMap
          style={{
            height: 92,
            width: 150,
            marginBottom: 62,
            borderRadius: '14px',
            border: '1px solid rgba(148, 163, 184, 0.22)',
            boxShadow: '0 18px 42px rgba(15, 23, 42, 0.10)'
          }}
          pannable
          nodeComponent={MiniMapNode}
        />
        <Panel
          position={'bottom-right'}
          style={{
            display: 'flex',
            marginBottom: 16,
            padding: '5px 8px',
            background: 'rgba(255, 255, 255, 0.92)',
            border: '1px solid rgba(148, 163, 184, 0.22)',
            borderRadius: '14px',
            overflow: 'hidden',
            alignItems: 'center',
            gap: '2px',
            backdropFilter: 'blur(14px)',
            boxShadow: '0 20px 44px rgba(15, 23, 42, 0.12)'
          }}
        >
          {/* Control Mode */}
          <MyTooltip
            label={
              workflowControlMode === 'select'
                ? t('workflow:pan_priority')
                : t('workflow:mouse_priority')
            }
          >
            <ControlButton
              onClick={() => {
                setWorkflowControlMode(workflowControlMode === 'select' ? 'drag' : 'select');
              }}
              style={{
                ...buttonStyle
              }}
              className={`${styles.customControlButton}`}
            >
              <MyIcon
                name={
                  workflowControlMode === 'select'
                    ? 'core/workflow/touchTable'
                    : 'core/workflow/mouse'
                }
              />
            </ControlButton>
          </MyTooltip>

          <Box w="1px" h="20px" bg="gray.200" mx={1.5}></Box>

          {/* undo */}
          <MyTooltip label={isMac ? t('common:undo_tip_mac') : t('common:undo_tip')}>
            <ControlButton
              onClick={undo}
              style={buttonStyle}
              className={`${styles.customControlButton}`}
              disabled={!canUndo}
            >
              <MyIcon name={'core/workflow/undo'} />
            </ControlButton>
          </MyTooltip>

          {/* redo */}
          <MyTooltip label={isMac ? t('common:redo_tip_mac') : t('common:redo_tip')}>
            <ControlButton
              onClick={redo}
              style={buttonStyle}
              className={`${styles.customControlButton}`}
              disabled={!canRedo}
            >
              <MyIcon name={'core/workflow/redo'} />
            </ControlButton>
          </MyTooltip>

          <Box w="1px" h="20px" bg="gray.200" mx={1.5}></Box>

          {/* presentation */}
          <MyTooltip
            label={
              presentationMode ? t('workflow:Edit_mode_tip') : t('workflow:Presentation_mode_tip')
            }
          >
            <ControlButton
              onClick={() => {
                setPresentationMode(!presentationMode);
              }}
              style={{
                ...buttonStyle,
                ...(presentationMode ? { backgroundColor: 'rgba(17, 24, 36, 0.05)' } : {})
              }}
              className={`${styles.customControlButton}`}
            >
              <MyIcon name={'core/workflow/present'} fill="none" />
            </ControlButton>
          </MyTooltip>

          <Box w="1px" h="20px" bg="gray.200" mx={1.5}></Box>

          {/* fit view */}
          <MyTooltip label={t('common:page_center')}>
            <ControlButton
              onClick={() => {
                const validNodes = getNodes().filter((node) => node.width && node.height);
                fitView({ nodes: validNodes, padding: 0.3 });
              }}
              style={buttonStyle}
              className={`custom-workflow-fix_view ${styles.customControlButton}`}
            >
              <MyIcon name={'core/modules/fitView'} />
            </ControlButton>
          </MyTooltip>
        </Panel>
        <Background color="rgba(37, 99, 235, 0.18)" gap={24} size={1} />
      </>
    );
  }, [
    MiniMapNode,
    workflowControlMode,
    t,
    isMac,
    undo,
    canUndo,
    redo,
    canRedo,
    presentationMode,
    setWorkflowControlMode,
    setPresentationMode,
    getNodes,
    fitView
  ]);

  return Render;
});

export default FlowController;
