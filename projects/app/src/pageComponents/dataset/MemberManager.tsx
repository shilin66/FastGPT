import { Box, Flex, IconButton } from '@chakra-ui/react';
import React from 'react';
import CollaboratorContextProvider, {
  type MemberManagerInputPropsType
} from '@/components/support/permission/MemberManager/context';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { omniTheme } from '@/web/common/brand/theme';

function MemberManager({ managePer }: { managePer: MemberManagerInputPropsType }) {
  const { t } = useTranslation();
  return (
    <Box
      overflow={'hidden'}
      borderWidth={'1px'}
      borderStyle={'solid'}
      borderColor={omniTheme.colors.border}
      borderRadius={omniTheme.radii.md}
      bg={omniTheme.colors.surface}
    >
      <CollaboratorContextProvider {...managePer}>
        {({ MemberListCard, onOpenManageModal }) => {
          return (
            <>
              <Flex
                h={'48px'}
                px={3.5}
                align={'center'}
                justify={'space-between'}
                borderBottomWidth={'1px'}
                borderBottomStyle={'solid'}
                borderBottomColor={omniTheme.colors.border}
              >
                <Flex align={'center'} minW={0}>
                  <Flex
                    w={'30px'}
                    h={'30px'}
                    align={'center'}
                    justify={'center'}
                    borderRadius={omniTheme.radii.sm}
                    bg={omniTheme.colors.saturatedBlueSoft}
                    color={omniTheme.colors.saturatedBlue}
                    flexShrink={0}
                  >
                    <MyIcon name={'common/user'} w={'15px'} />
                  </Flex>
                  <Box ml={2.5} color={omniTheme.colors.text} fontSize={'12px'} fontWeight={700}>
                    {t('common:permission.Collaborator')}
                  </Box>
                </Flex>
                <IconButton
                  aria-label={t('common:permission.Manage')}
                  icon={<MyIcon name={'common/setting'} w={'14px'} />}
                  size={'smSquare'}
                  variant={'whiteBase'}
                  borderRadius={omniTheme.radii.sm}
                  onClick={onOpenManageModal}
                />
              </Flex>
              <MemberListCard
                minH={'70px'}
                p={3}
                bg={'transparent'}
                tagStyle={{
                  px: 2,
                  py: 1,
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: omniTheme.colors.border,
                  borderRadius: omniTheme.radii.sm,
                  bg: omniTheme.colors.sidebarBg,
                  color: omniTheme.colors.text
                }}
              />
            </>
          );
        }}
      </CollaboratorContextProvider>
    </Box>
  );
}

export default MemberManager;
