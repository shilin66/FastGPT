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

type ResetPasswordModalProps = {
  isOpen: boolean;
  username: string;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
};

export const ResetPasswordModal = ({
  isOpen,
  username,
  submitting,
  onClose,
  onSubmit
}: ResetPasswordModalProps) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setConfirm('');
    }
  }, [isOpen]);
  const valid = password.length >= 8 && password === confirm;

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent borderRadius="8px">
        <ModalHeader fontSize="16px">重置密码</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="13px" color="gray.600" mb={4}>
            为用户 {username} 设置永久密码。保存后该用户全部现有会话将失效。
          </Text>
          <FormControl isRequired>
            <FormLabel fontSize="12px">新密码</FormLabel>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormControl>
          <FormControl mt={4} isRequired isInvalid={Boolean(confirm) && password !== confirm}>
            <FormLabel fontSize="12px">确认密码</FormLabel>
            <Input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </FormControl>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            colorScheme="blue"
            isDisabled={!valid}
            isLoading={submitting}
            onClick={() => onSubmit(password)}
          >
            重置密码
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
