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
  ModalOverlay
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';

export type UserFormValue = {
  username?: string;
  password?: string;
  contact?: string;
  timezone?: string;
};

type UserFormModalProps = {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialValue?: UserFormValue;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (value: UserFormValue) => void;
};

export const UserFormModal = ({
  isOpen,
  mode,
  initialValue,
  submitting,
  onClose,
  onSubmit
}: UserFormModalProps) => {
  const [value, setValue] = useState<UserFormValue>({ timezone: 'Asia/Shanghai' });
  useEffect(() => {
    if (isOpen) setValue(initialValue ?? { timezone: 'Asia/Shanghai' });
  }, [initialValue, isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent borderRadius="8px">
        <ModalHeader fontSize="16px">{mode === 'create' ? '创建用户' : '编辑用户'}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {mode === 'create' ? (
            <>
              <FormControl isRequired>
                <FormLabel fontSize="12px">用户名</FormLabel>
                <Input
                  value={value.username ?? ''}
                  onChange={(event) =>
                    setValue((current) => ({ ...current, username: event.target.value }))
                  }
                />
              </FormControl>
              <FormControl mt={4} isRequired>
                <FormLabel fontSize="12px">初始密码</FormLabel>
                <Input
                  type="password"
                  value={value.password ?? ''}
                  onChange={(event) =>
                    setValue((current) => ({ ...current, password: event.target.value }))
                  }
                />
              </FormControl>
            </>
          ) : null}
          <FormControl mt={mode === 'create' ? 4 : 0}>
            <FormLabel fontSize="12px">联系方式</FormLabel>
            <Input
              value={value.contact ?? ''}
              onChange={(event) =>
                setValue((current) => ({ ...current, contact: event.target.value }))
              }
            />
          </FormControl>
          <FormControl mt={4}>
            <FormLabel fontSize="12px">时区</FormLabel>
            <Input
              value={value.timezone ?? ''}
              onChange={(event) =>
                setValue((current) => ({ ...current, timezone: event.target.value }))
              }
            />
          </FormControl>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            colorScheme="blue"
            isLoading={submitting}
            isDisabled={
              mode === 'create' && (!value.username || !value.password || value.password.length < 8)
            }
            onClick={() => onSubmit(value)}
          >
            保存
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
