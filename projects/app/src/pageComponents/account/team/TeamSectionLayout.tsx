import { Box, Flex } from '@chakra-ui/react';
import { type ReactNode } from 'react';
import { omniTheme } from '@/web/common/brand/theme';

type TeamSectionLayoutProps = {
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
};

export const TeamSectionLayout = ({
  title,
  description,
  actions,
  toolbar,
  children
}: TeamSectionLayoutProps) => {
  return (
    <Flex h="100%" minW={0} flexDirection="column" bg={omniTheme.colors.surface}>
      <Flex
        minH="64px"
        px={{ base: 4, md: 5 }}
        py={2.5}
        align="center"
        justify="space-between"
        flexWrap={{ base: 'wrap', md: 'nowrap' }}
        gap={3}
        borderBottom="1px solid"
        borderColor={omniTheme.colors.border}
      >
        <Box minW={0}>
          <Box color={omniTheme.colors.text} fontSize="18px" fontWeight={700} lineHeight="24px">
            {title}
          </Box>
          <Box mt={0.5} color={omniTheme.colors.muted} fontSize="12px" lineHeight="18px">
            {description}
          </Box>
        </Box>
        {actions && (
          <Flex
            minW={0}
            w={{ base: '100%', md: 'auto' }}
            flexShrink={{ base: 1, md: 0 }}
            align="center"
            justify="flex-end"
            flexWrap={{ base: 'wrap', md: 'nowrap' }}
            gap={2}
          >
            {actions}
          </Flex>
        )}
      </Flex>

      {toolbar && (
        <Flex
          minH="56px"
          px={{ base: 4, md: 5 }}
          py={2.5}
          align="center"
          justify="space-between"
          gap={3}
          bg={omniTheme.colors.pageBg}
          borderBottom="1px solid"
          borderColor={omniTheme.colors.border}
        >
          {toolbar}
        </Flex>
      )}

      <Flex flex={1} minH={0} minW={0} overflow="hidden" flexDirection="column">
        {children}
      </Flex>
    </Flex>
  );
};
