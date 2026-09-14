import type { AdminUserListItem } from '@fastgpt/global/openapi/admin/manage/api';
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
import { AdminUserPicker } from './AdminUserPicker';

type TransferResourceModalProps = {
  isOpen: boolean;
  sourceUser: AdminUserListItem;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (targetUserId: string) => void;
};

export const TransferResourceModal = ({
  isOpen,
  sourceUser,
  submitting,
  onClose,
  onSubmit
}: TransferResourceModalProps) => {
  const [targetUserId, setTargetUserId] = useState('');
  useEffect(() => {
    if (!isOpen) setTargetUserId('');
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent borderRadius="8px">
        <ModalHeader fontSize="16px">转移用户资源</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="13px" color="gray.600">
            {sourceUser.username}{' '}
            的团队、应用、知识库及所有者权限将统一转给接收人。接收人缺少团队身份时会自动加入。
          </Text>
          <Text mt={3} fontSize="12px" color="gray.500">
            当前涉及 {sourceUser.teamCount} 个团队、{sourceUser.appCount} 个应用、
            {sourceUser.datasetCount} 个知识库。
          </Text>
          <FormControl mt={5} isRequired>
            <FormLabel fontSize="12px">统一接收人</FormLabel>
            <AdminUserPicker
              value={targetUserId}
              excludeUserIds={[sourceUser.id]}
              onChange={setTargetUserId}
            />
          </FormControl>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            colorScheme="blue"
            isDisabled={!targetUserId}
            isLoading={submitting}
            onClick={() => onSubmit(targetUserId)}
          >
            开始转移
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
