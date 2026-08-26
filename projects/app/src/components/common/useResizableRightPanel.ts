import { useCallback, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { getBoundedRightPanelWidth } from './resizableRightPanelWidth';

const VIEWPORT_GUTTER = 32;
const KEYBOARD_RESIZE_STEP = 24;

type UseResizableRightPanelOptions = {
  readonly initialWidth: number;
  readonly preferredWidth?: number;
  readonly minWidth: number;
  readonly maxWidth: number;
};

const getTouchClientX = (event: TouchEvent) => {
  return event.touches[0]?.clientX ?? event.changedTouches[0]?.clientX;
};

export const useResizableRightPanel = ({
  initialWidth,
  preferredWidth,
  minWidth,
  maxWidth
}: UseResizableRightPanelOptions) => {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);

  const getBoundedWidth = useCallback(
    (requestedWidth: number) =>
      getBoundedRightPanelWidth({
        requestedWidth,
        viewportWidth: window.innerWidth,
        minWidth,
        maxWidth,
        viewportGutter: VIEWPORT_GUTTER
      }),
    [maxWidth, minWidth]
  );

  const startResize = useCallback(
    (clientX: number) => {
      setIsResizing(true);
      setWidth(getBoundedWidth(window.innerWidth - clientX));
    },
    [getBoundedWidth]
  );

  const handleResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      let requestedWidth: number | undefined;

      if (event.key === 'ArrowLeft') requestedWidth = width + KEYBOARD_RESIZE_STEP;
      if (event.key === 'ArrowRight') requestedWidth = width - KEYBOARD_RESIZE_STEP;
      if (event.key === 'Home') requestedWidth = minWidth;
      if (event.key === 'End') requestedWidth = maxWidth;
      if (requestedWidth === undefined) return;

      event.preventDefault();
      setWidth(getBoundedWidth(requestedWidth));
    },
    [getBoundedWidth, maxWidth, minWidth, width]
  );

  useEffect(() => {
    if (preferredWidth === undefined) return;
    setWidth(getBoundedWidth(preferredWidth));
  }, [getBoundedWidth, preferredWidth]);

  useEffect(() => {
    const handleViewportResize = () => {
      setWidth((currentWidth) => getBoundedWidth(currentWidth));
    };

    window.addEventListener('resize', handleViewportResize);
    return () => {
      window.removeEventListener('resize', handleViewportResize);
    };
  }, [getBoundedWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (event: MouseEvent) => {
      setWidth(getBoundedWidth(window.innerWidth - event.clientX));
    };
    const handleTouchMove = (event: TouchEvent) => {
      const clientX = getTouchClientX(event);
      if (clientX === undefined) return;

      event.preventDefault();
      setWidth(getBoundedWidth(window.innerWidth - clientX));
    };
    const stopResize = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', stopResize);
    document.addEventListener('touchcancel', stopResize);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopResize);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', stopResize);
      document.removeEventListener('touchcancel', stopResize);
    };
  }, [getBoundedWidth, isResizing]);

  return {
    width,
    isResizing,
    startResize,
    handleResizeKeyDown
  } as const;
};
