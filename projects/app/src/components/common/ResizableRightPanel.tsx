import React, { useEffect, useId } from 'react';
import { Box, Flex, IconButton, Portal, type BoxProps, type FlexProps } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useResizableRightPanel } from './useResizableRightPanel';

type ResizableRightPanelPlacement = Pick<FlexProps, 'top' | 'right' | 'bottom' | 'borderRadius'>;

type ResizableRightPanelProps = {
  readonly onClose: () => void;
  readonly title: React.ReactNode;
  readonly children: React.ReactNode;
  readonly isLoading?: boolean;
  readonly initialWidth?: number;
  readonly preferredWidth?: number;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly bodyProps?: BoxProps;
  readonly placement?: ResizableRightPanelPlacement;
  readonly closeLabel?: string;
  readonly resizeLabel?: string;
};

export const ResizableRightPanel = React.memo(function ResizableRightPanel({
  onClose,
  title,
  children,
  isLoading,
  initialWidth = 920,
  preferredWidth,
  minWidth = 560,
  maxWidth = 1180,
  bodyProps,
  placement,
  closeLabel = 'Close',
  resizeLabel = 'Resize panel'
}: ResizableRightPanelProps) {
  const panelId = useId();
  const { width, isResizing, startResize, handleResizeKeyDown } = useResizableRightPanel({
    initialWidth,
    preferredWidth,
    minWidth,
    maxWidth
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <Portal>
      <Box position={'fixed'} inset={0} zIndex={1400} pointerEvents={'none'}>
        <Flex
          id={panelId}
          role={'dialog'}
          aria-modal={false}
          position={'absolute'}
          top={placement?.top ?? [0, '12px']}
          right={placement?.right ?? [0, '12px']}
          bottom={placement?.bottom ?? [0, '12px']}
          w={['100%', `${width}px`]}
          maxW={['100%', 'calc(100vw - 32px)']}
          minW={[0, `${minWidth}px`]}
          pointerEvents={'auto'}
          flexDirection={'column'}
          bg={'white'}
          border={'1px solid'}
          borderColor={'rgba(37, 99, 235, 0.16)'}
          borderRadius={placement?.borderRadius ?? ['0', '20px']}
          boxShadow={'0 24px 64px rgba(15, 23, 42, 0.18)'}
          overflow={'hidden'}
          transform={'translateX(0)'}
          animation={'ocInspectorPanelIn .18s ease-out'}
          sx={{
            '@keyframes ocInspectorPanelIn': {
              from: { transform: 'translateX(32px)', opacity: 0.6 },
              to: { transform: 'translateX(0)', opacity: 1 }
            },
            '@media (prefers-reduced-motion: reduce)': {
              animation: 'none'
            }
          }}
        >
          <Box
            display={['none', 'block']}
            position={'absolute'}
            top={0}
            left={'-7px'}
            w={'14px'}
            h={'100%'}
            role={'separator'}
            aria-label={resizeLabel}
            aria-controls={panelId}
            aria-orientation={'vertical'}
            aria-valuemin={minWidth}
            aria-valuemax={maxWidth}
            aria-valuenow={Math.round(width)}
            tabIndex={0}
            cursor={'col-resize'}
            zIndex={2}
            onMouseDown={(event) => {
              event.preventDefault();
              startResize(event.clientX);
            }}
            onTouchStart={(event) => {
              const clientX = event.touches[0]?.clientX;
              if (clientX === undefined) return;

              startResize(clientX);
            }}
            onKeyDown={handleResizeKeyDown}
            _before={{
              content: '""',
              position: 'absolute',
              top: '50%',
              left: '6px',
              transform: 'translateY(-50%)',
              w: '4px',
              h: '56px',
              borderRadius: 'full',
              bg: isResizing ? '#2563EB' : 'rgba(37, 99, 235, 0.28)',
              boxShadow: isResizing ? '0 0 0 4px rgba(37, 99, 235, 0.12)' : 'none',
              transition: 'background-color .16s ease, box-shadow .16s ease'
            }}
            _hover={{
              _before: {
                bg: '#2563EB',
                boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.12)'
              }
            }}
            _focusVisible={{
              outline: 'none',
              _before: {
                bg: '#2563EB',
                boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.12)'
              }
            }}
          />

          <Flex
            alignItems={'center'}
            gap={3}
            px={[5, 6]}
            py={3}
            minH={'56px'}
            bg={'linear-gradient(180deg, rgba(37, 99, 235, 0.08), rgba(248, 250, 252, 0.94))'}
            borderBottom={'1px solid rgba(148, 163, 184, 0.22)'}
          >
            <Box flex={'1 0 0'} minW={0}>
              {title}
            </Box>
            <IconButton
              aria-label={closeLabel}
              icon={<MyIcon name={'common/closeLight'} w={'16px'} />}
              variant={'ghost'}
              size={'smSquare'}
              borderRadius={'10px'}
              color={'#64748B'}
              onClick={onClose}
              _hover={{ bg: 'rgba(37, 99, 235, 0.08)', color: '#2563EB' }}
            />
          </Flex>

          <MyBox
            isLoading={isLoading}
            flex={'1 0 0'}
            h={0}
            display={'flex'}
            flexDirection={'column'}
            bg={'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)'}
            overflow={'hidden'}
            {...bodyProps}
          >
            {children}
          </MyBox>
        </Flex>
      </Box>
    </Portal>
  );
});
