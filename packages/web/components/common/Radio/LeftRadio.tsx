import React, { useCallback } from 'react';
import { Box, Flex, Grid, type GridProps, HStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import QuestionTip from '../MyTooltip/QuestionTip';

type Props<T> = Omit<GridProps, 'onChange'> & {
  list: {
    title: string | React.ReactNode;
    desc?: string;
    value: T;
    children?: React.ReactNode;
    tooltip?: string;
  }[];
  align?: 'flex-top' | 'center';
  value: T;
  defaultBg?: string;
  activeBg?: string;
  onChange: (e: T) => void;
  isDisabled?: boolean;
  variant?: 'card' | 'workbench' | 'segmented' | 'underline';
};

const LeftRadio = <T = any,>({
  list,
  value,
  align = 'center',
  px = 3.5,
  py = 4,
  gridGap = [3, 5],
  defaultBg = 'myGray.50',
  activeBg = 'primary.50',
  onChange,
  isDisabled = false,
  variant = 'card',
  ...props
}: Props<T>) => {
  const { t } = useTranslation();
  const isInlineVariant = variant === 'segmented' || variant === 'underline';

  const getBoxStyle = useCallback(
    (isActive: boolean) => {
      if (variant === 'underline') {
        return {
          px,
          py,
          borderBottom: '2px solid',
          borderColor: isActive ? 'primary.500' : 'transparent',
          borderRadius: 0,
          bg: 'transparent',
          color: isActive ? 'primary.600' : 'myGray.600',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.6 : 1,
          _hover: isDisabled ? undefined : { color: 'primary.600' }
        };
      }

      const baseStyle = {
        px,
        py,
        border: variant === 'segmented' ? '1px solid' : 'base',
        borderWidth: '1px',
        borderRadius: variant === 'workbench' ? '6px' : 'md'
      };

      if (variant === 'segmented') {
        if (isActive) {
          return {
            ...baseStyle,
            borderColor: 'borderColor.base',
            bg: 'white',
            boxShadow: '0 1px 2px rgba(31, 41, 55, 0.08)',
            cursor: 'pointer',
            opacity: 1
          };
        }
        if (isDisabled) {
          return {
            ...baseStyle,
            borderColor: 'transparent',
            bg: 'transparent',
            color: 'myGray.500',
            cursor: 'not-allowed',
            opacity: 0.6
          };
        }
        return {
          ...baseStyle,
          borderColor: 'transparent',
          bg: 'transparent',
          _hover: { bg: 'white' },
          cursor: 'pointer',
          opacity: 1
        };
      }

      if (isActive) {
        return {
          ...baseStyle,
          borderColor: 'primary.400',
          bg: activeBg,
          boxShadow: variant === 'workbench' ? 'none' : 'focus',
          cursor: 'pointer',
          opacity: 1
        };
      }
      if (isDisabled) {
        return {
          ...baseStyle,
          bg: 'myWhite.300',
          borderColor: 'myGray.200',
          color: 'myGray.500',
          cursor: 'not-allowed',
          opacity: 0.6
        };
      }
      return {
        ...baseStyle,
        bg: defaultBg,
        _hover: { borderColor: 'primary.300' },
        cursor: 'pointer',
        opacity: 1
      };
    },
    [activeBg, defaultBg, isDisabled, px, py, variant]
  );

  return (
    <Grid gridGap={gridGap} fontSize={['sm', 'md']} {...props}>
      {list.map((item) => {
        const isActive = value === item.value;
        return (
          <React.Fragment key={item.value as any}>
            <Box
              position={'relative'}
              userSelect={'none'}
              onClick={() => !isDisabled && onChange(item.value)}
              {...getBoxStyle(isActive)}
            >
              <Flex alignItems={align} justifyContent={isInlineVariant ? 'center' : undefined}>
                {!isInlineVariant && (
                  <Box
                    w={'18px'}
                    h={'18px'}
                    borderWidth={'2.4px'}
                    borderColor={isActive ? 'primary.015' : 'transparent'}
                    borderRadius={'50%'}
                    mr={3}
                  >
                    <Flex
                      w={'100%'}
                      h={'100%'}
                      borderWidth={'1px'}
                      borderRadius={'50%'}
                      alignItems={'center'}
                      justifyContent={'center'}
                      {...(isActive
                        ? {
                            borderColor: 'primary.600',
                            bg: 'primary.1'
                          }
                        : {
                            borderColor: 'borderColor.high',
                            bg: 'transparent'
                          })}
                    >
                      <Box
                        w={'5px'}
                        h={'5px'}
                        borderRadius={'50%'}
                        bg={isActive ? 'primary.600' : 'transparent'}
                      />
                    </Flex>
                  </Box>
                )}
                <Box flex={isInlineVariant ? undefined : '1 0 0'} textAlign={'left'}>
                  {typeof item.title === 'string' ? (
                    <HStack
                      spacing={1}
                      justifyContent={isInlineVariant && !item.desc ? 'center' : undefined}
                      fontWeight={item.desc ? 'medium' : 'normal'}
                      whiteSpace={'nowrap'}
                      fontSize={'sm'}
                      lineHeight={1}
                      color={isActive && isInlineVariant ? 'primary.600' : 'myGray.900'}
                    >
                      <Box mb={item.desc ? 1 : 0}>{t(item.title as any)}</Box>
                      {!!item.tooltip && <QuestionTip label={item.tooltip} color={'myGray.600'} />}
                    </HStack>
                  ) : (
                    item.title
                  )}

                  {!!item.desc && (
                    <Box fontSize={'xs'} mt={1.5} lineHeight={1.2} color={'myGray.600'}>
                      {t(item.desc as any)}
                    </Box>
                  )}
                </Box>
              </Flex>
              {!isInlineVariant && item?.children && (
                <Box mt={4} pt={4} borderTop={'base'} cursor={'default'}>
                  {item?.children}
                </Box>
              )}
            </Box>
            {isInlineVariant && item?.children && (
              <Box
                gridColumn={'1 / -1'}
                mt={2}
                pt={5}
                pb={variant === 'underline' ? 5 : 0}
                borderTop={'base'}
                cursor={'default'}
              >
                {item.children}
              </Box>
            )}
          </React.Fragment>
        );
      })}
    </Grid>
  );
};

export default LeftRadio;
