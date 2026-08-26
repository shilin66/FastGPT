import React from 'react';
import { Button, type ButtonProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { omniTheme } from '@/web/common/brand/theme';

const PublishCreateButton = ({ children, ...props }: ButtonProps) => {
  return (
    <Button
      h={'34px'}
      minH={'34px'}
      px={3.5}
      borderRadius={omniTheme.radii.md}
      bg={omniTheme.colors.saturatedBlue}
      color={'white'}
      fontSize={'13px'}
      fontWeight={800}
      iconSpacing={1.5}
      leftIcon={<MyIcon name={'common/addLight'} w={'14px'} />}
      boxShadow={omniTheme.shadows.active}
      transition={'background-color .18s ease, box-shadow .18s ease'}
      _hover={{
        bg: omniTheme.colors.saturatedBlueHover,
        boxShadow: '0 10px 24px -14px rgba(37, 99, 235, 0.7)'
      }}
      _active={{
        bg: omniTheme.colors.graphite
      }}
      _focusVisible={{
        boxShadow: `0 0 0 3px ${omniTheme.colors.saturatedBlueSoft}`
      }}
      _disabled={{
        bg: omniTheme.colors.saturatedBlueSoft,
        color: omniTheme.colors.saturatedBlue,
        boxShadow: 'none',
        cursor: 'not-allowed',
        opacity: 1,
        _hover: {
          bg: omniTheme.colors.saturatedBlueSoft,
          boxShadow: 'none'
        }
      }}
      {...props}
    >
      {children}
    </Button>
  );
};

export default PublishCreateButton;
