import React from 'react';
import {
  Button,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuItemOption,
  MenuList,
  MenuOptionGroup,
  Portal
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

type Props = {
  onExport: (mode: 'copy' | 'json') => Promise<boolean | undefined>;
  filterSensitiveInfo: boolean;
  onFilterSensitiveInfoChange: (value: boolean) => void;
};

const ExportConfigToolbar = ({
  onExport,
  filterSensitiveInfo,
  onFilterSensitiveInfoChange
}: Props) => {
  const { t } = useTranslation();

  return (
    <Menu placement={'bottom-end'} closeOnSelect={false} isLazy>
      {({ onClose }) => (
        <>
          <MenuButton
            as={Button}
            h={'34px'}
            px={3}
            borderRadius={'7px'}
            fontSize={'12px'}
            fontWeight={800}
            variant={'whiteBase'}
            border={'1px solid #DFE5EE'}
            bg={'white'}
            color={'#526075'}
            _hover={{ bg: '#EFF6FF', color: '#2563EB' }}
            _active={{ bg: '#EFF6FF', color: '#2563EB' }}
            leftIcon={<MyIcon name={'export'} w={'15px'} />}
            rightIcon={<MyIcon name={'core/chat/chevronDown'} w={'12px'} />}
          >
            {t('app:export_configs')}
          </MenuButton>
          <Portal>
            <MenuList
              zIndex={1001}
              minW={'240px'}
              p={2}
              borderRadius={'14px'}
              borderColor={'rgba(37, 99, 235, 0.16)'}
              boxShadow={'0 18px 45px rgba(15, 23, 42, 0.14)'}
              color={'#526075'}
              fontSize={'sm'}
              sx={{ '.chakra-menu__menuitem': { borderRadius: '7px', py: 2, px: 2 } }}
            >
              <MenuItem
                icon={<MyIcon name={'copy'} w={'16px'} />}
                onClick={async () => {
                  if (await onExport('copy')) onClose();
                }}
              >
                {t('common:copy_to_clipboard')}
              </MenuItem>
              <MenuItem
                icon={<MyIcon name={'configmap'} w={'16px'} />}
                onClick={async () => {
                  if (await onExport('json')) onClose();
                }}
              >
                {t('common:export_to_json')}
              </MenuItem>
              <MenuDivider />
              <MenuOptionGroup
                type={'checkbox'}
                value={filterSensitiveInfo ? ['filter'] : []}
                onChange={(value) =>
                  onFilterSensitiveInfoChange(Array.isArray(value) && value.includes('filter'))
                }
              >
                <MenuItemOption value={'filter'}>
                  {t('common:filter_sensitive_info')}
                  <QuestionTip ml={2} label={t('common:filter_sensitive_info_tip')} />
                </MenuItemOption>
              </MenuOptionGroup>
            </MenuList>
          </Portal>
        </>
      )}
    </Menu>
  );
};

export default React.memo(ExportConfigToolbar);
