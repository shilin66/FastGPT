import { Box } from '@chakra-ui/react';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { omniTheme } from '@/web/common/brand/theme';
import React, { Children, useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_CONFIG_RATIO = 58;
const MIN_CONFIG_RATIO = 46;
const MAX_CONFIG_RATIO = 72;

const clampRatio = (ratio: number) => Math.min(MAX_CONFIG_RATIO, Math.max(MIN_CONFIG_RATIO, ratio));

const ResizableAgentSplit = ({
  children,
  showConfig = true
}: {
  children: React.ReactNode;
  showConfig?: boolean;
}) => {
  const { isPc } = useSystem();
  const containerRef = useRef<HTMLDivElement>(null);
  const [configRatio, setConfigRatio] = useState(DEFAULT_CONFIG_RATIO);
  const [isResizing, setIsResizing] = useState(false);
  const panels = Children.toArray(children);
  const configPanel = showConfig ? panels[0] : undefined;
  const debugPanel = showConfig ? panels[1] : panels[0];

  const updateRatio = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    setConfigRatio(clampRatio(((clientX - rect.left) / rect.width) * 100));
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (event: MouseEvent) => updateRatio(event.clientX);
    const onMouseUp = () => setIsResizing(false);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isResizing, updateRatio]);

  if (!isPc) {
    return (
      <Box flex={'1 0 0'} h={0} mt={4} overflowY={'auto'} overflowX={'hidden'} pb={4}>
        {children}
      </Box>
    );
  }

  return (
    <Box
      flex={'1 0 0'}
      h={0}
      mt={0}
      mb={0}
      overflowX={'auto'}
      overflowY={'hidden'}
      position={'relative'}
    >
      {!showConfig ? (
        <Box h={'full'} minW={0} overflow={'hidden'}>
          {debugPanel}
        </Box>
      ) : (
        <Box
          ref={containerRef}
          display={'grid'}
          gridTemplateColumns={`${configRatio}fr ${omniTheme.layout.agentSplitGutterWidth} ${
            100 - configRatio
          }fr`}
          h={'full'}
          minW={omniTheme.layout.agentSplitDesktopMinWidth}
          overflow={'hidden'}
        >
          <Box minW={0} overflow={'hidden'}>
            {configPanel}
          </Box>

          <Box
            role={'separator'}
            aria-label={'调整配置区与调试区宽度'}
            aria-orientation={'vertical'}
            aria-valuemin={MIN_CONFIG_RATIO}
            aria-valuemax={MAX_CONFIG_RATIO}
            aria-valuenow={Math.round(configRatio)}
            tabIndex={0}
            position={'relative'}
            cursor={'col-resize'}
            outline={'none'}
            onMouseDown={(event) => {
              event.preventDefault();
              setIsResizing(true);
            }}
            onDoubleClick={() => setConfigRatio(DEFAULT_CONFIG_RATIO)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              setConfigRatio((ratio) => clampRatio(ratio + (event.key === 'ArrowRight' ? 2 : -2)));
            }}
          >
            <Box
              position={'absolute'}
              left={'50%'}
              top={0}
              bottom={0}
              w={isResizing ? '2px' : '1px'}
              transform={'translateX(-50%)'}
              bg={isResizing ? omniTheme.colors.saturatedBlue : omniTheme.colors.border}
              transition={omniTheme.motion.resize}
            />
            <Box
              position={'absolute'}
              left={'50%'}
              top={'50%'}
              transform={'translate(-50%, -50%)'}
              w={'2px'}
              h={omniTheme.layout.agentSplitHandleHeight}
              borderRadius={'2px'}
              bg={isResizing ? omniTheme.colors.saturatedBlue : omniTheme.colors.border}
              transition={omniTheme.motion.resizeColor}
            />
          </Box>

          <Box minW={0} overflow={'hidden'}>
            {debugPanel}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default React.memo(ResizableAgentSplit);
