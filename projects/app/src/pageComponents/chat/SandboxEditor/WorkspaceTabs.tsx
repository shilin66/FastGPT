import React, { useRef } from 'react';
import { Button, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { omniTheme } from '@/web/common/brand/theme';

type WorkspaceView = 'files' | 'ide';

export const WorkspaceTabs = ({
  view,
  onSelect
}: {
  readonly view: WorkspaceView;
  readonly onSelect: (view: WorkspaceView) => void;
}) => {
  const { t } = useTranslation();
  const filesTab = useRef<HTMLButtonElement>(null);
  const ideTab = useRef<HTMLButtonElement>(null);

  return (
    <Flex
      p={1}
      gap={1}
      bg={'myGray.50'}
      border={'1px solid'}
      borderColor={'myGray.100'}
      borderRadius={omniTheme.radii.md}
      role="tablist"
      aria-label={String(t('chat:sandbox_workspace'))}
      flexShrink={0}
      sx={{
        '@container (max-width: 540px)': {
          order: 1,
          w: 'full',
          '& > button': { flex: '1 1 auto', minW: 0, px: 2, gap: 1 },
          '& > button > svg': { display: 'none' }
        }
      }}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next =
          event.key === 'Home'
            ? 'files'
            : event.key === 'End'
              ? 'ide'
              : view === 'files'
                ? 'ide'
                : 'files';
        onSelect(next);
        (next === 'files' ? filesTab : ideTab).current?.focus();
      }}
    >
      {(['files', 'ide'] as const).map((value) => (
        <Button
          key={value}
          id={`sandbox-${value}-tab`}
          ref={value === 'files' ? filesTab : ideTab}
          tabIndex={view === value ? 0 : -1}
          aria-controls={`sandbox-${value}-view`}
          role="tab"
          aria-selected={view === value}
          size={'sm'}
          variant={'unstyled'}
          display={'inline-flex'}
          alignItems={'center'}
          gap={2}
          px={3}
          h={7}
          fontSize={'xs'}
          fontWeight={view === value ? 600 : 500}
          color={view === value ? 'primary.600' : 'myGray.600'}
          bg={view === value ? 'white' : 'transparent'}
          borderRadius={omniTheme.radii.sm}
          boxShadow={view === value ? '0 1px 3px rgba(31, 41, 55, 0.1)' : 'none'}
          transition={omniTheme.motion.control}
          _hover={{ color: 'primary.600', bg: view === value ? 'white' : 'myGray.100' }}
          _focusVisible={{
            outline: '2px solid',
            outlineColor: 'primary.400',
            outlineOffset: '2px'
          }}
          onClick={() => onSelect(value)}
        >
          <MyIcon name={value === 'files' ? 'file/fill/folder' : 'code'} w={4} h={4} />
          {t(value === 'files' ? 'chat:sandbox_files' : 'chat:sandbox_ide')}
        </Button>
      ))}
    </Flex>
  );
};
