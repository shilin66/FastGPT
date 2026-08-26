import React from 'react';
import {
  Box,
  Flex,
  Grid,
  ModalBody,
  ModalFooter,
  type BoxProps,
  type FlexProps,
  type GridProps
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';

export type OmniModalAsideItem = {
  readonly label: React.ReactNode;
  readonly desc?: React.ReactNode;
  readonly icon?: IconNameType;
};

export const OmniModalBody = ({
  icon,
  title,
  desc,
  asideItems = [],
  children,
  minH = ['auto', '440px'],
  maxH = ['72vh', '68vh']
}: {
  readonly icon?: IconNameType;
  readonly title: React.ReactNode;
  readonly desc?: React.ReactNode;
  readonly asideItems?: readonly OmniModalAsideItem[];
  readonly children: React.ReactNode;
  readonly minH?: BoxProps['minH'];
  readonly maxH?: BoxProps['maxH'];
}) => {
  return (
    <ModalBody p={0} bg={'#F8FAFC'}>
      <Grid gridTemplateColumns={['1fr', '240px minmax(0, 1fr)']} minH={minH} maxH={maxH}>
        <Flex
          display={['none', 'flex']}
          flexDirection={'column'}
          p={5}
          bg={'linear-gradient(180deg, rgba(37, 99, 235, 0.08), rgba(248, 250, 252, 0.94))'}
          borderRight={'1px solid'}
          borderRightColor={'rgba(148, 163, 184, 0.22)'}
          overflow={'hidden'}
        >
          <Flex alignItems={'center'} gap={3}>
            {!!icon && (
              <Flex
                alignItems={'center'}
                justifyContent={'center'}
                w={'38px'}
                h={'38px'}
                flexShrink={0}
                borderRadius={'12px'}
                bg={'#2563EB'}
                color={'white'}
                boxShadow={'0 14px 28px rgba(37, 99, 235, 0.22)'}
              >
                <MyIcon name={icon} w={'19px'} />
              </Flex>
            )}
            <Box minW={0}>
              <Box color={'#1E293B'} fontSize={'15px'} fontWeight={800} lineHeight={1.25}>
                {title}
              </Box>
              {!!desc && (
                <Box mt={1} color={'#64748B'} fontSize={'12px'} lineHeight={1.45}>
                  {desc}
                </Box>
              )}
            </Box>
          </Flex>

          {asideItems.length > 0 && (
            <Flex mt={6} flexDirection={'column'} gap={2}>
              {asideItems.map((item, index) => (
                <Flex
                  key={index}
                  gap={2.5}
                  p={3}
                  border={'1px solid'}
                  borderColor={'rgba(37, 99, 235, 0.12)'}
                  borderRadius={'12px'}
                  bg={'rgba(255, 255, 255, 0.7)'}
                >
                  <Flex
                    alignItems={'center'}
                    justifyContent={'center'}
                    w={'24px'}
                    h={'24px'}
                    flexShrink={0}
                    borderRadius={'8px'}
                    bg={'rgba(37, 99, 235, 0.1)'}
                    color={'#2563EB'}
                  >
                    <MyIcon name={item.icon || 'common/check'} w={'14px'} />
                  </Flex>
                  <Box minW={0}>
                    <Box color={'#1E293B'} fontSize={'12px'} fontWeight={800} lineHeight={1.25}>
                      {item.label}
                    </Box>
                    {!!item.desc && (
                      <Box mt={1} color={'#64748B'} fontSize={'11px'} lineHeight={1.35}>
                        {item.desc}
                      </Box>
                    )}
                  </Box>
                </Flex>
              ))}
            </Flex>
          )}

          <Box flex={1} />
        </Flex>

        <Box p={[4, 5]} overflowY={'auto'} minW={0}>
          {children}
        </Box>
      </Grid>
    </ModalBody>
  );
};

export const OmniModalSection = ({
  title,
  desc,
  action,
  children,
  ...props
}: {
  readonly title: React.ReactNode;
  readonly desc?: React.ReactNode;
  readonly action?: React.ReactNode;
  readonly children: React.ReactNode;
} & BoxProps) => {
  return (
    <Box
      bg={'white'}
      border={'1px solid'}
      borderColor={'rgba(37, 99, 235, 0.14)'}
      borderRadius={'14px'}
      boxShadow={'0 12px 30px rgba(15, 23, 42, 0.04)'}
      overflow={'hidden'}
      _notLast={{ mb: 4 }}
      {...props}
    >
      <Flex
        alignItems={'center'}
        justifyContent={'space-between'}
        gap={3}
        px={4}
        py={3}
        bg={'#F8FAFC'}
        borderBottom={'1px solid rgba(148, 163, 184, 0.18)'}
      >
        <Box minW={0}>
          <Box color={'#1E293B'} fontSize={'14px'} fontWeight={800} lineHeight={1.25}>
            {title}
          </Box>
          {!!desc && (
            <Box mt={1} color={'#64748B'} fontSize={'12px'} lineHeight={1.4}>
              {desc}
            </Box>
          )}
        </Box>
        {action}
      </Flex>
      <Box p={4}>{children}</Box>
    </Box>
  );
};

export const OmniModalFooter = ({ children, ...props }: FlexProps) => {
  return (
    <ModalFooter bg={'white'} borderTop={'1px solid rgba(148, 163, 184, 0.22)'} px={5} py={4}>
      <Flex w={'100%'} justifyContent={'flex-end'} gap={3} {...props}>
        {children}
      </Flex>
    </ModalFooter>
  );
};

export const OmniInfoCallout = ({ children }: { readonly children: React.ReactNode }) => {
  return (
    <Flex
      alignItems={'flex-start'}
      gap={2.5}
      p={3}
      mb={4}
      border={'1px solid'}
      borderColor={'rgba(37, 99, 235, 0.14)'}
      borderRadius={'12px'}
      bg={'rgba(37, 99, 235, 0.06)'}
      color={'#334155'}
      fontSize={'13px'}
      lineHeight={1.55}
    >
      <MyIcon name={'common/info'} color={'#2563EB'} w={'18px'} mt={'2px'} flexShrink={0} />
      <Box flex={1}>{children}</Box>
    </Flex>
  );
};

export const OmniToggleRow = ({
  children,
  control,
  ...props
}: FlexProps & { readonly control: React.ReactNode }) => {
  return (
    <Flex
      alignItems={'center'}
      justifyContent={'space-between'}
      gap={4}
      minH={'42px'}
      py={2}
      _notLast={{ borderBottom: '1px solid rgba(148, 163, 184, 0.16)' }}
      {...props}
    >
      <Box minW={0}>{children}</Box>
      <Box flexShrink={0}>{control}</Box>
    </Flex>
  );
};

export const OmniFormGrid = ({ children, ...props }: GridProps) => {
  return (
    <Grid gridTemplateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4} {...props}>
      {children}
    </Grid>
  );
};

export const OmniFieldCard = ({
  children,
  ...props
}: BoxProps & { readonly children: React.ReactNode }) => {
  return (
    <Box
      p={3}
      border={'1px solid rgba(148, 163, 184, 0.2)'}
      borderRadius={'12px'}
      bg={'#FFFFFF'}
      {...props}
    >
      {children}
    </Box>
  );
};
