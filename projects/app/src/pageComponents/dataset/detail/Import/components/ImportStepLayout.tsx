import React, { type ReactNode } from 'react';
import { Box, Flex, type BoxProps, type FlexProps } from '@chakra-ui/react';
import { omniTheme } from '@/web/common/brand/theme';

export const ImportStepLayout = ({
  eyebrow,
  title,
  description,
  headerActions,
  children,
  footer,
  bodyProps,
  contentProps,
  variant = 'default'
}: {
  eyebrow: string;
  title: string;
  description?: string;
  headerActions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  bodyProps?: BoxProps;
  contentProps?: BoxProps;
  variant?: 'default' | 'boundedWorkbench';
}) => {
  const isBoundedWorkbench = variant === 'boundedWorkbench';
  const contentMaxW = isBoundedWorkbench ? '1440px' : undefined;

  return (
    <Flex h={'100%'} minH={0} flexDirection={'column'} bg={omniTheme.colors.surface}>
      <Flex
        flexShrink={0}
        px={[4, 6]}
        py={[4, 5]}
        borderBottom={'1px solid'}
        borderColor={omniTheme.colors.border}
      >
        <Flex
          w={'100%'}
          maxW={contentMaxW}
          mx={'auto'}
          alignItems={'flex-start'}
          justifyContent={'space-between'}
          gap={5}
        >
          <Box minW={0}>
            <Box
              color={omniTheme.colors.saturatedBlue}
              fontSize={'10px'}
              fontWeight={800}
              lineHeight={1}
              mb={2}
            >
              {eyebrow}
            </Box>
            <Box
              color={omniTheme.colors.text}
              fontSize={['lg', 'xl']}
              fontWeight={700}
              lineHeight={1.25}
            >
              {title}
            </Box>
            {!!description && (
              <Box
                maxW={'72ch'}
                mt={1.5}
                color={omniTheme.colors.muted}
                fontSize={'sm'}
                lineHeight={1.6}
              >
                {description}
              </Box>
            )}
          </Box>
          {headerActions}
        </Flex>
      </Flex>

      <Box flex={1} minH={0} overflowY={'auto'} px={[4, 6]} py={[4, 5]} {...bodyProps}>
        <Box w={'100%'} maxW={contentMaxW} mx={'auto'} {...contentProps}>
          {children}
        </Box>
      </Box>

      {!!footer && (
        <Flex
          flexShrink={0}
          minH={'60px'}
          alignItems={'center'}
          px={[4, 6]}
          py={3}
          borderTop={'1px solid'}
          borderColor={omniTheme.colors.border}
          bg={omniTheme.colors.surface}
        >
          <Box w={'100%'} maxW={contentMaxW} mx={'auto'}>
            {footer}
          </Box>
        </Flex>
      )}
    </Flex>
  );
};

export const ImportStepFooter = ({ children, ...props }: FlexProps) => {
  return (
    <Flex w={'100%'} alignItems={'center'} justifyContent={'flex-end'} gap={3} {...props}>
      {children}
    </Flex>
  );
};
