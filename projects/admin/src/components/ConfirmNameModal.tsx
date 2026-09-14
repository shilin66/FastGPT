import {
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';

type ConfirmNameModalProps = {
  isOpen: boolean;
  title: string;
  name: string;
  description: string;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export const ConfirmNameModal = ({
  isOpen,
  title,
  name,
  description,
  submitting,
  onClose,
  onConfirm
}: ConfirmNameModalProps) => {
  const [value, setValue] = useState('');
  useEffect(() => {
    if (!isOpen) setValue('');
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent borderRadius="8px">
        <ModalHeader fontSize="16px">{title}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="13px" color="gray.700" whiteSpace="pre-line">
            {description}
          </Text>
          <FormControl mt={5}>
            <FormLabel fontSize="12px">请输入 {name} 以确认</FormLabel>
            <Input value={value} onChange={(event) => setValue(event.target.value)} />
          </FormControl>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            colorScheme="red"
            isDisabled={value !== name}
            isLoading={submitting}
            onClick={onConfirm}
          >
            永久删除
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
