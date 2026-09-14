import React, { type ReactNode } from 'react';
import { FormLabel } from '@chakra-ui/react';
import { omniTheme } from '@/web/common/brand/theme';

const LoginFieldLabel = ({ children, isPc }: { children: ReactNode; isPc: boolean }) => (
  <FormLabel
    display={isPc ? 'block' : 'none'}
    mb="6px"
    color={omniTheme.login.label}
    fontSize="11px"
    fontWeight={650}
    lineHeight="15px"
  >
    {children}
  </FormLabel>
);

export default LoginFieldLabel;
