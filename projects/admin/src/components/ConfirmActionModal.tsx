import {
  Button,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text
} from '@chakra-ui/react';

type ConfirmActionModalProps = {
  isOpen: boolean;
  title: string;
  description: string;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export const ConfirmActionModal = ({
  isOpen,
  title,
  description,
  submitting,
  onClose,
  onConfirm
}: ConfirmActionModalProps) => (
  <Modal isOpen={isOpen} onClose={onClose} isCentered>
    <ModalOverlay />
    <ModalContent borderRadius="8px">
      <ModalHeader fontSize="16px">{title}</ModalHeader>
      <ModalCloseButton />
      <ModalBody>
        <Text fontSize="13px" color="gray.600">
          {description}
        </Text>
      </ModalBody>
      <ModalFooter gap={2}>
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button colorScheme="red" isLoading={submitting} onClick={onConfirm}>
          确认
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
);
