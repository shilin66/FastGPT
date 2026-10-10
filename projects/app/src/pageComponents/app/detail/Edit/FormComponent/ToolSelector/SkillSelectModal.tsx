import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Grid, ModalFooter } from '@chakra-ui/react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';
import { getSkillList } from '@/web/core/skill/api';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import type { ListSkillsResponse } from '@fastgpt/global/core/agentSkills/api';
import FolderPath from '@/components/common/folder/Path';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import {
  ResourceSelectModal,
  ResourceSelectCard,
  resourceListMaxHeight
} from '@/components/core/app/ResourceSelectModal';
import { omniTheme } from '@/web/common/brand/theme';

const MAX_SKILL_COUNT = 100;

type SkillItem = ListSkillsResponse['list'][number];
type NavItem = { id: string; name: string };

const SkillSelectModal = ({
  selectedSkills,
  onAddSkill,
  onRemoveSkill,
  onClose
}: {
  selectedSkills: SelectedAgentSkillItemType[];
  onAddSkill: (skill: SelectedAgentSkillItemType) => void;
  onRemoveSkill: (skillId: string) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [searchKey, setSearchKey] = useState('');
  // 导航栈：每个元素代表一级文件夹 {id, name}，空数组表示根目录
  const [navStack, setNavStack] = useState<NavItem[]>([]);

  // 根目录传 ''（空字符串），与 context.tsx 的调用保持一致
  const parentId = navStack.length > 0 ? navStack[navStack.length - 1].id : '';

  const { data: skillList = [], loading: isLoading } = useRequest(
    () =>
      getSkillList({
        source: 'mine',
        runnableOnly: true,
        parentId: parentId,
        searchKey: searchKey || undefined
      }).then((res) => res.list),
    {
      manual: false,
      refreshDeps: [parentId, searchKey],
      throttleWait: 300
    }
  );

  const onEnterFolder = useCallback((item: SkillItem) => {
    setNavStack((prev) => [...prev, { id: item._id, name: item.name }]);
    setSearchKey('');
  }, []);

  // 将 navStack 转为 FolderPath 所需的 paths 格式
  const paths = useMemo(
    () => navStack.map((item) => ({ parentId: item.id, parentName: item.name })),
    [navStack]
  );

  // FolderPath 点击某一层级时，根据 parentId 裁剪 navStack
  const onUpdateParentId = useCallback((targetParentId: ParentIdType) => {
    if (!targetParentId) {
      setNavStack([]);
    } else {
      setNavStack((prev) => {
        const idx = prev.findIndex((item) => item.id === targetParentId);
        return idx >= 0 ? prev.slice(0, idx + 1) : prev;
      });
    }
    setSearchKey('');
  }, []);

  const isAtLimit = selectedSkills.length >= MAX_SKILL_COUNT;

  return (
    <ResourceSelectModal
      isOpen
      title={t('skill:select_skill')}
      description={t('app:resource_skill_hint')}
      iconSrc="common/skill"
      iconColor={omniTheme.colors.saturatedBlue}
      onClose={onClose}
    >
      <Flex
        px={5}
        py={3}
        bg={omniTheme.colors.surface}
        borderBottom={'1px solid'}
        borderColor={omniTheme.colors.border}
        w={'full'}
      >
        <Box w={'full'}>
          <SearchInput
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
            placeholder={t('skill:search_skill')}
            aria-label={String(t('skill:search_skill'))}
          />
        </Box>
      </Flex>

      {/* 面包屑导航 */}
      {!searchKey && navStack.length > 0 && (
        <Flex px={[4, 6]} py={3} bg={omniTheme.colors.surface}>
          <FolderPath
            paths={paths}
            FirstPathDom={t('common:root_folder')}
            onClick={onUpdateParentId}
          />
        </Flex>
      )}

      <MyBox
        isLoading={isLoading}
        overflowY={'auto'}
        minH={'180px'}
        maxH={resourceListMaxHeight}
        bg={omniTheme.colors.pageBg}
      >
        {skillList.length > 0 ? (
          <Grid
            as={'ul'}
            listStyleType={'none'}
            m={0}
            gridTemplateColumns={['1fr', '1fr 1fr']}
            gap={2}
            p={4}
          >
            {skillList.map((item) => (
              <SkillCard
                key={item._id}
                item={item}
                isSelected={selectedSkills.some((s) => s.skillId === item._id)}
                isAtLimit={isAtLimit}
                onAdd={() =>
                  onAddSkill({
                    skillId: item._id,
                    name: item.name,
                    description: item.description,
                    avatar: item.avatar
                  })
                }
                onRemove={() => onRemoveSkill(item._id)}
                onOpenFolder={() => onEnterFolder(item)}
              />
            ))}
          </Grid>
        ) : (
          <EmptyTip
            text={searchKey ? t('app:resource_no_results') : t('skill:no_skills')}
            py={12}
          />
        )}
      </MyBox>
      <ModalFooter justifyContent={'space-between'}>
        <Box role={'status'} fontSize={'sm'} color={omniTheme.colors.muted}>
          {t('common:selected_count', { count: selectedSkills.length })}
          <Box as={'span'} ml={2}>
            / {MAX_SKILL_COUNT}
          </Box>
        </Box>
        <Button onClick={onClose}>{t('common:Done')}</Button>
      </ModalFooter>
    </ResourceSelectModal>
  );
};

export default React.memo(SkillSelectModal);

const SkillCard = React.memo(function SkillCard({
  item,
  isSelected,
  isAtLimit,
  onAdd,
  onRemove,
  onOpenFolder
}: {
  item: SkillItem;
  isSelected: boolean;
  isAtLimit: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onOpenFolder: () => void;
}) {
  const { t } = useTranslation();
  const isFolder = item.type === AgentSkillTypeEnum.folder;

  return (
    <ResourceSelectCard
      selected={isSelected}
      name={item.name}
      description={item.description || t('common:no_intro')}
      preview={
        item.description ? (
          <Box maxW={'360px'}>
            <Box fontWeight={600} mb={1}>
              {item.name}
            </Box>
            {item.description}
          </Box>
        ) : undefined
      }
      avatar={
        isFolder ? (
          <MyIcon name={'common/folderFill'} w={7} color={'myGray.500'} />
        ) : (
          <MyAvatar src={item.avatar || 'core/skill/default'} w={7} borderRadius={'sm'} />
        )
      }
      meta={isFolder ? t('common:Folder') : 'Skill'}
      actions={
        isFolder ? (
          <Button
            size={'sm'}
            variant={'whiteBase'}
            leftIcon={<MyIcon name={'common/arrowRight'} w={4} />}
            onClick={onOpenFolder}
          >
            {t('common:Open')}
          </Button>
        ) : isSelected ? (
          <Button size={'sm'} variant={'grayDanger'} onClick={onRemove}>
            {t('common:Remove')}
          </Button>
        ) : (
          <MyTooltip label={isAtLimit ? t('skill:skill_select_limit_tip') : undefined}>
            <Button
              size={'sm'}
              variant={'primaryOutline'}
              leftIcon={<MyIcon name={'common/addLight'} w={4} />}
              isDisabled={isAtLimit}
              onClick={onAdd}
            >
              {t('common:Add')}
            </Button>
          </MyTooltip>
        )
      }
    />
  );
});
