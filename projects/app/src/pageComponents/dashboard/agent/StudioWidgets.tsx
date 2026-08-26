import React, { type ReactNode } from 'react';
import { Box, Flex, Grid } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

export const studioColors = {
  ink: '#17202A',
  muted: '#667085',
  line: '#D9E1EA',
  bg: '#F6F8FB',
  surface: '#FFFFFF',
  soft: '#F9FBFD',
  workflow: '#2563EB',
  agent: '#7C3AED',
  knowledge: '#0891B2',
  tool: '#D97706',
  graphite: '#334155'
};

export type StudioLaneType = {
  icon: string;
  title: string;
  desc: string;
  color: string;
  onClick?: () => void;
};

export type StudioContextItemType = {
  label: string;
  value?: string | number;
  color: string;
};

export const studioPageBg = {
  bg: studioColors.bg,
  bgImage:
    'radial-gradient(circle at 1px 1px, rgba(37, 99, 235, 0.10) 1px, transparent 0), linear-gradient(180deg, #F8FAFC 0%, #F3F6FA 100%)',
  bgSize: '24px 24px, 100% 100%'
};

export const StudioHeader = ({
  menuIcon,
  title,
  subtitle,
  search,
  actions,
  accentColor = studioColors.workflow
}: {
  menuIcon?: ReactNode;
  title: string;
  subtitle: string;
  search?: ReactNode;
  actions?: ReactNode;
  accentColor?: string;
}) => {
  return (
    <Box
      position={'relative'}
      overflow={'hidden'}
      bg={studioColors.surface}
      border={'1px solid'}
      borderColor={studioColors.line}
      borderRadius={'16px'}
      px={[4, 5]}
      py={[4, 5]}
      boxShadow={'0 18px 48px -36px rgba(23, 32, 42, 0.34)'}
    >
      <Box position={'absolute'} left={0} top={0} bottom={0} w={'4px'} bg={accentColor} />
      <Box
        position={'absolute'}
        right={5}
        top={4}
        w={'190px'}
        h={'54px'}
        pointerEvents={'none'}
        opacity={0.42}
      >
        <Box
          position={'absolute'}
          top={'16px'}
          left={0}
          right={'34px'}
          h={'1px'}
          bg={accentColor}
        />
        <Box
          position={'absolute'}
          top={'16px'}
          right={'34px'}
          w={'1px'}
          h={'22px'}
          bg={accentColor}
        />
        <Box
          position={'absolute'}
          top={'37px'}
          right={0}
          left={'82px'}
          h={'1px'}
          bg={accentColor}
        />
        {[0, 82, 154].map((left) => (
          <Box
            key={left}
            position={'absolute'}
            top={left === 154 ? '31px' : '10px'}
            left={`${left}px`}
            w={'13px'}
            h={'13px'}
            border={'2px solid'}
            borderColor={accentColor}
            borderRadius={'full'}
            bg={'white'}
          />
        ))}
      </Box>

      <Flex
        gap={4}
        alignItems={['stretch', 'center']}
        flexDirection={['column', 'row']}
        pr={[0, 8]}
      >
        <Flex alignItems={'center'} minW={0} gap={3} flex={'1 1 auto'}>
          {menuIcon}
          <Box minW={0}>
            <Box
              color={studioColors.ink}
              fontSize={['18px', '22px']}
              fontWeight={800}
              lineHeight={1.2}
            >
              {title}
            </Box>
            <Box mt={1} color={studioColors.muted} fontSize={'sm'} lineHeight={1.45}>
              {subtitle}
            </Box>
          </Box>
        </Flex>
        {search && (
          <Box flex={'0 1 320px'} minW={['100%', '240px']}>
            {search}
          </Box>
        )}
        {actions && (
          <Flex gap={2} flexShrink={0} alignItems={'center'} flexWrap={'wrap'}>
            {actions}
          </Flex>
        )}
      </Flex>
    </Box>
  );
};

export const CreationLanes = ({ lanes }: { lanes: StudioLaneType[] }) => {
  return (
    <Grid mt={4} templateColumns={['1fr', 'repeat(3, minmax(0, 1fr))']} gap={3}>
      {lanes.map((lane) => (
        <Flex
          key={lane.title}
          alignItems={'center'}
          gap={3}
          bg={studioColors.surface}
          border={'1px solid'}
          borderColor={'rgba(217, 225, 234, 0.92)'}
          borderRadius={'14px'}
          px={4}
          py={3}
          minH={'78px'}
          cursor={lane.onClick ? 'pointer' : 'default'}
          transition={'all 0.18s ease'}
          position={'relative'}
          overflow={'hidden'}
          onClick={lane.onClick}
          _hover={
            lane.onClick
              ? {
                  transform: 'translateY(-1px)',
                  borderColor: lane.color,
                  boxShadow: '0 16px 40px -30px rgba(23, 32, 42, 0.42)'
                }
              : undefined
          }
        >
          <Box position={'absolute'} left={0} top={0} bottom={0} w={'3px'} bg={lane.color} />
          <Flex
            w={'38px'}
            h={'38px'}
            borderRadius={'12px'}
            alignItems={'center'}
            justifyContent={'center'}
            bg={`${lane.color}14`}
            color={lane.color}
            flexShrink={0}
          >
            <MyIcon name={lane.icon as any} w={'20px'} color={lane.color} />
          </Flex>
          <Box minW={0}>
            <Box
              color={studioColors.ink}
              fontWeight={700}
              fontSize={'sm'}
              className={'textEllipsis'}
            >
              {lane.title}
            </Box>
            <Box
              mt={1}
              color={studioColors.muted}
              fontSize={'xs'}
              lineHeight={1.35}
              className={'textEllipsis2'}
            >
              {lane.desc}
            </Box>
          </Box>
        </Flex>
      ))}
    </Grid>
  );
};

export const ContextRail = ({
  title,
  items
}: {
  title: string;
  items: StudioContextItemType[];
}) => {
  return (
    <Box
      display={['none', 'block']}
      w={'232px'}
      flexShrink={0}
      bg={'rgba(255, 255, 255, 0.78)'}
      border={'1px solid'}
      borderColor={studioColors.line}
      borderRadius={'16px'}
      p={4}
      alignSelf={'flex-start'}
      position={'sticky'}
      top={0}
    >
      <Box fontSize={'12px'} fontWeight={800} color={studioColors.ink} letterSpacing={'0.04em'}>
        {title}
      </Box>
      <Flex mt={3} direction={'column'} gap={2}>
        {items.map((item) => (
          <Flex
            key={item.label}
            alignItems={'center'}
            justifyContent={'space-between'}
            gap={3}
            px={3}
            py={2.5}
            borderRadius={'10px'}
            bg={studioColors.soft}
            border={'1px solid'}
            borderColor={'rgba(217, 225, 234, 0.75)'}
          >
            <Flex alignItems={'center'} gap={2} minW={0}>
              <Box w={'3px'} h={'18px'} borderRadius={'full'} bg={item.color} flexShrink={0} />
              <Box
                color={studioColors.muted}
                fontSize={'12px'}
                fontWeight={600}
                className={'textEllipsis'}
              >
                {item.label}
              </Box>
            </Flex>
            {item.value !== undefined && (
              <Box color={studioColors.ink} fontSize={'12px'} fontWeight={800}>
                {item.value}
              </Box>
            )}
          </Flex>
        ))}
      </Flex>
    </Box>
  );
};
