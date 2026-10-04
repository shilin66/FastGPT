import React, { useEffect, useRef, useState } from 'react';
import { Box } from '@chakra-ui/react';

const ResizeDivider = ({ label, onMove }: { label: string; onMove: (delta: number) => void }) => {
  const [dragging, setDragging] = useState(false);
  const lastX = useRef(0);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;

  useEffect(() => {
    if (!dragging) return;
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMouseMove = (event: MouseEvent) => {
      moveRef.current(event.clientX - lastX.current);
      lastX.current = event.clientX;
    };
    const onMouseUp = () => setDragging(false);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
    };
  }, [dragging]);

  return (
    <Box
      role={'separator'}
      aria-label={label}
      aria-orientation={'vertical'}
      tabIndex={0}
      flex={'0 0 8px'}
      h={'full'}
      position={'relative'}
      cursor={'col-resize'}
      bg={'white'}
      outline={'none'}
      _focusVisible={{ boxShadow: 'inset 0 0 0 2px #2563EB' }}
      onMouseDown={(event) => {
        event.preventDefault();
        lastX.current = event.clientX;
        setDragging(true);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        onMove(event.key === 'ArrowRight' ? 24 : -24);
      }}
    >
      <Box
        position={'absolute'}
        left={'3px'}
        top={0}
        bottom={0}
        w={'1px'}
        bg={dragging ? '#2563EB' : 'myGray.200'}
      />
      <Box
        position={'absolute'}
        left={'2px'}
        top={'calc(50% - 18px)'}
        w={'3px'}
        h={'36px'}
        borderRadius={'4px'}
        bg={dragging ? '#2563EB' : 'myGray.300'}
      />
    </Box>
  );
};

export default ResizeDivider;
