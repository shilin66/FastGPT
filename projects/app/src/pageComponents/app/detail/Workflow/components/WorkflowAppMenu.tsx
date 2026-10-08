import React from 'react';
import {
  IconButton,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Portal
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { AppContext } from '../../context';

const WorkflowAppMenu = () => {
  const { t } = useTranslation();
  const { appDetail, onOpenInfoEdit, onDelApp } = useContextSelector(AppContext, (v) => v);
  const { hasWritePer, hasManagePer, isOwner } = appDetail.permission;

  if (!hasWritePer && !hasManagePer && !isOwner) return null;

  return (
    <Menu placement={'bottom-start'} isLazy>
      <MenuButton
        as={IconButton}
        aria-label={t('common:More')}
        icon={<MyIcon name={'more'} w={'16px'} />}
        w={'28px'}
        minW={'28px'}
        h={'28px'}
        flexShrink={0}
        variant={'ghost'}
        borderRadius={'7px'}
        color={'#64748B'}
        _hover={{ bg: '#EFF6FF', color: '#2563EB' }}
        _active={{ bg: '#EFF6FF', color: '#2563EB' }}
      />
      <Portal>
        <MenuList
          zIndex={1001}
          minW={'180px'}
          p={2}
          borderRadius={'14px'}
          borderColor={'rgba(37, 99, 235, 0.16)'}
          boxShadow={'0 18px 45px rgba(15, 23, 42, 0.14)'}
          fontSize={'sm'}
          color={'#526075'}
          sx={{ '.chakra-menu__menuitem': { borderRadius: '7px', py: 2, px: 2 } }}
        >
          {hasWritePer && (
            <MenuItem icon={<MyIcon name={'edit'} w={'16px'} />} onClick={onOpenInfoEdit}>
              {t('app:edit_info')}
            </MenuItem>
          )}
          {hasManagePer && (
            <MenuItem icon={<MyIcon name={'key'} w={'16px'} />} onClick={onOpenInfoEdit}>
              {t('app:Role_setting')}
            </MenuItem>
          )}
          {isOwner && (
            <>
              {(hasWritePer || hasManagePer) && <MenuDivider />}
              <MenuItem
                icon={<MyIcon name={'delete'} w={'16px'} />}
                color={'red.600'}
                _focus={{ bg: 'red.50' }}
                onClick={onDelApp}
              >
                {t('common:Delete')}
              </MenuItem>
            </>
          )}
        </MenuList>
      </Portal>
    </Menu>
  );
};

export default React.memo(WorkflowAppMenu);
