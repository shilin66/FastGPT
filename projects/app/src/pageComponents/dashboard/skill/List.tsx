import React, { useState, useMemo, useEffect } from 'react';
import { Box, Grid, IconButton, HStack, Flex } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { SkillListContext } from './context';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import {
  AgentSkillSourceEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/agentSkills/constants';
import {
  deleteSkill,
  exportSkill,
  postUpdateSkill,
  postCopySkill,
  getAppsBySkillId,
  getSkillFolderList,
  resumeInheritPer,
  postChangeSkillOwner
} from '@/web/core/skill/api';
import {
  getSkillCollaboratorList,
  postUpdateSkillCollaborators,
  deleteSkillCollaborator
} from '@/web/core/skill/collaborator';
import { SkillRoleList } from '@fastgpt/global/support/permission/agentSkill/constant';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import type { AppsBySkillIdItem } from '@fastgpt/global/core/agentSkills/api';
import dynamic from 'next/dynamic';
import type { EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';
import { omniTheme } from '@/web/common/brand/theme';
import SkillListCard from './SkillListCard';
import type {
  GetResourceFolderListProps,
  ParentIdType
} from '@fastgpt/global/common/parentFolder/type';

const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));
const MoveModal = dynamic(() => import('@/components/common/folder/MoveModal'));
const ConfigPerModal = dynamic(() => import('@/components/support/permission/ConfigPerModal'));

// 5 items × 36px + 4 dividers × (1px + 8px top + 8px bottom) = 248px
const RELATED_APPS_MAX_H = '248px';

const RelatedAppsContent = ({ skillId }: { skillId: string }) => {
  const { t } = useTranslation();
  const [apps, setApps] = useState<AppsBySkillIdItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getAppsBySkillId(skillId)
      .then(setApps)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [skillId]);

  return (
    <MyBox isLoading={isLoading} minH={isLoading ? '80px' : 'auto'} p={'8px'}>
      <Box maxH={RELATED_APPS_MAX_H} overflowY={'auto'}>
        {apps.map((app, index) => (
          <Box key={app._id}>
            {index > 0 && <Box h={'1px'} bg={omniTheme.colors.border} my={'8px'} />}
            <Flex h={'36px'} px={'8px'} align={'center'} justify={'space-between'}>
              <Flex align={'center'} gap={'8px'} overflow={'hidden'}>
                <Avatar src={app.avatar} w={'20px'} h={'20px'} borderRadius={'sm'} flexShrink={0} />
                <Box
                  fontSize={'14px'}
                  fontWeight={'600'}
                  lineHeight={'20px'}
                  color={omniTheme.colors.text}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  whiteSpace={'nowrap'}
                >
                  {app.name}
                </Box>
              </Flex>
              {app.sourceMember && (
                <HStack spacing={'4px'} flexShrink={0} ml={'8px'}>
                  <MyIcon name={'common/user'} w={'16px'} color={'myGray.400'} />
                  <Box
                    color={omniTheme.colors.muted}
                    maxW={'80px'}
                    overflow={'hidden'}
                    textOverflow={'ellipsis'}
                    whiteSpace={'nowrap'}
                    fontSize={'xs'}
                  >
                    {app.sourceMember.name}
                  </Box>
                </HStack>
              )}
            </Flex>
          </Box>
        ))}
      </Box>
    </MyBox>
  );
};

const RelatedAppsPopover = ({ skillId, count }: { skillId: string; count: number }) => {
  const { t } = useTranslation();

  return (
    <MyPopover
      trigger={'hover'}
      placement={'bottom-start'}
      hasArrow={false}
      w={'260px'}
      p={0}
      Trigger={
        <HStack
          as="button"
          type="button"
          spacing={1}
          cursor="pointer"
          aria-label={`${t('skill:related_count')} ${count}`}
          color={omniTheme.colors.muted}
          _hover={{ color: omniTheme.colors.saturatedBlue }}
          _focusVisible={{
            outline: '2px solid',
            outlineColor: omniTheme.colors.saturatedBlue,
            borderRadius: 'sm'
          }}
        >
          <MyIcon name="core/app/type/agentFill" w="14px" />
          <Box fontWeight={600}>{count}</Box>
        </HStack>
      }
    >
      {() => <RelatedAppsContent skillId={skillId} />}
    </MyPopover>
  );
};

const List = () => {
  const { t } = useTranslation();
  const router = useRouter();

  const { skills, loadSkills, isFetchingSkills, searchKey } = useContextSelector(
    SkillListContext,
    (v) => v
  );

  const [editedSkill, setEditedSkill] = useState<EditResourceInfoFormType>();
  const [moveSkillId, setMoveSkillId] = useState<string>();
  const [editPerSkillId, setEditPerSkillId] = useState<string>();

  const selectedSkill = useMemo(
    () =>
      editPerSkillId !== undefined
        ? skills.find((item) => String(item._id) === String(editPerSkillId))
        : undefined,
    [editPerSkillId, skills]
  );

  const { openConfirm: openConfirmDel, ConfirmModal: DelConfirmModal } = useConfirm({
    type: 'delete'
  });

  const { openConfirm: openConfirmCopy, ConfirmModal: ConfirmCopyModal } = useConfirm({
    content: t('skill:copy_skill_confirm')
  });

  const { runAsync: onClickDeleteSkill } = useRequest(deleteSkill, {
    onSuccess() {
      loadSkills();
    },
    successToast: t('skill:delete_success'),
    errorToast: t('skill:delete_failed')
  });

  const { runAsync: onclickCopySkill } = useRequest(
    (skillId: string) => postCopySkill({ skillId }),
    {
      onSuccess() {
        loadSkills();
      },
      successToast: t('skill:copy_success'),
      errorToast: t('skill:copy_failed')
    }
  );

  const { runAsync: onUpdateSkill } = useRequest(
    (id: string, data: { avatar?: string; name?: string; intro?: string }) =>
      postUpdateSkill({
        skillId: id,
        name: data.name,
        avatar: data.avatar,
        description: data.intro
      }),
    {
      onSuccess() {
        loadSkills();
        setEditedSkill(undefined);
      },
      successToast: t('skill:edit_success'),
      errorToast: t('skill:edit_failed')
    }
  );

  const { runAsync: onMoveSkill } = useRequest(
    async (targetId: ParentIdType) => {
      if (!moveSkillId) return;
      return postUpdateSkill({
        skillId: moveSkillId,
        parentId: targetId === 'root' ? null : (targetId as string)
      });
    },
    {
      onSuccess() {
        loadSkills();
        setMoveSkillId(undefined);
      },
      errorToast: t('skill:move_failed')
    }
  );

  // 获取技能文件夹列表
  const getSkillFolderListForMove = useMemo(
    () =>
      ({ parentId }: GetResourceFolderListProps) =>
        getSkillFolderList({ parentId }),
    []
  );

  const { runAsync: onExportSkill } = useRequest(
    (skillId: string, skillName: string) => exportSkill(skillId, skillName),
    {
      successToast: t('skill:export_success'),
      errorToast: t('skill:export_failed')
    }
  );

  if (skills.length === 0 && isFetchingSkills) return null;

  if (skills.length === 0) {
    return (
      <Box
        mt={4}
        py={8}
        bg={omniTheme.colors.surface}
        border="1px solid"
        borderColor={omniTheme.colors.border}
        borderRadius={omniTheme.radii.lg}
      >
        <EmptyTip text={searchKey ? t('skill:list_search_empty') : t('skill:no_skills')} />
      </Box>
    );
  }

  return (
    <>
      <Grid
        py={4}
        gridTemplateColumns={[
          '1fr',
          'repeat(2,1fr)',
          'repeat(3,minmax(0,1fr))',
          'repeat(4,minmax(0,1fr))',
          'repeat(4,1fr)'
        ]}
        gridGap={4}
        alignItems={'stretch'}
      >
        {skills.map((skill) => {
          const isFolder = skill.type === AgentSkillTypeEnum.folder;
          const isPersonal = skill.source === AgentSkillSourceEnum.personal;
          const relatedAppsCount = skill.appCount ?? 0;
          const folderQuery = new URLSearchParams(
            Object.entries(router.query).flatMap(([key, value]) =>
              value === undefined
                ? []
                : (Array.isArray(value) ? value : [value]).map((part) => [key, part])
            )
          );
          folderQuery.set('parentId', skill._id);

          return (
            <SkillListCard
              key={skill._id}
              name={skill.name}
              avatar={skill.avatar}
              description={skill.description}
              sourceMember={skill.sourceMember}
              updateTime={skill.updateTime}
              isFolder={isFolder}
              href={
                isFolder
                  ? `${router.pathname}?${folderQuery}`
                  : `/skill/detail?skillId=${skill._id}`
              }
              relatedApps={
                relatedAppsCount > 0 ? (
                  <RelatedAppsPopover skillId={skill._id} count={relatedAppsCount} />
                ) : (
                  <MyTooltip label={t('skill:related_count')}>
                    <HStack spacing={1} aria-label={`${t('skill:related_count')} 0`}>
                      <MyIcon name="core/app/type/agentFill" w="14px" />
                      <Box>0</Box>
                    </HStack>
                  </MyTooltip>
                )
              }
            >
              {isPersonal && (
                <MyMenu
                  trigger="click"
                  placement="bottom-end"
                  width={176}
                  offset={[0, 8]}
                  usePortal
                  menuListStyles={{
                    p: 2,
                    border: '1px solid',
                    borderColor: omniTheme.colors.border,
                    borderRadius: omniTheme.radii.lg,
                    boxShadow: omniTheme.shadows.card
                  }}
                  menuItemStyles={{
                    minH: '36px',
                    borderRadius: omniTheme.radii.md,
                    px: 3,
                    fontWeight: 700
                  }}
                  Button={
                    <IconButton
                      size={'xsSquare'}
                      variant={'transparentBase'}
                      icon={<MyIcon name={'more'} w={'12px'} color={'myGray.500'} />}
                      aria-label={`${t('common:More')} · ${skill.name}`}
                    />
                  }
                  menuList={[
                    {
                      children: [
                        {
                          icon: 'edit',
                          type: 'grayBg' as const,
                          label: t('common:dataset.Edit Info'),
                          onClick: () => {
                            setEditedSkill({
                              id: skill._id,
                              avatar:
                                skill.avatar ??
                                (isFolder ? 'common/folderFill' : 'core/skill/default'),
                              name: skill.name,
                              intro: skill.description
                            });
                          }
                        },
                        {
                          icon: 'common/file/move',
                          type: 'grayBg' as const,
                          label: t('common:move_to'),
                          onClick: () => setMoveSkillId(skill._id)
                        },
                        {
                          icon: 'key',
                          type: 'grayBg' as const,
                          label: t('skill:permission_settings'),
                          onClick: () => {
                            setEditPerSkillId(skill._id);
                          }
                        },
                        // skill 专属菜单项
                        ...(!isFolder
                          ? [
                              {
                                icon: 'export',
                                type: 'grayBg' as const,
                                label: t('skill:export_config'),
                                onClick: () => onExportSkill(skill._id, skill.name)
                              },
                              {
                                icon: 'copy',
                                type: 'grayBg' as const,
                                label: t('skill:copy_skill'),
                                onClick: () =>
                                  openConfirmCopy({
                                    onConfirm: () => onclickCopySkill(skill._id)
                                  })()
                              }
                            ]
                          : [])
                      ]
                    },
                    {
                      children: [
                        {
                          type: 'danger' as const,
                          icon: 'delete',
                          label: t('common:Delete'),
                          disabled: !isFolder && relatedAppsCount > 0,
                          disabledTip:
                            !isFolder && relatedAppsCount > 0
                              ? t('skill:delete_disabled_tip')
                              : undefined,
                          onClick: () =>
                            openConfirmDel({
                              onConfirm: () => onClickDeleteSkill(skill._id),
                              inputConfirmText: skill.name,
                              customContent: t('skill:confirm_delete_tip')
                            })()
                        }
                      ]
                    }
                  ]}
                />
              )}
            </SkillListCard>
          );
        })}
      </Grid>
      <DelConfirmModal />
      <ConfirmCopyModal />
      {!!editedSkill && (
        <EditResourceModal
          {...editedSkill}
          title={t('skill:skill_info_edit')}
          onClose={() => {
            setEditedSkill(undefined);
          }}
          onEdit={({ id, ...data }) => onUpdateSkill(id, data)}
        />
      )}
      {!!moveSkillId && (
        <MoveModal
          moveResourceId={moveSkillId}
          server={getSkillFolderListForMove}
          title={t('skill:move_skill')}
          onClose={() => setMoveSkillId(undefined)}
          onConfirm={onMoveSkill}
          moveHint={t('skill:move_skill_hint')}
        />
      )}
      {!!selectedSkill && (
        <ConfigPerModal
          onChangeOwner={(tmbId: string) =>
            postChangeSkillOwner({
              skillId: selectedSkill._id,
              ownerId: tmbId
            }).then(() => loadSkills())
          }
          hasParent={!!selectedSkill.parentId}
          refetchResource={loadSkills}
          isInheritPermission={selectedSkill.inheritPermission}
          resumeInheritPermission={() =>
            resumeInheritPer(selectedSkill._id).then(() => loadSkills())
          }
          avatar={selectedSkill.avatar}
          name={selectedSkill.name}
          managePer={{
            defaultRole: ReadRoleVal,
            permission: selectedSkill.permission,
            onGetCollaboratorList: () => getSkillCollaboratorList(selectedSkill._id),
            roleList: SkillRoleList,
            onUpdateCollaborators: (props) =>
              postUpdateSkillCollaborators({
                ...props,
                skillId: selectedSkill._id
              }),
            onDelOneCollaborator: (props) =>
              deleteSkillCollaborator({
                ...props,
                skillId: selectedSkill._id
              }),
            refreshDeps: [selectedSkill._id, selectedSkill.inheritPermission]
          }}
          onClose={() => setEditPerSkillId(undefined)}
        />
      )}
    </>
  );
};

export default List;
