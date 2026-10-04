import React from 'react';
import {
  Box,
  VStack,
  Flex,
  Input,
  InputGroup,
  InputLeftElement,
  Button,
  Text,
  Spinner
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { getIconByFilename } from '../utils';

export type FileItem = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
};

export type TreeNode = FileItem & {
  children?: TreeNode[];
  level: number;
  loaded?: boolean;
};

type Props = {
  filteredTree: TreeNode[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  expandedDirs: Set<string>;
  loadingDirs: Set<string>;
  activeFilePath: string;
  openingFilePath?: string;
  openFile: (path: string) => void;
  toggleDirectory: (node: TreeNode) => void;
  downloadingWorkspace: boolean;
  downloadWorkspace: () => void;
  fullWidth?: boolean;
};

const FileTree = ({
  filteredTree,
  searchQuery,
  setSearchQuery,
  expandedDirs,
  loadingDirs,
  activeFilePath,
  openingFilePath,
  openFile,
  toggleDirectory,
  downloadingWorkspace,
  downloadWorkspace,
  fullWidth = false
}: Props) => {
  const { t } = useTranslation();

  const renderTreeNode = (node: TreeNode): React.ReactNode => {
    const isExpanded = expandedDirs.has(node.path);
    const isLoading = loadingDirs.has(node.path);
    const isActive = activeFilePath === node.path;
    const isOpening = openingFilePath === node.path;

    const shouldShowArrow =
      node.type === 'directory' && (!node.loaded || (node.children && node.children.length > 0));

    return (
      <React.Fragment key={node.path}>
        <Flex
          as={'button'}
          type={'button'}
          w={'full'}
          textAlign={'left'}
          title={node.path}
          aria-expanded={node.type === 'directory' ? isExpanded : undefined}
          aria-current={isActive ? 'true' : undefined}
          aria-busy={isOpening ? true : undefined}
          pl={`${node.level * 16 + 4}px`}
          pr={2}
          py="6px"
          cursor="pointer"
          _hover={{ bg: 'rgba(17, 24, 36, 0.05)' }}
          bg={isActive ? 'rgba(17, 24, 36, 0.05)' : 'transparent'}
          borderRadius="4px"
          _focusVisible={{ boxShadow: 'inset 0 0 0 2px #2563EB' }}
          onClick={() => {
            if (node.type === 'file') {
              openFile(node.path);
            } else {
              toggleDirectory(node);
            }
          }}
          align="center"
          fontSize="12px"
          color={isActive ? 'myGray.600' : 'myGray.600'}
        >
          <Flex justify="center" align="center" w="16px" h="16px">
            {isOpening ? (
              <Spinner size="xs" color="myGray.500" w="12px" h="12px" />
            ) : shouldShowArrow ? (
              isLoading ? (
                <Spinner size="xs" color="primary.400" w="12px" h="12px" />
              ) : (
                <MyIcon
                  name={isExpanded ? 'core/chat/chevronDown' : 'core/chat/chevronRight'}
                  w="16px"
                  color="myGray.500"
                />
              )
            ) : null}
          </Flex>
          <MyIcon
            mr={1}
            ml={1}
            name={node.type === 'directory' ? 'common/folderFill' : getIconByFilename(node.name)}
            w="16px"
            color={node.type === 'directory' ? '#EF7623' : 'myGray.600'}
          />
          <Text
            flexShrink={0}
            whiteSpace="nowrap"
            fontWeight={isActive ? '600' : '400'}
            letterSpacing="0.5px"
          >
            {node.name}
          </Text>
        </Flex>
        {shouldShowArrow && isExpanded && node.children && node.children.map(renderTreeNode)}
      </React.Fragment>
    );
  };

  return (
    <Box
      flex={fullWidth ? 1 : '0 0 224px'}
      w={'full'}
      h={'full'}
      borderRight="1px solid"
      borderColor="myGray.200"
      bg="myGray.25"
      display="flex"
      flexDirection="column"
    >
      <Box p={3}>
        <InputGroup size="sm">
          <InputLeftElement h="32px">
            <MyIcon name="common/searchLight" w="16px" color="myGray.500" />
          </InputLeftElement>
          <Input
            placeholder={t('chat:sandbox_search_files')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            bg="white"
            fontSize="12px"
            h="32px"
            borderRadius="6px"
            borderColor="myGray.200"
            _placeholder={{ color: 'myGray.500' }}
          />
        </InputGroup>
      </Box>

      <Box data-testid="sandbox-file-tree-scroll" flex={1} minH={0} overflow="auto" px={2}>
        <VStack align="stretch" spacing="0" pb={2} w="max-content" minW="full">
          {filteredTree.map(renderTreeNode)}
        </VStack>
      </Box>

      <Button
        m={2}
        variant={'unstyled'}
        bg={'myGray.150'}
        color={'primary.700'}
        fontSize={'12px'}
        fontWeight={'500'}
        leftIcon={<MyIcon name="common/downloadLine" w="16px" />}
        isLoading={downloadingWorkspace}
        onClick={downloadWorkspace}
        display={'flex'}
        alignItems={'center'}
        _disabled={{
          color: 'primary.700',
          bg: 'myGray.150',
          cursor: 'not-allowed',
          _hover: {
            color: 'primary.700',
            bg: 'myGray.150'
          }
        }}
      >
        {t('chat:download_all_files')}
      </Button>
    </Box>
  );
};

export default FileTree;
