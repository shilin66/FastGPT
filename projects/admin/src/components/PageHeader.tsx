import { Flex, Heading, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export const PageHeader = ({ title, description, action }: PageHeaderProps) => (
  <Flex minH="56px" align="flex-start" justify="space-between" mb={5}>
    <div>
      <Heading fontSize="22px" letterSpacing="0" color="var(--admin-graphite)">
        {title}
      </Heading>
      {description ? (
        <Text mt={1} fontSize="13px" color="var(--admin-muted)">
          {description}
        </Text>
      ) : null}
    </div>
    {action}
  </Flex>
);
