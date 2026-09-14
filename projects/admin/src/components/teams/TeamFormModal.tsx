import type { AdminTeamListItem } from '@fastgpt/global/openapi/admin/manage/api';
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
import { AdminUserPicker } from '../users/AdminUserPicker';

export type TeamFormValue = {
  name: string;
  ownerId?: string;
  avatar?: string;
  teamDomain?: string;
};

type TeamFormModalProps = {
  isOpen: boolean;
  mode: 'create' | 'edit';
  team?: AdminTeamListItem;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (value: TeamFormValue) => void;
};

export const TeamFormModal = ({
  isOpen,
  mode,
  team,
  submitting,
  onClose,
  onSubmit
}: TeamFormModalProps) => {
  const [value, setValue] = useState<TeamFormValue>({ name: '' });
  useEffect(() => {
    if (isOpen) setValue(team ? { name: team.name, avatar: team.avatar } : { name: '' });
  }, [isOpen, team]);
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent borderRadius="8px">
        <ModalHeader fontSize="16px">{mode === 'create' ? '创建团队' : '编辑团队'}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <FormControl isRequired>
            <FormLabel fontSize="12px">团队名称</FormLabel>
            <Input
              value={value.name}
              onChange={(event) =>
                setValue((current) => ({ ...current, name: event.target.value }))
              }
            />
          </FormControl>
          {mode === 'create' ? (
            <FormControl mt={4} isRequired>
              <FormLabel fontSize="12px">所有者</FormLabel>
              <AdminUserPicker
                value={value.ownerId ?? ''}
                onChange={(ownerId) => setValue((current) => ({ ...current, ownerId }))}
              />
            </FormControl>
          ) : null}
          <FormControl mt={4}>
            <FormLabel fontSize="12px">头像地址</FormLabel>
            <Input
              value={value.avatar ?? ''}
              onChange={(event) =>
                setValue((current) => ({ ...current, avatar: event.target.value }))
              }
            />
          </FormControl>
          {mode === 'edit' ? (
            <FormControl mt={4}>
              <FormLabel fontSize="12px">团队域名</FormLabel>
              <Input
                value={value.teamDomain ?? ''}
                onChange={(event) =>
                  setValue((current) => ({ ...current, teamDomain: event.target.value }))
                }
              />
            </FormControl>
          ) : null}
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            colorScheme="blue"
            isDisabled={!value.name || (mode === 'create' && !value.ownerId)}
            isLoading={submitting}
            onClick={() => onSubmit(value)}
          >
            保存
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
