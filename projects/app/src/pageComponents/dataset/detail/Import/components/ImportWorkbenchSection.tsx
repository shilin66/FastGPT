import React, { type ReactNode } from 'react';
import { Box, Grid } from '@chakra-ui/react';
import { omniTheme } from '@/web/common/brand/theme';

const ImportWorkbenchSection = ({
  title,
  description,
  children,
  isFirst = false,
  showDivider = true
}: {
  title: string;
  description?: string;
  children: ReactNode;
  isFirst?: boolean;
  showDivider?: boolean;
}) => {
  return (
    <Grid
      gridTemplateColumns={['minmax(0, 1fr)', '220px minmax(0, 1fr)']}
      gap={[3, 8]}
      pt={isFirst ? 0 : 6}
      pb={showDivider ? 6 : 0}
      borderBottom={showDivider ? '1px solid' : 'none'}
      borderColor={omniTheme.colors.border}
    >
      <Box minW={0}>
        <Box color={omniTheme.colors.text} fontSize={'sm'} fontWeight={700} lineHeight={1.4}>
          {title}
        </Box>
        {!!description && (
          <Box mt={1} color={omniTheme.colors.muted} fontSize={'xs'} lineHeight={1.6}>
            {description}
          </Box>
        )}
      </Box>
      <Box minW={0}>{children}</Box>
    </Grid>
  );
};

export default ImportWorkbenchSection;
