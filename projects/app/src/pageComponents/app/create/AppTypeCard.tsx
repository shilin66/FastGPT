import React from 'react';
import type { CreateAppType } from '@/pages/dashboard/create';
import type { createAppTypeMap } from '../constants';
import { Box, Button, Flex, Text } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useTranslation } from 'next-i18next';

const AppTypeCard = ({
  selectedAppType,
  onClick,
  option,
  isDisabled
}: {
  selectedAppType: CreateAppType;
  onClick: () => void;
  option: (typeof createAppTypeMap)[CreateAppType];
  isDisabled?: boolean;
}) => {
  const { t } = useTranslation();
  const selected = selectedAppType === option.type;
  return (
    <Button
      type="button"
      variant="unstyled"
      display="flex"
      flexDirection="column"
      alignItems="flex-start"
      textAlign="left"
      whiteSpace="normal"
      h="auto"
      minW={0}
      p={4}
      borderRadius="lg"
      borderWidth="1px"
      borderColor={selected ? 'primary.500' : 'myGray.200'}
      bg={selected ? 'primary.50' : 'white'}
      aria-pressed={selected}
      isDisabled={isDisabled}
      onClick={onClick}
      _hover={{ borderColor: 'primary.400' }}
      _focusVisible={{ outline: '2px solid', outlineColor: 'primary.500', outlineOffset: '3px' }}
    >
      <Flex w="100%" align="center" justify="space-between" mb={3} aria-hidden>
        <Avatar src={option.icon} w={6} color="primary.500" />
        <Box
          w={4}
          h={4}
          borderRadius="full"
          borderWidth="1px"
          borderColor={selected ? 'primary.500' : 'myGray.300'}
          display="grid"
          placeItems="center"
        >
          {selected && <Box w={2} h={2} borderRadius="full" bg="primary.500" />}
        </Box>
      </Flex>
      <Text as="span" fontSize="sm" fontWeight="600" color="myGray.900">
        {t(option.title)}
      </Text>
      <Text as="span" mt={1} fontSize="xs" fontWeight="normal" color="myGray.600" lineHeight="tall">
        {t(option.intro)}
      </Text>
    </Button>
  );
};
export default AppTypeCard;
