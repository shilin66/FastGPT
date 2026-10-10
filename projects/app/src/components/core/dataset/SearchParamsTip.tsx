import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, Flex, Grid, Table, Thead, Tbody, Tr, Th, Td, TableContainer } from '@chakra-ui/react';
import {
  DatasetSearchModeEnum,
  DatasetSearchModeMap
} from '@fastgpt/global/core/dataset/constants';
import { useTranslation } from 'next-i18next';
import React, { useMemo } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getWebLLMModel } from '@/web/common/system/utils';
import { omniTheme } from '@/web/common/brand/theme';

const SearchParamsTip = ({
  searchMode,
  similarity = 0,
  limit = 5000,
  responseEmptyText,
  usingReRank = false,
  usingExtensionQuery,
  queryExtensionModel,
  variant = 'table'
}: {
  searchMode: `${DatasetSearchModeEnum}`;
  similarity?: number;
  limit?: number;
  responseEmptyText?: string;
  usingReRank?: boolean;
  usingExtensionQuery?: boolean;
  queryExtensionModel?: string;
  variant?: 'table' | 'summary';
}) => {
  const { t } = useTranslation();
  const { reRankModelList } = useSystemStore();

  const hasReRankModel = reRankModelList.length > 0;
  const hasEmptyResponseMode = responseEmptyText !== undefined;
  const hasSimilarityMode = usingReRank || searchMode === DatasetSearchModeEnum.embedding;

  const extensionModelName = useMemo(
    () => (usingExtensionQuery ? getWebLLMModel(queryExtensionModel)?.name : ''),
    [usingExtensionQuery, queryExtensionModel]
  );

  if (variant === 'summary') {
    const stateLabel = (enabled: boolean) =>
      t(enabled ? 'app:agent_config_feature_enabled' : 'app:agent_config_feature_disabled');
    const fields = [
      {
        label: t('common:core.dataset.search.search mode'),
        value: t(DatasetSearchModeMap[searchMode].title)
      },
      { label: t('common:max_quote_tokens'), value: limit.toLocaleString('en-US') },
      {
        label: t('common:min_similarity'),
        value: hasSimilarityMode ? similarity : t('common:core.dataset.search.Nonsupport')
      },
      ...(hasReRankModel
        ? [{ label: t('common:core.dataset.search.ReRank'), value: stateLabel(usingReRank) }]
        : []),
      {
        label: t('common:core.module.template.Query extension'),
        value: extensionModelName || stateLabel(false)
      },
      ...(hasEmptyResponseMode
        ? [
            {
              label: t('common:core.dataset.search.Empty result response'),
              value: stateLabel(!!responseEmptyText)
            }
          ]
        : [])
    ];

    return (
      <Grid
        as={'dl'}
        gridTemplateColumns={'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))'}
        gap={3}
        p={3}
        minW={0}
        bg={omniTheme.colors.pageBg}
        border={'1px solid'}
        borderColor={omniTheme.colors.border}
        borderRadius={omniTheme.radii.md}
      >
        {fields.map(({ label, value }) => (
          <Box key={label} minW={0}>
            <Box
              as={'dt'}
              fontSize={omniTheme.typography.agentCaption}
              color={omniTheme.colors.muted}
            >
              {label}
            </Box>
            <Box
              as={'dd'}
              mt={1}
              fontSize={omniTheme.typography.agentBody}
              fontWeight={600}
              color={omniTheme.colors.graphite}
              overflowWrap={'anywhere'}
            >
              {value}
            </Box>
          </Box>
        ))}
      </Grid>
    );
  }

  return (
    <TableContainer
      bg={'primary.50'}
      borderRadius={'lg'}
      borderWidth={'1px'}
      borderColor={'primary.1'}
      sx={{
        '&::-webkit-scrollbar': {
          height: '6px',
          borderRadius: '4px'
        },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: 'myGray.250 !important',
          '&:hover': {
            backgroundColor: 'myGray.300 !important'
          }
        }
      }}
    >
      <Table fontSize={'xs'} overflow={'overlay'}>
        <Thead>
          <Tr bg={'transparent !important'}>
            <Th fontSize={'mini'}>{t('common:core.dataset.search.search mode')}</Th>
            <Th fontSize={'mini'}>{t('common:max_quote_tokens')}</Th>
            <Th fontSize={'mini'}>{t('common:min_similarity')}</Th>
            {hasReRankModel && <Th fontSize={'mini'}>{t('common:core.dataset.search.ReRank')}</Th>}
            <Th fontSize={'mini'}>{t('common:core.module.template.Query extension')}</Th>
            {hasEmptyResponseMode && (
              <Th fontSize={'mini'}>{t('common:core.dataset.search.Empty result response')}</Th>
            )}
          </Tr>
        </Thead>
        <Tbody>
          <Tr color={'myGray.800'}>
            <Td pt={0} pb={2}>
              <Flex alignItems={'center'}>
                <MyIcon
                  name={DatasetSearchModeMap[searchMode]?.icon as any}
                  w={'12px'}
                  mr={'1px'}
                />
                {t(DatasetSearchModeMap[searchMode]?.title as any)}
              </Flex>
            </Td>
            <Td pt={0} pb={2}>
              {limit}
            </Td>
            <Td pt={0} pb={2}>
              {hasSimilarityMode ? similarity : t('common:core.dataset.search.Nonsupport')}
            </Td>
            {hasReRankModel && (
              <Td pt={0} pb={2}>
                {usingReRank ? '✅' : '❌'}
              </Td>
            )}
            <Td pt={0} pb={2} fontSize={'mini'}>
              {extensionModelName || '❌'}
            </Td>
            {hasEmptyResponseMode && <Th>{responseEmptyText !== '' ? '✅' : '❌'}</Th>}
          </Tr>
        </Tbody>
      </Table>
    </TableContainer>
  );
};

export default React.memo(SearchParamsTip);
