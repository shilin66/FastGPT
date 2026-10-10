import React from 'react';
import { Box, Button, Flex, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';
import { omniTheme } from '@/web/common/brand/theme';

const AgentDatasetConfig = ({
  dataset,
  onOpenParams,
  onOpenSelect,
  onRemove
}: {
  dataset: AppFormEditFormType['dataset'];
  onOpenParams: () => void;
  onOpenSelect: () => void;
  onRemove: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const datasets = dataset.datasets ?? [];

  return (
    <Box py={4} minW={0}>
      <Flex alignItems={'center'} justifyContent={'space-between'} flexWrap={'wrap'} gap={3} mb={3}>
        <Box>
          <Box
            fontSize={omniTheme.typography.agentBody}
            fontWeight={600}
            color={omniTheme.colors.graphite}
          >
            {t('app:agent_config_dataset_count', { count: datasets.length })}
          </Box>
          <Box mt={1} fontSize={omniTheme.typography.agentCaption} color={omniTheme.colors.muted}>
            {t('app:agent_config_dataset_field_desc')}
          </Box>
        </Box>
        <Flex gap={2} flexWrap={'wrap'}>
          <Button
            variant={'whiteBase'}
            size={'sm'}
            leftIcon={<MyIcon name={'edit'} w={3.5} />}
            onClick={onOpenParams}
          >
            {t('app:agent_config_dataset_params')}
          </Button>
          <Button
            variant={'whitePrimary'}
            size={'sm'}
            leftIcon={<MyIcon name={'common/addLight'} w={3.5} />}
            onClick={onOpenSelect}
          >
            {t('app:agent_config_dataset_select')}
          </Button>
        </Flex>
      </Flex>

      {datasets.length === 0 ? (
        <Flex
          alignItems={'center'}
          gap={3}
          p={4}
          bg={omniTheme.colors.pageBg}
          border={'1px dashed'}
          borderColor={omniTheme.colors.border}
          borderRadius={omniTheme.radii.md}
        >
          <MyIcon
            name={'core/dataset/commonDatasetOutline'}
            w={6}
            flexShrink={0}
            color={omniTheme.colors.muted}
          />
          <Box minW={0}>
            <Box
              fontSize={omniTheme.typography.agentBody}
              color={omniTheme.colors.graphite}
              fontWeight={600}
            >
              {t('app:No_selected_dataset')}
            </Box>
            <Box mt={1} fontSize={omniTheme.typography.agentCaption} color={omniTheme.colors.muted}>
              {t('app:agent_config_dataset_empty_desc')}
            </Box>
          </Box>
        </Flex>
      ) : (
        <>
          <Box
            as={'ul'}
            listStyleType={'none'}
            m={0}
            p={0}
            border={'1px solid'}
            borderColor={omniTheme.colors.border}
            borderRadius={omniTheme.radii.md}
            overflow={'hidden'}
            mb={3}
          >
            {datasets.map((item) => (
              <Flex
                as={'li'}
                key={item.datasetId}
                alignItems={'center'}
                gap={3}
                px={3}
                py={2.5}
                borderBottom={'1px solid'}
                borderColor={omniTheme.colors.border}
                _last={{ borderBottom: 0 }}
              >
                <Avatar src={item.avatar} w={7} borderRadius={omniTheme.radii.sm} />
                <Box
                  flex={1}
                  minW={0}
                  fontSize={'sm'}
                  color={omniTheme.colors.graphite}
                  overflowWrap={'anywhere'}
                >
                  {item.name}
                </Box>
                <Flex gap={1} flexShrink={0}>
                  <IconButton
                    as={'a'}
                    href={`/dataset/detail?datasetId=${encodeURIComponent(item.datasetId)}`}
                    target={'_blank'}
                    rel={'noopener noreferrer'}
                    aria-label={String(t('app:agent_config_dataset_view', { name: item.name }))}
                    title={String(t('app:agent_config_dataset_view', { name: item.name }))}
                    variant={'ghost'}
                    size={'sm'}
                    icon={<MyIcon name={'common/viewLight'} w={4} />}
                  />
                  <IconButton
                    aria-label={String(t('app:agent_config_dataset_remove', { name: item.name }))}
                    title={String(t('app:agent_config_dataset_remove', { name: item.name }))}
                    variant={'ghost'}
                    size={'sm'}
                    color={'myGray.500'}
                    _hover={{ bg: 'red.50', color: 'red.600' }}
                    icon={<MyIcon name={'delete'} w={4} />}
                    onClick={() => onRemove(item.datasetId)}
                  />
                </Flex>
              </Flex>
            ))}
          </Box>
          <SearchParamsTip
            variant={'summary'}
            searchMode={dataset.searchMode}
            similarity={dataset.similarity}
            limit={dataset.limit}
            usingReRank={dataset.usingReRank}
            usingExtensionQuery={dataset.datasetSearchUsingExtensionQuery}
            queryExtensionModel={dataset.datasetSearchExtensionModel}
          />
        </>
      )}
    </Box>
  );
};

export default React.memo(AgentDatasetConfig);
