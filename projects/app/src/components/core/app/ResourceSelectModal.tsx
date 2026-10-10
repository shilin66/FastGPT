import React from 'react';
import { Box, Flex, type ModalContentProps } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { omniTheme } from '@/web/common/brand/theme';

export const ResourceSelectModal = ({
  title,
  description,
  ...props
}: Omit<React.ComponentProps<typeof MyModal>, 'title'> & {
  title: React.ReactNode;
  description: React.ReactNode;
}) => (
  <MyModal
    isOpen
    isCentered
    w={'1120px'}
    minW={0}
    maxW={'calc(100vw - 32px)'}
    maxH={'calc(100dvh - 64px)'}
    borderRadius={omniTheme.radii.lg}
    title={
      <Box pr={8}>
        <Box fontSize={'md'} fontWeight={600} color={omniTheme.colors.graphite}>
          {title}
        </Box>
        <Box mt={1} fontSize={'xs'} fontWeight={400} color={omniTheme.colors.muted}>
          {description}
        </Box>
      </Box>
    }
    sx={{
      '.chakra-modal__header': {
        background: omniTheme.colors.surface,
        borderColor: omniTheme.colors.border,
        borderRadius: 0,
        padding: '16px 20px'
      },
      '.chakra-modal__body': { background: omniTheme.colors.pageBg },
      '.chakra-modal__footer': {
        background: omniTheme.colors.surface,
        borderTop: '1px solid',
        borderColor: omniTheme.colors.border,
        padding: '12px 20px',
        gap: 3,
        flexShrink: 0
      }
    }}
    {...props}
  />
);

export const resourceListMaxHeight: ModalContentProps['maxH'] = 'min(600px, calc(100dvh - 300px))';

export const ResourceSelectCard = ({
  avatar,
  name,
  description,
  actions,
  meta,
  preview,
  selected = false
}: {
  avatar: React.ReactNode;
  name: React.ReactNode;
  description: React.ReactNode;
  actions: React.ReactNode;
  meta?: React.ReactNode;
  preview?: React.ReactNode;
  selected?: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <Flex
      as={'li'}
      aria-label={typeof name === 'string' ? name : undefined}
      align={'center'}
      gap={3}
      px={3}
      py={2.5}
      minH={'64px'}
      minW={0}
      bg={selected ? 'primary.50' : omniTheme.colors.surface}
      borderWidth={'1px'}
      borderColor={selected ? 'primary.300' : omniTheme.colors.border}
      borderRadius={omniTheme.radii.sm}
      transition={'background-color 160ms ease, border-color 160ms ease'}
      _hover={{
        bg: selected ? 'primary.50' : omniTheme.colors.pageBg,
        borderColor: selected ? 'primary.300' : 'myGray.300'
      }}
    >
      <Flex align={'center'} justify={'center'} w={7} h={7} flexShrink={0}>
        {avatar}
      </Flex>
      <MyTooltip label={preview} isDisabled={!preview} shouldWrapChildren={false}>
        <Box flex={1} minW={0}>
          <Flex align={'center'} gap={2}>
            <Box
              fontSize={'13px'}
              fontWeight={500}
              lineHeight={1.5}
              color={omniTheme.colors.graphite}
              minW={0}
              className={'textEllipsis'}
            >
              {name}
            </Box>
            {selected && (
              <Box fontSize={'10px'} color={'primary.700'} flexShrink={0}>
                {t('app:resource_selected')}
              </Box>
            )}
          </Flex>
          <Box
            mt={0.5}
            fontSize={'xs'}
            color={omniTheme.colors.muted}
            lineHeight={1.5}
            className={'textEllipsis'}
          >
            {description || meta}
          </Box>
        </Box>
      </MyTooltip>
      <Flex gap={1.5} flexShrink={0} align={'center'}>
        {actions}
      </Flex>
    </Flex>
  );
};
