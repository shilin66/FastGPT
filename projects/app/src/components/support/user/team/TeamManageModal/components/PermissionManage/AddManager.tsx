import {
  Box,
  Button,
  ModalBody,
  ModalCloseButton,
  ModalFooter,
  Grid,
  Input,
  Flex,
  Checkbox,
  CloseButton,
  InputGroup,
  InputLeftElement
} from '@chakra-ui/react';
import Avatar from '@/components/Avatar';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { updateMemberPermission } from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamModalContext } from '../../context';
import { useI18n } from '@/web/context/I18n';
import MyAvatar from '@/components/Avatar';

function AddManagerModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { t } = useTranslation();
  const { userT } = useI18n();
  const { userInfo } = useUserStore();
  const { members, refetchMembers } = useContextSelector(TeamModalContext, (v) => v);

  const [selected, setSelected] = useState<typeof members>([]);
  const [searchKey, setSearchKey] = useState('');

  const { mutate: submit, isLoading } = useRequest({
    mutationFn: async () => {
      return updateMemberPermission({
        permission: ManagePermissionVal,
        tmbIds: selected.map((item) => {
          return item.tmbId;
        })
      });
    },
    onSuccess: () => {
      refetchMembers();
      onSuccess();
    },
    successToast: '成功',
    errorToast: '失败'
  });

  const filterMembers = useMemo(() => {
    return members.filter((member) => {
      if (member.permission.isOwner) return false;
      if (!searchKey) return true;
      return !!member.memberName.includes(searchKey);
    });
  }, [members, searchKey]);

  return (
    <MyModal
      isOpen
      iconSrc={'modal/AddClb'}
      maxW={['90vw']}
      minW={['900px']}
      overflow={'unset'}
      title={userT('team.Add manager')}
    >
      <ModalCloseButton onClick={onClose} />
      <ModalBody py={6} px={10}>
        <Grid
          templateColumns="1fr 1fr"
          h="448px"
          borderRadius="8px"
          border="1px solid"
          borderColor="myGray.200"
        >
          <Flex flexDirection="column" p="4">
            <InputGroup alignItems="center" size={'sm'}>
              <InputLeftElement>
                <MyIcon name="common/searchLight" w="16px" color={'myGray.500'} />
              </InputLeftElement>
              <Input
                placeholder="搜索用户名"
                fontSize="sm"
                bg={'myGray.50'}
                onChange={(e) => {
                  setSearchKey(e.target.value);
                }}
              />
            </InputGroup>
            <Flex flexDirection="column" mt={3}>
              {filterMembers.map((member) => {
                const onChange = () => {
                  if (selected.includes(member)) {
                    setSelected(selected.filter((item) => item.tmbId !== member.tmbId));
                  } else {
                    setSelected([...selected, member]);
                  }
                };
                return (
                  <Flex
                    key={member.tmbId}
                    mt="1"
                    py="1"
                    px="3"
                    borderRadius="sm"
                    alignItems="center"
                    _hover={{
                      bgColor: 'myGray.50',
                      cursor: 'pointer'
                    }}
                  >
                    <Checkbox mr="3" isChecked={selected.includes(member)} onChange={onChange} />
                    <Flex
                      flexDirection="row"
                      onClick={onChange}
                      w="full"
                      justifyContent="space-between"
                    >
                      <Flex flexDirection="row" alignItems="center">
                        <MyAvatar src={member.avatar} w="32px" />
                        <Box ml="2">{member.memberName}</Box>
                      </Flex>
                    </Flex>
                  </Flex>
                );
              })}
            </Flex>
          </Flex>
          <Flex borderLeft="1px" borderColor="myGray.200" flexDirection="column" p="4">
            <Box mt={3}>已选: {selected.length} 个</Box>
            <Box mt={5}>
              {selected.map((member) => {
                return (
                  <Flex
                    alignItems="center"
                    justifyContent="space-between"
                    py="2"
                    px={3}
                    borderRadius={'md'}
                    key={member.tmbId}
                    _hover={{ bg: 'myGray.50' }}
                    _notLast={{ mb: 2 }}
                  >
                    <Avatar src={member.avatar} w="1.5rem" />
                    <Box w="full">{member.memberName}</Box>
                    <MyIcon
                      name={'common/closeLight'}
                      w={'1rem'}
                      cursor={'pointer'}
                      _hover={{ color: 'red.600' }}
                      onClick={() =>
                        setSelected([...selected.filter((item) => item.tmbId != member.tmbId)])
                      }
                    />
                  </Flex>
                );
              })}
            </Box>
          </Flex>
        </Grid>
      </ModalBody>
      <ModalFooter alignItems="flex-end">
        <Button h={'30px'} isLoading={isLoading} onClick={submit}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default AddManagerModal;
