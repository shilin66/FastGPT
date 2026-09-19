import React, { useState } from 'react';
import { Box, Button, Flex, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { SkillWorkspaceFileResponse } from '@fastgpt/global/openapi/core/agentSkills/files';
import { workspaceLayout } from '../workspaceLayout';

type Entry = Extract<SkillWorkspaceFileResponse, { action: 'list' }>['files'][number];

const WorkspaceFileTree = ({
  entries,
  selectedPath,
  onOpen
}: {
  entries: Entry[];
  selectedPath?: string;
  onOpen: (path: string) => void;
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const isExpanded = (path: string) => expanded.get(path) ?? !path.includes('/');
  const visibleEntries = entries.filter((entry) => {
    const parts = entry.path.split('/');
    return parts.slice(0, -1).every((_, index) => isExpanded(parts.slice(0, index + 1).join('/')));
  });

  return (
    <Flex
      as="nav"
      aria-label={t('skill:file_tree')}
      w="clamp(200px, 24%, 300px)"
      flexShrink={0}
      minH={0}
      direction="column"
      borderRightWidth="1px"
      borderColor="myGray.200"
      bg="myGray.25"
    >
      <Flex
        px={3}
        h={workspaceLayout.toolbarHeight}
        borderBottomWidth="1px"
        borderColor="myGray.200"
        flexShrink={0}
        align="center"
        justify="space-between"
      >
        <Text fontSize="xs" color="myGray.500" fontWeight="medium">
          {t('skill:file_tree')}
        </Text>
        <Button
          size="xs"
          variant="ghost"
          color="myGray.500"
          isDisabled={
            !entries.some((entry) => entry.type === 'directory' && isExpanded(entry.path))
          }
          onClick={() =>
            setExpanded(
              new Map(
                entries
                  .filter((entry) => entry.type === 'directory')
                  .map((entry) => [entry.path, false])
              )
            )
          }
        >
          {t('skill:file_collapse_all')}
        </Button>
      </Flex>
      <Box flex={1} minH={0} overflowY="auto" px={2} pb={3}>
        <Box as="ul" listStyleType="none" m={0} p={0}>
          {visibleEntries.map((entry) => {
            const directory = entry.type === 'directory';
            const selected = selectedPath === entry.path;
            const parts = entry.path.split('/');
            return (
              <Box as="li" key={entry.path}>
                <Button
                  variant="ghost"
                  size="sm"
                  w="100%"
                  h="32px"
                  my="1px"
                  justifyContent="flex-start"
                  gap={1.5}
                  pl={`${8 + (parts.length - 1) * 14}px`}
                  pr={2}
                  fontSize="xs"
                  fontWeight={selected ? 'medium' : 'normal'}
                  borderRadius="6px"
                  color={selected ? 'primary.700' : 'myGray.700'}
                  bg={selected ? 'primary.50' : 'transparent'}
                  _hover={{ bg: selected ? 'primary.100' : 'myGray.100' }}
                  _focusVisible={{ boxShadow: 'outline' }}
                  title={entry.path}
                  aria-label={entry.path}
                  aria-expanded={directory ? isExpanded(entry.path) : undefined}
                  aria-current={selected ? true : undefined}
                  onClick={() => {
                    if (directory) {
                      setExpanded((current) =>
                        new Map(current).set(
                          entry.path,
                          !(current.get(entry.path) ?? !entry.path.includes('/'))
                        )
                      );
                    } else {
                      onOpen(entry.path);
                    }
                  }}
                >
                  <Box w="12px" flexShrink={0}>
                    {directory && (
                      <MyIcon
                        name={
                          isExpanded(entry.path)
                            ? 'core/chat/chevronDown'
                            : 'core/chat/chevronRight'
                        }
                        w="12px"
                        aria-hidden
                      />
                    )}
                  </Box>
                  <MyIcon
                    name={
                      directory
                        ? 'file/fill/folder'
                        : entry.path.endsWith('.md')
                          ? 'file/markdown'
                          : 'core/app/sandbox/file'
                    }
                    w="16px"
                    flexShrink={0}
                    color={directory ? 'myGray.500' : selected ? 'primary.600' : 'myGray.400'}
                    aria-hidden
                  />
                  <Text isTruncated>{parts.at(-1)}</Text>
                </Button>
              </Box>
            );
          })}
        </Box>
        {!entries.length && (
          <Text px={2} py={4} fontSize="xs" lineHeight="1.8" color="myGray.500">
            {t('skill:file_empty')}
          </Text>
        )}
      </Box>
    </Flex>
  );
};

export default WorkspaceFileTree;
