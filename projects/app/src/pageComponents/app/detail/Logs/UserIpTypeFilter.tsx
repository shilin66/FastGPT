import React from 'react';
import type { ButtonProps, PlacementWithLogical } from '@chakra-ui/react';
import {
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Flex,
  Box,
  Button,
  useDisclosure
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';

export type UserIpTypeValue = 'all' | 'only_ip' | 'only_region';

type FilterProps = {
  userIpType: UserIpTypeValue;
  setUserIpType: (userIpType: UserIpTypeValue) => void;
  menuButtonProps?: ButtonProps;
};

const UserIpTypeFilter = ({ userIpType, setUserIpType, menuButtonProps }: FilterProps) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const userIpOptions = [
    {
      value: 'all' as const,
      label: t('app:logs_keys_region')
    },
    {
      value: 'only_ip' as const,
      label: t('app:logs_keys_only_ip')
    },
    {
      value: 'only_region' as const,
      label: t('app:logs_keys_only_region')
    }
  ];

  return (
    <Menu
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={onClose}
      closeOnSelect={true}
      strategy={'fixed'}
      autoSelect={false}
      placement="bottom"
    >
      <MenuButton
        as={Button}
        variant={'grayGhost'}
        size="sm"
        rightIcon={<MyIcon name={'core/chat/chevronDown'} w={4} />}
        fontWeight={'normal'}
        {...menuButtonProps}
      >
        {userIpOptions.find((option) => option.value === userIpType)?.label}
      </MenuButton>

      <MenuList
        minW={'120px'}
        w={'180px'}
        px={'6px'}
        py={'6px'}
        border={'1px solid rgba(37, 99, 235, 0.16)'}
        borderRadius={'12px'}
        boxShadow={'0 18px 45px rgba(15, 23, 42, 0.14)'}
        zIndex={99}
      >
        {/* Radio options */}
        {userIpOptions.map((option) => (
          <MenuItem
            key={option.value}
            borderRadius="9px"
            py={2}
            px={3}
            fontSize={'sm'}
            fontWeight={'normal'}
            color={userIpType === option.value ? 'primary.600' : 'myGray.900'}
            bg={userIpType === option.value ? 'rgba(37, 99, 235, 0.08)' : 'transparent'}
            _hover={{ bg: 'rgba(37, 99, 235, 0.06)' }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setUserIpType(option.value);
              onClose();
            }}
          >
            <Flex alignItems={'center'} gap={2}>
              <Box
                w={'18px'}
                h={'18px'}
                borderWidth={'2.4px'}
                borderColor={userIpType === option.value ? 'primary.015' : 'transparent'}
                borderRadius={'50%'}
              >
                <Flex
                  w={'100%'}
                  h={'100%'}
                  borderWidth={'1px'}
                  borderColor={userIpType === option.value ? 'primary.600' : 'borderColor.high'}
                  bg={userIpType === option.value ? 'primary.1' : 'transparent'}
                  borderRadius={'50%'}
                  alignItems={'center'}
                  justifyContent={'center'}
                >
                  <Box
                    w={'5px'}
                    h={'5px'}
                    borderRadius={'50%'}
                    bg={userIpType === option.value ? 'primary.600' : 'transparent'}
                  />
                </Flex>
              </Box>
              {option.label}
            </Flex>
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
};

export default UserIpTypeFilter;
