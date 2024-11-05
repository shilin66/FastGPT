import {
  MemberGroupListType,
  MemberGroupSchemaType
} from '@fastgpt/global/support/permission/memberGroup/type';
import { MongoGroupMemberModel } from './groupMemberSchema';
import { TeamMemberSchema } from '@fastgpt/global/support/user/team/type';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '../schema';
import { getGroupPer, parseHeaderCert } from '../controller';
import { MongoMemberGroupModel } from './memberGroupSchema';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { ClientSession } from 'mongoose';
import { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import { AuthModeType, AuthResponseType } from '../type';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { TeamDefaultPermissionVal } from '@fastgpt/global/support/permission/user/constant';

/**
 * Get the default group of a team
 * @param{Object} obj
 * @param{string} obj.teamId
 * @param{ClientSession} obj.session
 */
export const getTeamDefaultGroup = async ({
  teamId,
  session
}: {
  teamId: string;
  session?: ClientSession;
}) => {
  const group = await MongoMemberGroupModel.findOne({ teamId, name: DefaultGroupName }, undefined, {
    session
  }).lean();

  // Create the default group if it does not exist
  if (!group) {
    const [group] = await MongoMemberGroupModel.create(
      [
        {
          teamId,
          name: DefaultGroupName
        }
      ],
      { session }
    );
    await MongoResourcePermission.create({
      teamId,
      groupId: group._id,
      resourceType: PerResourceTypeEnum.team,
      permission: TeamDefaultPermissionVal
    });
    return group;
  }
  return group;
};

export const getGroupsByTmbId = async ({
  tmbId,
  teamId,
  role
}: {
  tmbId: string;
  teamId: string;
  role?: `${GroupMemberRole}`[];
}) =>
  (
    await Promise.all([
      (
        await MongoGroupMemberModel.find({
          tmbId,
          groupId: {
            $exists: true
          },
          ...(role ? { role: { $in: role } } : {})
        })
          .populate('groupId')
          .lean()
      ).map((item) => {
        return {
          ...(item.groupId as any as MemberGroupSchemaType)
        };
      }),

      role ? [] : getTeamDefaultGroup({ teamId })
    ])
  ).flat();

export const getTmbByGroupId = async (groupId: string) => {
  return (
    await MongoGroupMemberModel.find({
      groupId
    })
      .populate('tmbId')
      .lean()
  ).map((item) => {
    return {
      ...(item.tmbId as any as MemberGroupSchemaType)
    };
  });
};

export const getGroupMembersByGroupId = async (groupId: string) => {
  return await MongoGroupMemberModel.find({
    groupId
  }).lean();
};

export const getGroupMembersWithInfoByGroupId = async (groupId: string) => {
  return (
    await MongoGroupMemberModel.find({
      groupId
    })
      .populate('tmbId')
      .lean()
  ).map((item) => item.tmbId) as any as TeamMemberSchema[]; // HACK: type casting
};

/**
 * Get tmb's group permission: the maximum permission of the group
 * @param tmbId
 * @param resourceId
 * @param resourceType
 * @returns the maximum permission of the group
 */
export const getGroupPermission = async ({
  tmbId,
  resourceId,
  teamId,
  resourceType
}: {
  tmbId: string;
  teamId: string;
} & (
  | {
      resourceId?: undefined;
      resourceType: 'team';
    }
  | {
      resourceId: string;
      resourceType: Omit<PerResourceTypeEnum, 'team'>;
    }
)) => {
  const groupIds = (await getGroupsByTmbId({ tmbId, teamId })).map((item) => item._id);
  const groupPermissions = (
    await MongoResourcePermission.find({
      groupId: {
        $in: groupIds
      },
      resourceType,
      resourceId,
      teamId
    })
  ).map((item) => item.permission);

  return getGroupPer(groupPermissions);
};

// auth group member role
export const authGroupMemberRole = async ({
  groupId,
  role,
  ...props
}: {
  groupId: string;
  role: `${GroupMemberRole}`[];
} & AuthModeType): Promise<AuthResponseType> => {
  const result = await parseHeaderCert(props);
  const { teamId, tmbId, isRoot } = result;
  if (isRoot) {
    return {
      ...result,
      permission: new TeamPermission({
        isOwner: true
      }),
      teamId,
      tmbId
    };
  }
  const groupMember = await MongoGroupMemberModel.findOne({ groupId, tmbId });
  const tmb = await getTmbInfoByTmbId({ tmbId });
  if (tmb.permission.hasManagePer || (groupMember && role.includes(groupMember.role))) {
    return {
      ...result,
      permission: tmb.permission,
      teamId,
      tmbId
    };
  }
  return Promise.reject(TeamErrEnum.unAuthTeam);
};

export const createMemberGroup = async (data: {
  teamId: string;
  name: string;
  avatar?: string;
  memberIdList?: string[];
}) => {
  const { teamId, name, memberIdList, avatar } = data;

  const group = await MongoMemberGroupModel.create({
    teamId,
    name,
    avatar
  });

  await MongoGroupMemberModel.create(
    memberIdList?.map((item) => ({
      groupId: group._id,
      tmbId: item,
      role: GroupMemberRole.owner
    }))
  );

  await MongoResourcePermission.create({
    teamId,
    groupId: group._id,
    resourceType: 'team',
    permission: TeamDefaultPermissionVal
  });
};

export const listMemberGroup = async (teamId: string, tmbId: string) => {
  let memberGroupList: MemberGroupListType = [];
  const groupList = await MongoMemberGroupModel.find({ teamId }).lean();
  // 获取groupIds
  const groupIdList = groupList.map((group) => group._id);
  // 根据groupId获取成员列表
  const memberList = await MongoGroupMemberModel.find({ groupId: { $in: groupIdList } }).lean();
  const groupMemberMap: { [key: string]: any } = {};
  // 将memberList 添加到groupMemberMap中
  memberList.map((member) => {
    groupMemberMap[member.groupId] = groupMemberMap[member.groupId] || [];
    groupMemberMap[member.groupId].push(member);
  });

  // 获取group的权限列表
  const permissionList = await MongoResourcePermission.find({
    groupId: { $in: groupIdList },
    resourceType: 'team'
  }).lean();
  const groupPermissionMap: { [key: string]: any } = {};
  permissionList.map((permission) => {
    if (permission.groupId) {
      groupPermissionMap[permission.groupId] = permission.permission;
    }
  });

  groupList.map((group) =>
    memberGroupList.push({
      ...group,
      members: groupMemberMap[group._id] || [],
      permission: new TeamPermission({ per: groupPermissionMap[group._id] })
    })
  );
  return memberGroupList;
};

export const updateMemberGroup = async (data: {
  groupId: string;
  name?: string;
  avatar?: string;
  memberList?: {
    tmbId: string;
    role: `${GroupMemberRole}`;
  }[];
}) => {
  const { groupId, name, avatar, memberList } = data;
  const group = await MongoMemberGroupModel.findById(groupId);
  if (!group) {
    return Promise.reject(TeamErrEnum.groupNotExist);
  }
  if (name || avatar) {
    await MongoMemberGroupModel.updateOne(
      { _id: groupId },
      {
        name,
        avatar
      }
    );
  }
  if (memberList && memberList.length > 0) {
    await MongoGroupMemberModel.deleteMany({ groupId });
    await MongoGroupMemberModel.create(
      memberList.map((item) => ({
        groupId,
        tmbId: item.tmbId,
        role: item.role
      }))
    );
  }
};

export const deleteMemberGroup = async (groupId: string) => {
  await MongoGroupMemberModel.deleteMany({ groupId });
  await MongoResourcePermission.deleteMany({ groupId });
  await MongoMemberGroupModel.deleteOne({ _id: groupId });
};
