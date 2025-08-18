import {
  type MemberGroupListItemType,
  type MemberGroupSchemaType
} from '@fastgpt/global/support/permission/memberGroup/type';
import { MongoGroupMemberModel } from './groupMemberSchema';
import { parseHeaderCert } from '../controller';
import { MongoMemberGroupModel } from './memberGroupSchema';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { type ClientSession } from 'mongoose';
import {
  GroupMemberRole,
  memberGroupPermissionList
} from '@fastgpt/global/support/permission/memberGroup/constant';
import { type AuthModeType, type AuthResponseType } from '../type';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { MongoResourcePermission } from '../schema';
import { type TeamMemberSchema } from '@fastgpt/global/support/user/team/type';
import { Permission } from '@fastgpt/global/support/permission/controller';

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
    return group;
  }
  return group;
};

export const getGroupsByTmbId = async ({
  tmbId,
  teamId,
  role,
  session
}: {
  tmbId: string;
  teamId: string;
  role?: `${GroupMemberRole}`[];
  session?: ClientSession;
}) =>
  (
    await Promise.all([
      (
        await MongoGroupMemberModel.find(
          {
            tmbId,
            groupId: {
              $exists: true
            },
            ...(role ? { role: { $in: role } } : {})
          },
          undefined,
          { session }
        )
          .populate<{ group: MemberGroupSchemaType }>('group')
          .lean()
      ).map((item) => item.group),
      role ? [] : getTeamDefaultGroup({ teamId, session })
    ])
  ).flat();

export const getGroupMembersByGroupId = async (groupId: string) => {
  return await MongoGroupMemberModel.find({
    groupId
  }).lean();
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
  const [groupMember, tmb] = await Promise.all([
    MongoGroupMemberModel.findOne({ groupId, tmbId }),
    getTmbInfoByTmbId({ tmbId })
  ]);

  // Team admin or role check
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

  if (await MongoMemberGroupModel.findOne({ name, teamId })) {
    return Promise.reject(TeamErrEnum.groupNameDuplicate);
  }

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
};

export const listMemberGroup = async (
  teamId: string,
  tmbId: string,
  searchKey?: string,
  withMember?: boolean
) => {
  const groupList = await MongoMemberGroupModel.find({
    teamId,
    name: { $regex: searchKey || '' }
  }).lean();
  if (!withMember) {
    return groupList as unknown as MemberGroupListItemType<false>[];
  }
  // 获取groupIds
  const groupIdList = groupList.map((group) => group._id.toString());

  // 根据groupId获取成员列表
  const groupMemberList = await MongoGroupMemberModel.find({ groupId: { $in: groupIdList } })
    .populate<{ tmb: TeamMemberSchema }>({
      path: 'tmb',
      select: 'name avatar'
    })
    .lean();
  const groupMemberMap: { [key: string]: any } = {};
  const groupOwnerMap: { [key: string]: any } = {};
  const groupPermissionMap: { [key: string]: any } = {};
  // 将memberList 添加到groupMemberMap中
  groupMemberList.map((member) => {
    groupMemberMap[member.groupId] = groupMemberMap[member.groupId] || [];
    groupMemberMap[member.groupId].push({
      tmbId: member.tmbId,
      name: member.tmb?.name,
      avatar: member.tmb?.avatar
    });
    if (member.role === GroupMemberRole.owner) {
      groupOwnerMap[member.groupId] = {
        tmbId: member.tmbId,
        name: member.tmb?.name,
        avatar: member.tmb?.avatar
      };
    }
    console.log('groupMemberMap', groupMemberMap);
    if (member.tmbId.toString() === tmbId) {
      if (member.role === GroupMemberRole.owner) {
        groupPermissionMap[member.groupId] = new Permission({
          isOwner: true
        });
      } else if (member.role === GroupMemberRole.admin) {
        groupPermissionMap[member.groupId] = new Permission({
          role: memberGroupPermissionList.manage.value
        });
      } else {
        groupPermissionMap[member.groupId] = new Permission({
          role: memberGroupPermissionList.read.value
        });
      }
    }
  });

  const memberGroupList: MemberGroupListItemType<true>[] = [] as MemberGroupListItemType<true>[];

  groupList.map((group) =>
    memberGroupList.push({
      ...group,
      members: groupMemberMap[group._id] || [],
      count: groupMemberMap[group._id]?.length || 0,
      owner: groupOwnerMap[group._id] || {},
      permission: groupPermissionMap[group._id]
    } as unknown as MemberGroupListItemType<true>)
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
    if (await MongoMemberGroupModel.findOne({ name, teamId: group.teamId })) {
      return Promise.reject(TeamErrEnum.groupNameDuplicate);
    }
    await MongoMemberGroupModel.updateOne(
      { _id: groupId },
      {
        name,
        avatar
      }
    );
  }
  if (memberList && memberList.length > 0) {
    if (group.name === DefaultGroupName) {
      return;
    }
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
