import type { AdminTeamListItem } from '@fastgpt/global/openapi/admin/manage/api';
import {
  Button,
  FormControl,
  FormLabel,
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
import { AdminUserPicker } from '../users/AdminUserPicker';

type TransferTeamOwnerModalProps = {
  isOpen: boolean;
  team: AdminTeamListItem;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (userId: string) => void;
};

export const TransferTeamOwnerModal = ({
  isOpen,
  team,
  submitting,
  onClose,
  onSubmit
}: TransferTeamOwnerModalProps) => {
  const [userId, setUserId] = useState('');
  useEffect(() => {
    if (!isOpen) setUserId('');
  }, [isOpen]);
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent borderRadius="8px">
        <ModalHeader fontSize="16px">转移团队所有权</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="13px" color="gray.600">
            将 {team.name} 的所有权转给指定用户。用户不在团队时会自动加入。
          </Text>
          <FormControl mt={5} isRequired>
            <FormLabel fontSize="12px">新所有者</FormLabel>
            <AdminUserPicker value={userId} excludeUserIds={[team.ownerId]} onChange={setUserId} />
          </FormControl>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            colorScheme="blue"
            isDisabled={!userId}
            isLoading={submitting}
            onClick={() => onSubmit(userId)}
          >
            确认转移
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
