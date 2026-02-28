import type { ClientSession, AnyBulkWriteOperation } from '../../common/mongo';
import type { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { ManageRoleVal, OwnerRoleVal } from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from './schema';
import type { ResourcePermissionType } from '@fastgpt/global/support/permission/type';
import { type PermissionValueType } from '@fastgpt/global/support/permission/type';
import { getGroupsByTmbId } from './memberGroup/controllers';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { getOrgIdSetWithParentByTmbId } from './org/controllers';
import { getCollaboratorId, sumPer } from '@fastgpt/global/support/permission/utils';
import { type SyncChildrenPermissionResourceType } from './inheritPermission';
import { pickCollaboratorIdFields } from './utils';
import type {
  CollaboratorItemDetailType,
  UpdateClbPermissionProps,
  CollaboratorItemType,
  CollaboratorListType
} from '@fastgpt/global/support/permission/collaborator';
import { MongoTeamMember } from '../../support/user/team/teamMemberSchema';
import { MongoOrgModel } from './org/orgSchema';
import { MongoMemberGroupModel } from './memberGroup/memberGroupSchema';
import { DEFAULT_ORG_AVATAR, DEFAULT_TEAM_AVATAR } from '@fastgpt/global/common/system/constants';

/** get resource permission for a team member
 * If there is no permission for the team member, it will return undefined
 * @param resourceType: PerResourceTypeEnum
 * @param teamId
 * @param tmbId
 * @param resourceId
 * @returns PermissionValueType | undefined
 */
export const getTmbPermission = async ({
  resourceType,
  teamId,
  tmbId,
  resourceId
}: {
  teamId: string;
  tmbId: string;
} & (
  | {
      resourceType: 'team';
      resourceId?: undefined;
    }
  | {
      resourceType: Omit<PerResourceTypeEnum, 'team'>;
      resourceId: string;
    }
)): Promise<PermissionValueType | undefined> => {
  // Personal permission has the highest priority
  const tmbPer = (
    await MongoResourcePermission.findOne(
      {
        resourceType,
        teamId,
        resourceId,
        tmbId
      },
      'permission'
    ).lean()
  )?.permission;

  // could be 0
  if (tmbPer !== undefined) {
    return tmbPer;
  }

  // If there is no personal permission, get the group permission
  const [groupPers, orgPers] = await Promise.all([
    getGroupsByTmbId({ tmbId, teamId })
      .then((res) => res.map((item) => item._id))
      .then((groupIdList) =>
        MongoResourcePermission.find(
          {
            teamId,
            resourceType,
            groupId: {
              $in: groupIdList
            },
            resourceId
          },
          'permission'
        ).lean()
      )
      .then((perList) => perList.map((item: any) => item.permission)),
    getOrgIdSetWithParentByTmbId({ tmbId, teamId })
      .then((item) => Array.from(item))
      .then((orgIds) =>
        MongoResourcePermission.find(
          {
            teamId,
            resourceType,
            orgId: {
              $in: Array.from(orgIds)
            },
            resourceId
          },
          'permission'
        ).lean()
      )
      .then((perList) => perList.map((item: any) => item.permission))
  ]);

  return sumPer(...groupPers, ...orgPers);
};

/**
 * Only get resource's owned clbs, not including parents'.
 */
export async function getResourceOwnedClbs({
  resourceType,
  teamId,
  resourceId,
  session
}: {
  teamId: string;
  session?: ClientSession;
} & (
  | {
      resourceType: 'team';
      resourceId?: undefined;
    }
  | {
      resourceType: Omit<PerResourceTypeEnum, 'team'>;
      resourceId: ParentIdType;
    }
)) {
  return MongoResourcePermission.find(
    {
      resourceId,
      resourceType,
      teamId
    },
    undefined,
    { ...(session ? { session } : {}) }
  ).lean();
}

export const getClbsInfo = async ({
  clbs,
  teamId,
  ownerTmbId
}: {
  clbs: CollaboratorItemType[];
  teamId: string;
  ownerTmbId?: string;
}): Promise<CollaboratorItemDetailType[]> => {
  const tmbIds = [];
  const orgIds = [];
  const groupIds = [];

  for (const clb of clbs) {
    if (clb.tmbId) tmbIds.push(clb.tmbId);
    if (clb.orgId) orgIds.push(clb.orgId);
    if (clb.groupId) groupIds.push(clb.groupId);
  }

  const infos = (
    await Promise.all([
      MongoTeamMember.find({ _id: { $in: tmbIds }, teamId }, '_id name avatar').lean(),
      MongoOrgModel.find({ _id: { $in: orgIds }, teamId }, '_id name avatar').lean(),
      MongoMemberGroupModel.find({ _id: { $in: groupIds }, teamId }, '_id name avatar').lean()
    ])
  ).flat();

  return clbs.map((clb) => {
    const info = infos.find((info) => info._id === getCollaboratorId(clb));

    return {
      ...clb,
      teamId,
      permission: new Permission({
        role: clb.permission,
        isOwner: Boolean(ownerTmbId && clb.tmbId && ownerTmbId === clb.tmbId)
      }),
      name: info?.name ?? 'Unknown name',
      avatar: info?.avatar || (clb.orgId ? DEFAULT_ORG_AVATAR : DEFAULT_TEAM_AVATAR)
    };
  });
};

export const createResourceDefaultCollaborators = async ({
  resource,
  resourceType,
  session,
  tmbId
}: {
  resource: SyncChildrenPermissionResourceType;
  resourceType: PerResourceTypeEnum;

  // should be provided when inheritPermission is true
  session: ClientSession;
  tmbId: string;
}) => {
  const parentClbs = await getResourceOwnedClbs({
    resourceId: resource.parentId,
    resourceType,
    teamId: resource.teamId,
    session
  });
  // 1. add owner into the permission list with owner per
  // 2. remove parent's owner permission, instead of manager

  const collaborators: CollaboratorItemType[] = [
    ...parentClbs
      .filter((item: any) => item.tmbId !== tmbId)
      .map((clb: any) => {
        if (clb.permission === OwnerRoleVal) {
          clb.permission = ManageRoleVal;
        }
        return clb;
      }),
    {
      tmbId,
      permission: OwnerRoleVal
    }
  ];

  const ops: AnyBulkWriteOperation<ResourcePermissionType>[] = [];

  for (const clb of collaborators) {
    ops.push({
      updateOne: {
        filter: {
          ...pickCollaboratorIdFields(clb),
          teamId: resource.teamId,
          resourceId: resource._id,
          resourceType
        },
        update: {
          $set: {
            permission: clb.permission
          }
        },
        upsert: true
      }
    });
  }

  await MongoResourcePermission.bulkWrite(ops, { session });
};
export async function updateCollaborators(
  updateClbPermissionProps: UpdateClbPermissionProps,
  resourceType: PerResourceTypeEnum,
  resourceId: string,
  teamId: string
) {
  const { collaborators } = updateClbPermissionProps;

  // 构建查询条件以获取当前资源的所有协作者权限
  const filter: any = {
    resourceType,
    resourceId,
    teamId
  };

  // 获取当前已存在的所有协作者权限记录
  const existingPermissions = await MongoResourcePermission.find(filter);

  if (collaborators && collaborators.length > 0) {
    // 使用 Promise.all 并行处理所有更新操作
    await Promise.all(
      collaborators.map(async (clb) => {
        // 根据不同的ID类型构建查询条件
        const filter: any = {
          resourceType,
          resourceId,
          teamId
        };

        // 添加对应的ID字段到查询条件
        if (clb.tmbId) {
          filter.tmbId = clb.tmbId;
        } else if (clb.groupId) {
          filter.groupId = clb.groupId;
        } else if (clb.orgId) {
          filter.orgId = clb.orgId;
        }

        // 执行更新操作
        return MongoResourcePermission.updateOne(
          filter,
          {
            $set: { permission: clb.permission }
          },
          { upsert: true }
        );
      })
    );

    // 计算需要删除的权限记录
    const currentCollaboratorIds = collaborators
      .map((clb) => {
        if (clb.tmbId) return { tmbId: clb.tmbId };
        if (clb.groupId) return { groupId: clb.groupId };
        if (clb.orgId) return { orgId: clb.orgId };
        return null;
      })
      .filter(Boolean) as Array<{ tmbId?: string; groupId?: string; orgId?: string }>;

    // 筛选出需要删除的权限记录（即在现有记录中但不在新协作者列表中的记录）
    const idsToDelete = existingPermissions.filter((existing) => {
      return !currentCollaboratorIds.some((current) => {
        return (
          (current.tmbId && existing.tmbId?.toString() === current.tmbId) ||
          (current.groupId && existing.groupId?.toString() === current.groupId) ||
          (current.orgId && existing.orgId?.toString() === current.orgId)
        );
      });
    });

    // 删除不再需要的权限记录
    if (idsToDelete.length > 0) {
      const deleteFilters = idsToDelete.map((permission) => {
        const deleteFilter: any = {
          resourceType,
          resourceId,
          teamId
        };

        if (permission.tmbId) {
          deleteFilter.tmbId = permission.tmbId;
        } else if (permission.groupId) {
          deleteFilter.groupId = permission.groupId;
        } else if (permission.orgId) {
          deleteFilter.orgId = permission.orgId;
        }

        return deleteFilter;
      });

      // 使用 $or 操作符一次性删除所有不需要的权限记录
      await MongoResourcePermission.deleteMany({
        $or: deleteFilters
      });
    }
  } else {
    // 如果没有传入任何协作者，则删除所有相关权限记录，但不删除创建者的权限（Owner权限）
    await MongoResourcePermission.deleteMany({
      ...filter,
      permission: { $ne: OwnerRoleVal } // 排除Owner权限的记录
    });
  }
}

export async function listCollaborator(
  teamId: string,
  resourceType: PerResourceTypeEnum,
  resourceId: string,
  resourceOwnerTmbId: string,
  parentId?: string,
  parentOwnerTmbId?: string
): Promise<CollaboratorListType> {
  const resourceClbs = await getResourceOwnedClbs({
    resourceId,
    resourceType,
    teamId
  });
  const resourceClbsDetailInfo = await getClbsInfo({
    clbs: resourceClbs,
    teamId,
    ownerTmbId: resourceOwnerTmbId
  });
  if (parentId) {
    const parentClbs = await getResourceOwnedClbs({
      resourceId: parentId,
      resourceType,
      teamId
    });
    const parentClbsDetailInfo = await getClbsInfo({
      clbs: parentClbs,
      teamId,
      ownerTmbId: parentOwnerTmbId
    });
    return {
      clbs: resourceClbsDetailInfo,
      parentClbs: parentClbsDetailInfo
    };
  } else {
    return {
      clbs: resourceClbsDetailInfo,
      parentClbs: []
    };
  }
}

export async function deleteCollaborators(
  resourceType: PerResourceTypeEnum,
  resourceId: string,
  teamId: string,
  tmbId: string,
  groupId: string
) {
  await MongoResourcePermission.deleteOne({
    resourceType: resourceType,
    resourceId: resourceId,
    tmbId,
    groupId,
    teamId: teamId
  });
}
