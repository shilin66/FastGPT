import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  type ModalContentProps,
  Box,
  type ImageProps
} from '@chakra-ui/react';
import MyBox from '../MyBox';
import { useSystem } from '../../../hooks/useSystem';
import Avatar from '../Avatar';

export interface MyModalProps extends ModalContentProps {
  iconSrc?: string;
  iconColor?: ImageProps['color'];
  title?: any;
  isCentered?: boolean;
  isLoading?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  closeOnOverlayClick?: boolean;
  size?: 'md' | 'lg';
  showCloseButton?: boolean;
}

const MyModal = ({
  isOpen = true,
  onClose,
  iconSrc,
  title,
  children,
  isCentered,
  isLoading,
  w = 'auto',
  maxW = ['90vw', '600px'],
  closeOnOverlayClick = true,
  iconColor,
  size = 'md',
  showCloseButton = true,
  ...props
}: MyModalProps) => {
  const { isPc } = useSystem();

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onClose && onClose()}
      size={size}
      autoFocus={false}
      isCentered={isPc ? isCentered : true}
      blockScrollOnMount={false}
      allowPinchZoom
      scrollBehavior={'inside'}
      closeOnOverlayClick={closeOnOverlayClick}
      returnFocusOnClose={false}
    >
      <ModalOverlay
        zIndex={props.zIndex}
        bg={'rgba(15, 23, 42, 0.42)'}
        backdropFilter={'blur(4px)'}
      />
      <ModalContent
        w={w}
        minW={['90vw', '400px']}
        maxW={maxW}
        position={'relative'}
        maxH={'85vh'}
        bg={'white'}
        border={'1px solid'}
        borderColor={'rgba(37, 99, 235, 0.16)'}
        borderRadius={'18px'}
        boxShadow={'0 28px 80px rgba(15, 23, 42, 0.22)'}
        overflow={'hidden'}
        containerProps={{
          zIndex: props.zIndex
        }}
        sx={{
          '.chakra-modal__body': {
            bg: '#F8FAFC'
          },
          '.chakra-modal__footer': {
            bg: 'white',
            borderTop: '1px solid rgba(148, 163, 184, 0.22)',
            px: [5, 6],
            py: 4
          },
          '.chakra-modal__close-btn': {
            borderRadius: '10px',
            color: '#64748B',
            transition: 'all .18s ease',
            _hover: {
              bg: 'rgba(37, 99, 235, 0.08)',
              color: '#2563EB'
            }
          }
        }}
        {...props}
      >
        {!title && onClose && showCloseButton && <ModalCloseButton top={3} right={3} zIndex={1} />}
        {!!title && (
          <ModalHeader
            display={'flex'}
            alignItems={'center'}
            background={'linear-gradient(90deg, rgba(37, 99, 235, 0.08), rgba(255, 255, 255, 0))'}
            borderBottom={'1px solid rgba(148, 163, 184, 0.22)'}
            roundedTop={'18px'}
            px={[5, 6]}
            py={4}
            fontSize={'md'}
            fontWeight={'bold'}
            minH={['52px', '60px']}
          >
            {iconSrc && (
              <>
                <Avatar
                  color={iconColor}
                  objectFit={'contain'}
                  alt=""
                  src={iconSrc}
                  w={'24px'}
                  borderRadius={'8px'}
                />
              </>
            )}
            <Box ml={iconSrc ? 3 : 0} color={'#1E293B'} fontWeight={800}>
              {title}
            </Box>
            <Box flex={1} />
            {onClose && (
              <ModalCloseButton position={'relative'} fontSize={'xs'} top={0} right={0} />
            )}
          </ModalHeader>
        )}

        <MyBox
          isLoading={isLoading}
          overflow={props.overflow || 'overlay'}
          h={'100%'}
          display={'flex'}
          flexDirection={'column'}
        >
          {children}
        </MyBox>
      </ModalContent>
    </Modal>
  );
};

export default React.memo(MyModal);
