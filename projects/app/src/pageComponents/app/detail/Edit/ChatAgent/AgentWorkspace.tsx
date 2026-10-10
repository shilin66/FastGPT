import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useSize } from 'ahooks';
import SandboxFilePanel from '@/pageComponents/chat/SandboxEditor/Panel';
import { useSandboxFilePanel } from '@/pageComponents/chat/SandboxEditor/PanelContext';
import ResizeDivider from '@/pageComponents/chat/SandboxEditor/ResizeDivider';

const readWidth = (key: string, fallback: number) => {
  if (typeof window === 'undefined') return fallback;
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const CONFIG_KEY = 'agent_config_pane_width';
const FILE_KEY = 'agent_file_pane_width_v2';

const AgentWorkspace = ({
  config,
  chat,
  showConfig
}: {
  config: React.ReactNode;
  chat: React.ReactNode;
  showConfig: boolean;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useSize(containerRef);
  const panel = useSandboxFilePanel();
  const fileOpen = !!panel?.isOpen;
  const [configWidth, setConfigWidth] = useState<number>();
  const [fileWidth, setFileWidth] = useState(280);
  useEffect(() => {
    setConfigWidth(readWidth(CONFIG_KEY, 0) || undefined);
    setFileWidth(readWidth(FILE_KEY, 280));
  }, []);
  const total = size?.width ?? 1440;
  const gap = 8;
  const minChat = 380;
  const minFile = 248;
  const minConfig = Math.min(
    fileOpen ? 300 : 520,
    Math.max(0, total - minChat - (fileOpen ? minFile + 2 * gap : gap))
  );
  const preferredConfigWidth = configWidth ?? Math.min(960, Math.max(760, total * 0.48));
  const autoFileWidth = 248;
  const expandedFileTarget = 760;
  const expanded = !!panel?.isExpanded && fileOpen;
  const actualConfig = showConfig
    ? Math.max(
        minConfig,
        Math.min(
          preferredConfigWidth,
          total -
            minChat -
            (fileOpen
              ? (expanded ? expandedFileTarget : panel?.isAutoOpened ? autoFileWidth : fileWidth) +
                2 * gap
              : gap)
        )
      )
    : 0;
  const actualFile = fileOpen
    ? Math.max(
        panel?.isAutoOpened && !expanded ? autoFileWidth : minFile,
        Math.min(
          expanded ? expandedFileTarget : panel?.isAutoOpened ? autoFileWidth : fileWidth,
          total - minChat - (showConfig ? actualConfig + 2 * gap : gap)
        )
      )
    : 0;

  const moveConfig = useCallback(
    (delta: number) => {
      if (expanded) {
        panel?.restore();
        panel?.markManuallyResized();
        setFileWidth(actualFile);
      }
      setConfigWidth(() => {
        const next = Math.max(
          minConfig,
          Math.min(actualConfig + delta, total - minChat - (fileOpen ? actualFile + 2 * gap : gap))
        );
        localStorage.setItem(CONFIG_KEY, String(next));
        return next;
      });
    },
    [actualConfig, actualFile, fileOpen, total, expanded, panel, minConfig]
  );
  const moveFile = useCallback(
    (delta: number) => {
      if (expanded) panel?.restore();
      panel?.markManuallyResized();
      setFileWidth(() => {
        const next = Math.max(
          minFile,
          Math.min(actualFile - delta, total - minChat - (showConfig ? minConfig + 2 * gap : gap))
        );
        localStorage.setItem(FILE_KEY, String(next));
        return next;
      });
    },
    [actualFile, showConfig, total, expanded, panel, minConfig]
  );

  return (
    <Flex ref={containerRef} flex={'1 1 0'} minH={0} minW={0} w={'full'} overflow={'hidden'}>
      <Box
        w={`${actualConfig}px`}
        flexShrink={0}
        minW={0}
        h={'full'}
        display={showConfig ? 'block' : 'none'}
        overflow={'hidden'}
      >
        {config}
      </Box>
      {showConfig && <ResizeDivider label={'调整配置区域宽度'} onMove={moveConfig} />}
      <Box flex={'1 1 0'} w={0} minW={minChat} h={'full'} overflow={'hidden'}>
        {chat}
      </Box>
      {fileOpen && <ResizeDivider label={'调整文件区域宽度'} onMove={moveFile} />}
      <Box
        w={`${actualFile}px`}
        flexShrink={0}
        minW={0}
        h={'full'}
        display={fileOpen ? 'block' : 'none'}
        overflow={'hidden'}
      >
        <SandboxFilePanel />
      </Box>
    </Flex>
  );
};

export default AgentWorkspace;
