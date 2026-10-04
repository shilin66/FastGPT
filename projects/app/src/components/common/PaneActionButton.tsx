import React from 'react';
import { IconButton, type IconButtonProps } from '@chakra-ui/react';
import { omniTheme } from '@/web/common/brand/theme';

type PaneActionIcon = 'refresh' | 'expand' | 'restore' | 'close' | 'back' | 'collapse';

const paths: Record<PaneActionIcon, React.ReactNode> = {
  refresh: (
    <>
      <path d="M16.5 8.5A6.5 6.5 0 1 0 17 11" />
      <path d="M16.5 4.5v4h-4" />
    </>
  ),
  expand: (
    <>
      <rect x="9" y="3.5" width="9" height="13" rx="1.5" />
      <path d="M6.5 7 3 10l3.5 3M3 10h6" />
    </>
  ),
  restore: (
    <>
      <rect x="2" y="3.5" width="9" height="13" rx="1.5" />
      <path d="m13.5 7 3.5 3-3.5 3M11 10h6" />
    </>
  ),
  close: <path d="M5 5l10 10M15 5 5 15" />,
  back: (
    <>
      <path d="m8 5-5 5 5 5M3 10h10" />
      <path d="M13 5h4v10h-4" />
    </>
  ),
  collapse: (
    <>
      <rect x="2" y="3.5" width="16" height="13" rx="1.5" />
      <path d="M7.5 3.5v13M13.5 7l-3 3 3 3" />
    </>
  )
};

const PaneActionButton = ({
  action,
  label,
  ...props
}: {
  action: PaneActionIcon;
  label: string;
} & Omit<IconButtonProps, 'aria-label' | 'icon'>) => (
  <IconButton
    aria-label={label}
    title={label}
    icon={
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths[action]}
      </svg>
    }
    size="sm"
    minW="30px"
    w="30px"
    h="30px"
    borderRadius="8px"
    border="1px solid"
    borderColor={action === 'expand' || action === 'restore' ? '#D7E7FF' : omniTheme.colors.border}
    bg={action === 'expand' || action === 'restore' ? '#EFF6FF' : omniTheme.colors.surface}
    color={
      action === 'expand' || action === 'restore'
        ? omniTheme.colors.saturatedBlue
        : omniTheme.colors.muted
    }
    boxShadow="0 1px 2px rgba(18, 38, 63, 0.04)"
    transition={omniTheme.motion.control}
    _hover={{
      bg: action === 'close' ? '#FFF1F2' : '#EAF2FF',
      borderColor: action === 'close' ? '#FECDD3' : '#A9C7FF',
      color: action === 'close' ? '#BE123C' : omniTheme.colors.saturatedBlue
    }}
    _active={{ bg: omniTheme.colors.saturatedBlueSoft }}
    _focusVisible={{ boxShadow: `0 0 0 2px ${omniTheme.colors.saturatedBlueSoft}` }}
    {...props}
  />
);

export default PaneActionButton;
