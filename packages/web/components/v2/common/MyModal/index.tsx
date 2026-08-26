import React, { useMemo } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalCloseButton,
  type ModalContentProps,
  Box,
  type ImageProps,
  Flex
} from '@chakra-ui/react';
import MyBox from '../../../common/MyBox';
import { useSystem } from '../../../../hooks/useSystem';
import Avatar from '../../../common/Avatar';

export interface MyModalProps extends ModalContentProps {
  iconSrc?: string;
  iconColor?: ImageProps['color'];
  title?: any;
  contentPx?: ModalContentProps['px'];
  contentPy?: ModalContentProps['py'];
  headerPx?: ModalContentProps['px'];
  isCentered?: boolean;
  isLoading?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  closeOnOverlayClick?: boolean;
  size?: 'sm' | 'md' | 'lg';
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
  closeOnOverlayClick = true,
  iconColor,
  size = 'sm',
  showCloseButton = true,
  contentPx = '8',
  contentPy = '8',
  headerPx = 0,
  ...props
}: MyModalProps) => {
  const { isPc } = useSystem();

  const sizeData = useMemo(() => {
    const map = {
      sm: {
        w: '400px'
      },
      md: {
        w: '560px'
      },
      lg: {
        w: '800px'
      }
    };
    return map[size];
  }, [size]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onClose?.()}
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
        w={sizeData.w}
        maxW={'90vw'}
        position={'relative'}
        maxH={'80vh'}
        bg={'white'}
        border={'1px solid'}
        borderColor={'rgba(37, 99, 235, 0.16)'}
        borderRadius={'18px'}
        boxShadow={'0 28px 80px rgba(15, 23, 42, 0.22)'}
        overflow={'hidden'}
        px={contentPx}
        py={contentPy}
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
            px: 0,
            pt: 4,
            pb: 0
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
        {onClose && <ModalCloseButton position={'absolute'} fontSize={'xs'} top={3} right={3} />}

        {!!title && (
          <Flex
            alignItems={'center'}
            fontSize={'lg'}
            fontWeight={'500'}
            mb={6}
            py={0}
            px={headerPx}
            gap={3}
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
            <Box color={'#1E293B'} fontWeight={800}>
              {title}
            </Box>
            <Box flex={1} />
          </Flex>
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
