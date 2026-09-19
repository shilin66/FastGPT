import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

const DEFAULT_RATIO = 36;
const STORAGE_KEY = 'skill_workspace_conversation_ratio';
const GUTTER_WIDTH = 8;
const rememberRatio = (value: number) => {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Resizing remains available when browser storage is blocked.
  }
};

const WorkspaceSplit = ({
  conversation,
  children
}: {
  conversation?: React.ReactNode;
  children: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const hasConversation = !!conversation;
  const panelId = useId();
  const container = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [requestedRatio, setRequestedRatio] = useState(DEFAULT_RATIO);
  const [isResizing, setIsResizing] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; ratio: number }>();
  const availableWidth = Math.max(1, containerWidth - GUTTER_WIDTH);
  const minRatio = Math.min(40, (320 / availableWidth) * 100);
  const maxRatio = Math.max(40, 100 - (560 / availableWidth) * 100);
  const clamp = (value: number) => Math.min(maxRatio, Math.max(minRatio, value));
  const ratio = containerWidth ? clamp(requestedRatio) : requestedRatio;
  const latestRatio = useRef(ratio);
  latestRatio.current = ratio;
  const stopResize = useCallback(() => {
    if (!drag.current) return;
    drag.current = undefined;
    setIsResizing(false);
    rememberRatio(latestRatio.current);
  }, []);

  useEffect(() => {
    if (!hasConversation) stopResize();
  }, [hasConversation, stopResize]);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY));
      if (Number.isFinite(saved) && saved > 0 && saved < 100) setRequestedRatio(saved);
    } catch {
      // Use the default layout when browser storage is unavailable.
    }
    const element = container.current;
    if (!element) return;
    const measure = () => setContainerWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('blur', stopResize);
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
      window.removeEventListener('blur', stopResize);
    };
  }, [isResizing, stopResize]);

  return (
    <Box
      ref={container}
      flex={1}
      minH={0}
      minW={0}
      overflow="hidden"
      bg="white"
      borderRadius={0}
      borderWidth={0}
      display="grid"
      gridTemplateColumns={
        conversation
          ? `minmax(0, ${ratio}fr) ${GUTTER_WIDTH}px minmax(0, ${100 - ratio}fr)`
          : 'minmax(0, 1fr)'
      }
    >
      {conversation && (
        <Box id={panelId} minW={0} minH={0} overflow="hidden">
          {conversation}
        </Box>
      )}
      {conversation && (
        <Box
          role="separator"
          aria-label={t('skill:workspace_resize')}
          aria-orientation="vertical"
          aria-controls={panelId}
          aria-valuemin={Math.round(minRatio)}
          aria-valuemax={Math.round(maxRatio)}
          aria-valuenow={Math.round(ratio)}
          tabIndex={0}
          title={t('skill:workspace_resize_hint')}
          position="relative"
          cursor="col-resize"
          sx={{ touchAction: 'none' }}
          bg={isResizing ? 'primary.50' : 'myGray.25'}
          _hover={{ bg: 'primary.50', '& > div': { bg: 'primary.400' } }}
          _focusVisible={{
            outline: '2px solid',
            outlineColor: 'primary.500',
            outlineOffset: '-2px'
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 || drag.current) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { pointerId: event.pointerId, x: event.clientX, ratio };
            setIsResizing(true);
          }}
          onPointerMove={(event) => {
            if (!drag.current || event.pointerId !== drag.current.pointerId) return;
            const next = clamp(
              drag.current.ratio + ((event.clientX - drag.current.x) / availableWidth) * 100
            );
            latestRatio.current = next;
            setRequestedRatio(next);
          }}
          onPointerUp={(event) => {
            if (drag.current?.pointerId !== event.pointerId) return;
            stopResize();
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={stopResize}
          onLostPointerCapture={stopResize}
          onDoubleClick={() => {
            setRequestedRatio(clamp(DEFAULT_RATIO));
            rememberRatio(clamp(DEFAULT_RATIO));
          }}
          onKeyDown={(event) => {
            const next =
              event.key === 'ArrowLeft'
                ? ratio - 2
                : event.key === 'ArrowRight'
                  ? ratio + 2
                  : event.key === 'Home'
                    ? minRatio
                    : event.key === 'End'
                      ? maxRatio
                      : undefined;
            if (next === undefined) return;
            event.preventDefault();
            setRequestedRatio(clamp(next));
            rememberRatio(clamp(next));
          }}
        >
          <Box
            position="absolute"
            top={0}
            bottom={0}
            left="50%"
            w="1px"
            bg={isResizing ? 'primary.400' : 'myGray.200'}
          />
          <Box
            position="absolute"
            top="50%"
            left="50%"
            transform="translate(-50%, -50%)"
            w="3px"
            h="32px"
            borderRadius="full"
            bg={isResizing ? 'primary.500' : 'myGray.400'}
          />
        </Box>
      )}
      <Box
        minW={0}
        minH={0}
        overflow="hidden"
        display="flex"
        pointerEvents={isResizing ? 'none' : undefined}
      >
        {children}
      </Box>
    </Box>
  );
};

export default WorkspaceSplit;
