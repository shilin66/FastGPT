import type { Dispatch, SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import React from 'react';
import { Box, Flex, Input, InputGroup, InputLeftElement, SimpleGrid } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getAppToolPaths } from '@/web/core/app/api/tool';
import { getAppFolderPath } from '@/web/core/app/api/app';
import FolderPath from '@/components/common/folder/Path';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import ToolTagFilterBox from '@fastgpt/web/components/core/plugin/tool/TagFilterBox';
import type { SystemPluginToolTagType } from '@fastgpt/global/core/plugin/type';

export enum TemplateTypeEnum {
  'basic' = 'basic',
  'systemTools' = 'systemTools',
  'myTools' = 'myTools',
  'agent' = 'agent'
}

export const getNodeTemplateTabs = (t: TFunction) =>
  [
    {
      icon: 'core/modules/basicNode',
      label: t('common:core.module.template.Basic Node'),
      value: TemplateTypeEnum.basic
    },
    {
      icon: 'common/app',
      label: t('app:core.module.template.System Tools'),
      value: TemplateTypeEnum.systemTools
    },
    {
      icon: 'core/app/type/plugin',
      label: t('common:navbar.Tools'),
      value: TemplateTypeEnum.myTools
    },
    {
      icon: 'core/chat/sidebar/star',
      label: t('workflow:template.agent_module'),
      value: TemplateTypeEnum.agent
    }
  ] as const;

export type NodeTemplateListHeaderProps = {
  isPopover?: boolean;
  templateType: TemplateTypeEnum;
  parentId: ParentIdType;
  searchKey: string;
  setSearchKey: Dispatch<SetStateAction<string>>;
  onUpdateTemplateType: (type: TemplateTypeEnum) => void;
  onUpdateParentId: (parentId: ParentIdType) => void;

  selectedTagIds: string[];
  setSelectedTagIds: (e: string[]) => any;
  toolTags: SystemPluginToolTagType[];
};

const NodeTemplateListHeader = ({
  isPopover = false,
  templateType,
  parentId,
  searchKey,
  setSearchKey,
  onUpdateTemplateType,
  onUpdateParentId,
  selectedTagIds,
  setSelectedTagIds,
  toolTags
}: NodeTemplateListHeaderProps) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const router = useRouter();

  // Get paths
  const { data: paths = [] } = useRequest(
    () => {
      if (templateType === TemplateTypeEnum.systemTools)
        return getAppToolPaths({ sourceId: parentId, type: 'current' });
      return getAppFolderPath({ sourceId: parentId, type: 'current' });
    },
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );

  const showToolTag =
    templateType === TemplateTypeEnum.systemTools &&
    selectedTagIds !== undefined &&
    setSelectedTagIds;

  const tabList = getNodeTemplateTabs(t);
  const activeTab = tabList.find((tab) => tab.value === templateType);

  return (
    <Box px={3} mb={showToolTag ? 0.5 : 2} whiteSpace={'nowrap'} overflow={'hidden'}>
      {/* Tabs */}
      {isPopover ? (
        <SimpleGrid columns={2} spacing={1.5}>
          {tabList.map((tab) => {
            const isActive = tab.value === templateType;
            return (
              <Flex
                as={'button'}
                key={tab.value}
                type={'button'}
                alignItems={'center'}
                justifyContent={'center'}
                h={'30px'}
                px={2}
                gap={1.5}
                borderRadius={'7px'}
                border={'1px solid'}
                borderColor={isActive ? '#9DB9FA' : '#DFE5EE'}
                bg={isActive ? '#EFF6FF' : '#F8FAFC'}
                color={isActive ? '#2563EB' : '#667085'}
                fontSize={'12px'}
                fontWeight={800}
                cursor={'pointer'}
                _hover={{ borderColor: '#9DB9FA', color: '#2563EB' }}
                onClick={() => onUpdateTemplateType(tab.value)}
              >
                <MyIcon name={tab.icon} w={'13px'} />
                <Box minW={0} className={'textEllipsis'}>
                  {tab.label}
                </Box>
              </Flex>
            );
          })}
        </SimpleGrid>
      ) : (
        <Flex minH={'46px'} alignItems={'center'}>
          <Box minW={0}>
            <Box color={'#27364A'} fontSize={'13px'} fontWeight={900}>
              {t('workflow:node_templates.title')}
            </Box>
            <Box
              mt={0.5}
              color={'#7A8699'}
              fontSize={'9px'}
              fontWeight={650}
              className={'textEllipsis'}
            >
              {t('workflow:node_templates.drag_tip')}
            </Box>
          </Box>
          <Box ml={'auto'} pl={2} color={'#667085'} fontSize={'10px'} fontWeight={800}>
            {activeTab?.label}
          </Box>
        </Flex>
      )}
      {/* Search */}
      {templateType !== TemplateTypeEnum.basic && (
        <Flex mt={2} alignItems={'center'} gap={2} h={isPopover ? 8 : 10}>
          <InputGroup h={'full'}>
            <InputLeftElement h={'full'} alignItems={'center'} display={'flex'}>
              <MyIcon name={'common/searchLight'} w={'16px'} color={'myGray.500'} ml={3} />
            </InputLeftElement>
            <Input
              h={'full'}
              bg={'#F8FAFC'}
              border={'1px solid rgba(148, 163, 184, 0.22)'}
              borderRadius={'7px'}
              placeholder={
                templateType === TemplateTypeEnum.systemTools
                  ? t('common:search_tool')
                  : t('common:plugin.Search_app')
              }
              value={searchKey}
              onChange={(e) => setSearchKey(e.target.value)}
            />
          </InputGroup>
          <Box flex={1} />
          {!isPopover &&
            (templateType === TemplateTypeEnum.myTools ||
              templateType === TemplateTypeEnum.agent) && (
              <Flex
                alignItems={'center'}
                cursor={'pointer'}
                _hover={{
                  color: 'primary.600'
                }}
                fontSize={'sm'}
                onClick={() => {
                  if (templateType === TemplateTypeEnum.myTools) {
                    router.push('/dashboard/tool');
                  } else {
                    router.push('/dashboard/agent');
                  }
                }}
                gap={1}
                flexShrink={0}
              >
                <Box>{t('common:create')}</Box>
                <MyIcon name={'common/rightArrowLight'} w={'0.8rem'} />
              </Flex>
            )}
          {templateType === TemplateTypeEnum.systemTools && (
            <Flex
              alignItems={'center'}
              cursor={'pointer'}
              _hover={{
                color: 'primary.600'
              }}
              onClick={() => router.push('/dashboard/systemTool')}
              gap={1}
              flexShrink={0}
            >
              <Box fontSize={'sm'}>{t('app:find_more_tools')}</Box>
              <MyIcon name={'common/rightArrowLight'} w={'0.9rem'} />
            </Flex>
          )}
        </Flex>
      )}
      {/* Tag filter */}
      {templateType === TemplateTypeEnum.systemTools &&
        selectedTagIds !== undefined &&
        setSelectedTagIds && (
          <Box mt={2}>
            <ToolTagFilterBox
              tags={toolTags}
              selectedTagIds={selectedTagIds}
              onTagSelect={setSelectedTagIds}
              size={isPopover ? 'sm' : 'base'}
              variant={isPopover ? 'inline' : 'compactMenu'}
            />
          </Box>
        )}
      {/* paths */}
      {templateType !== TemplateTypeEnum.basic && !searchKey && parentId && (
        <Flex alignItems={'center'} mt={2}>
          <FolderPath paths={paths} FirstPathDom={null} onClick={onUpdateParentId} />
        </Flex>
      )}
    </Box>
  );
};

export default React.memo(NodeTemplateListHeader);
