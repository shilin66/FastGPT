import React, { useState } from 'react';
import {
  Flex,
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Td,
  Tbody,
  Progress,
  IconButton,
  Box
} from '@chakra-ui/react';
import { type ImportSourceItemType } from '@/web/core/dataset/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { omniTheme } from '@/web/common/brand/theme';

export const RenderUploadFiles = ({
  files,
  setFiles,
  variant = 'default'
}: {
  files: ImportSourceItemType[];
  setFiles: React.Dispatch<React.SetStateAction<ImportSourceItemType[]>>;
  variant?: 'default' | 'integrated';
}) => {
  const { t } = useTranslation();
  const isIntegrated = variant === 'integrated';

  return files.length > 0 ? (
    <TableContainer
      mt={isIntegrated ? 0 : 5}
      overflowX={'auto'}
      overflowY={'hidden'}
      border={isIntegrated ? 'none' : '1px solid'}
      borderColor={omniTheme.colors.border}
      borderRadius={isIntegrated ? 0 : omniTheme.radii.md}
    >
      <Table variant={'simple'} fontSize={'sm'} draggable={false}>
        <Thead draggable={false}>
          <Tr bg={omniTheme.colors.pageBg}>
            <Th
              h={'40px'}
              py={0}
              borderBottomColor={omniTheme.colors.border}
              color={omniTheme.colors.muted}
              fontSize={'xs'}
              textTransform={'none'}
              letterSpacing={0}
            >
              {t('file:file_name')}
            </Th>
            <Th
              w={'300px'}
              h={'40px'}
              py={0}
              borderBottomColor={omniTheme.colors.border}
              color={omniTheme.colors.muted}
              fontSize={'xs'}
              textTransform={'none'}
              letterSpacing={0}
            >
              {t('common:core.dataset.import.Upload file progress')}
            </Th>
            <Th
              w={'160px'}
              h={'40px'}
              py={0}
              borderBottomColor={omniTheme.colors.border}
              color={omniTheme.colors.muted}
              fontSize={'xs'}
              textTransform={'none'}
              letterSpacing={0}
            >
              {t('file:file_size')}
            </Th>
            <Th
              w={'76px'}
              h={'40px'}
              py={0}
              borderBottomColor={omniTheme.colors.border}
              color={omniTheme.colors.muted}
              fontSize={'xs'}
              textAlign={'right'}
              textTransform={'none'}
              letterSpacing={0}
            >
              {t('common:Action')}
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {files.map((item) => (
            <Tr key={item.id} _hover={{ bg: omniTheme.colors.pageBg }}>
              <Td h={'64px'} py={2.5} borderBottomColor={omniTheme.colors.border}>
                <Flex alignItems={'center'}>
                  <Flex
                    w={'30px'}
                    h={'30px'}
                    flexShrink={0}
                    alignItems={'center'}
                    justifyContent={'center'}
                    mr={2.5}
                    borderRadius={omniTheme.radii.sm}
                    bg={omniTheme.colors.saturatedBlueSoft}
                  >
                    <MyIcon
                      name={item.icon as any}
                      w={'16px'}
                      color={omniTheme.colors.saturatedBlue}
                    />
                  </Flex>
                  <Box
                    maxW={'48vw'}
                    overflow={'hidden'}
                    textOverflow={'ellipsis'}
                    whiteSpace={'nowrap'}
                    color={omniTheme.colors.text}
                    fontWeight={600}
                  >
                    {item.sourceName}
                  </Box>
                </Flex>
              </Td>
              <Td h={'64px'} py={2.5} borderBottomColor={omniTheme.colors.border}>
                {item.errorMsg ? (
                  <MyTooltip label={item.errorMsg}>
                    <MyTag colorSchema={'red'}>
                      <Box mr={1}>{t('common:Error')}</Box>
                      <MyIcon name={'help'} w={'0.9rem'} color={'red.500'} />
                    </MyTag>
                  </MyTooltip>
                ) : (
                  <Flex alignItems={'center'} fontSize={'xs'}>
                    <Progress
                      value={item.uploadedFileRate}
                      h={'6px'}
                      w={'100%'}
                      maxW={'210px'}
                      size="sm"
                      borderRadius={'4px'}
                      colorScheme={(item.uploadedFileRate || 0) >= 100 ? 'green' : 'blue'}
                      bg={omniTheme.colors.border}
                      mr={2}
                    />
                    {`${item.uploadedFileRate}%`}
                  </Flex>
                )}
              </Td>
              <Td h={'64px'} py={2.5} borderBottomColor={omniTheme.colors.border}>
                {item.sourceSize}
              </Td>
              <Td
                h={'64px'}
                py={2.5}
                borderBottomColor={omniTheme.colors.border}
                textAlign={'right'}
              >
                {!item.isUploading && (
                  <IconButton
                    variant={'ghost'}
                    size={'sm'}
                    icon={<MyIcon name={'delete'} w={'14px'} />}
                    aria-label={t('common:Delete')}
                    color={omniTheme.colors.muted}
                    _hover={{ color: 'red.600', bg: 'red.50' }}
                    onClick={() => {
                      setFiles((state) => state.filter((file) => file.id !== item.id));
                    }}
                  />
                )}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  ) : null;
};

export default RenderUploadFiles;
