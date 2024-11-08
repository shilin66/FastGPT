import {
  TeamMemberItemType,
  TeamMemberSchema,
  TeamMemberWithTeamAndUserSchema,
  TeamMemberWithTeamSchema,
  TeamMemberWithUserSchema,
  TeamSchema,
  TeamTmbItemType
} from '@fastgpt/global/support/user/team/type';
import { ClientSession, Types } from '../../../common/mongo';
import {
  notLeaveStatus,
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { MongoTeamMember } from './teamMemberSchema';
import { MongoTeam } from './teamSchema';
import {
  CreateTeamProps,
  InviteMemberProps,
  InviteMemberResponse,
  UpdateInviteProps,
  UpdateTeamProps
} from '@fastgpt/global/support/user/team/controller';
import { createJWT, getResourcePermission } from '../../permission/controller';
import {
  OwnerPermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import {
  TeamDefaultPermissionVal,
  TeamReadPermissionVal
} from '@fastgpt/global/support/permission/user/constant';
import { MongoMemberGroupModel } from '../../permission/memberGroup/memberGroupSchema';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { MongoResourcePermission } from '../../permission/schema';
import { getUserDetail } from '../controller';
import { MongoUser } from '../schema';
import { UpdatePermissionBody } from '@fastgpt/global/support/permission/collaborator';
import { ResourcePermissionType } from '@fastgpt/global/support/permission/type';
import { MongoGroupMemberModel } from '../../permission/memberGroup/groupMemberSchema';
import { MongoDataset } from '../../../core/dataset/schema';
import { MongoApp } from '../../../core/app/schema';
import { updateMemberGroup } from '../../permission/memberGroup/controllers';
import { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';

async function getTeamMember(match: Record<string, any>): Promise<TeamTmbItemType> {
  const tmb = (await MongoTeamMember.findOne(match).populate('teamId')) as TeamMemberWithTeamSchema;
  if (!tmb) {
    return Promise.reject('member not exist');
  }

  const Per = await getResourcePermission({
    resourceType: PerResourceTypeEnum.team,
    teamId: tmb.teamId._id,
    tmbId: tmb._id
  });

  return {
    userId: String(tmb.userId),
    teamId: String(tmb.teamId._id),
    teamName: tmb.teamId.name,
    memberName: tmb.name,
    avatar: tmb.teamId.avatar,
    balance: tmb.teamId.balance,
    tmbId: String(tmb._id),
    teamDomain: tmb.teamId?.teamDomain,
    role: tmb.role,
    status: tmb.status,
    defaultTeam: tmb.defaultTeam,
    lafAccount: tmb.teamId.lafAccount,
    permission: new TeamPermission({
      per: Per ?? TeamDefaultPermissionVal,
      isOwner: tmb.role === TeamMemberRoleEnum.owner
    }),
    notificationAccount: tmb.teamId.notificationAccount
  };
}

export async function getTmbInfoByTmbId({ tmbId }: { tmbId: string }) {
  if (!tmbId) {
    return Promise.reject('tmbId or userId is required');
  }
  return getTeamMember({
    _id: new Types.ObjectId(String(tmbId)),
    status: notLeaveStatus
  });
}

export async function getUserDefaultTeam({ userId }: { userId: string }) {
  if (!userId) {
    return Promise.reject('tmbId or userId is required');
  }
  return getTeamMember({
    userId: new Types.ObjectId(userId),
    defaultTeam: true
  });
}

export async function createDefaultTeam({
  userId,
  teamName = 'My Team',
  avatar = '/icon/logo.svg',
  balance,
  session
}: {
  userId: string;
  teamName?: string;
  avatar?: string;
  balance?: number;
  session: ClientSession;
}) {
  // auth default team
  const tmb = await MongoTeamMember.findOne({
    userId: new Types.ObjectId(userId),
    defaultTeam: true
  });

  if (!tmb) {
    // create team
    const [{ _id: insertedId }] = await MongoTeam.create(
      [
        {
          ownerId: userId,
          name: teamName,
          avatar,
          balance,
          createTime: new Date()
        }
      ],
      { session }
    );
    // create team member
    const [tmb] = await MongoTeamMember.create(
      [
        {
          teamId: insertedId,
          userId,
          name: 'root',
          role: TeamMemberRoleEnum.owner,
          status: TeamMemberStatusEnum.active,
          createTime: new Date(),
          defaultTeam: true
        }
      ],
      { session }
    );
    // create default group
    await MongoMemberGroupModel.create(
      [
        {
          teamId: tmb.teamId,
          name: DefaultGroupName,
          avatar
        }
      ],
      { session }
    );
    console.log('create default team and group', userId);
    return tmb;
  } else {
    console.log('default team exist', userId);
    await MongoTeam.findByIdAndUpdate(tmb.teamId, {
      $set: {
        ...(balance !== undefined && { balance })
      }
    });
  }
}

export async function updateTeam({
  teamId,
  name,
  avatar,
  teamDomain,
  lafAccount
}: UpdateTeamProps & { teamId: string }) {
  if (global.feConfigs?.userDefaultTeam === name) {
    return Promise.reject('The team name is not allowed');
  }
  return mongoSessionRun(async (session) => {
    await MongoTeam.findByIdAndUpdate(
      teamId,
      {
        name,
        avatar,
        teamDomain,
        lafAccount
      },
      { session }
    );

    // update default group
    if (avatar) {
      await MongoMemberGroupModel.updateOne(
        {
          teamId: teamId,
          name: DefaultGroupName
        },
        {
          avatar
        },
        { session }
      );
    }
  });
}

export async function createTeam({ name, avatar }: CreateTeamProps, userId: string) {
  if (global.feConfigs?.userDefaultTeam === name) {
    return Promise.reject('The team name is not allowed');
  }

  const user = await MongoUser.findById(userId).lean();
  if (!user) {
    return Promise.reject('用户不存在');
  }

  const [{ _id: teamId }] = await MongoTeam.create([
    {
      ownerId: userId,
      name,
      avatar,
      createTime: new Date()
    }
  ]);

  const group = await MongoMemberGroupModel.create({
    teamId,
    name: DefaultGroupName
  });

  await MongoResourcePermission.create({
    teamId,
    groupId: group._id,
    resourceType: PerResourceTypeEnum.team,
    permission: TeamDefaultPermissionVal
  });

  return MongoTeamMember.create([
    {
      teamId,
      userId,
      name: user.username.replaceAll('@zenlayer.com', ''),
      role: TeamMemberRoleEnum.owner,
      status: TeamMemberStatusEnum.active,
      createTime: new Date(),
      defaultTeam: false
    }
  ]);
}

export async function listUserTeam(status: string, userId: string): Promise<TeamTmbItemType[]> {
  const tmbList = (await MongoTeamMember.find({ status, userId }).populate(
    'teamId'
  )) as TeamMemberWithTeamSchema[];

  // teams 转成 TeamTmbItemType 数据
  return tmbList.map((tmb) => ({
    userId: String(tmb.userId),
    teamId: String(tmb.teamId._id),
    teamName: tmb.teamId.name,
    memberName: tmb.name,
    avatar: tmb.teamId.avatar,
    balance: tmb.teamId.balance,
    tmbId: String(tmb._id),
    teamDomain: tmb.teamId.teamDomain,
    role: tmb.role,
    status: tmb.status
  })) as TeamTmbItemType[];
}

export async function getTeamMembers(teamId: string): Promise<TeamMemberItemType[]> {
  const tmbUserList = (await MongoTeamMember.find({ teamId })
    .populate('teamId')
    .populate('userId')) as TeamMemberWithTeamAndUserSchema[];
  const tmbIds = tmbUserList.map((tmb) => tmb._id.toString());
  const permissionMap = new Map<string, { permission?: number }>();
  await Promise.all(
    tmbIds.map(async (tmbId) => {
      const permissionDoc = await MongoResourcePermission.findOne({
        tmbId,
        teamId,
        resourceType: PerResourceTypeEnum.team
      });
      permissionMap.set(tmbId, permissionDoc ? { permission: permissionDoc.permission } : {});
    })
  );

  return tmbUserList
    .map((tmb) => {
      if (!tmb || !tmb._id || !tmb.userId || !tmb.teamId) {
        console.warn(`Incomplete team member data encountered: ${JSON.stringify(tmb)}`);
        return;
      }
      const permData = permissionMap.get(tmb._id.valueOf()) || {};
      return {
        userId: tmb.userId._id,
        teamId: tmb.teamId._id,
        memberName: tmb.name,
        avatar: tmb.userId.avatar,
        balance: tmb.teamId.balance,
        tmbId: tmb._id,
        teamDomain: tmb.teamId.teamDomain,
        role: tmb.role,
        status: tmb.status,
        permission: new TeamPermission({
          per: permData.permission ?? TeamDefaultPermissionVal,
          isOwner: tmb.role === TeamMemberRoleEnum.owner
        })
      };
    })
    .filter((member) => member !== undefined) as TeamMemberItemType[];
}

export async function deleteTeamMember(tmbId: string) {
  const tmb = await MongoTeamMember.findById(tmbId).lean();
  if (!tmb) {
    return Promise.reject('成员不存在');
  }
  if (tmb.status === TeamMemberStatusEnum.active) {
    await changeResourceOwner(tmb.teamId, tmb.userId);
  }

  await MongoTeamMember.deleteOne({ _id: tmbId });
  await MongoResourcePermission.deleteMany({ tmbId });
  await MongoGroupMemberModel.deleteMany({ tmbId });
}

export async function leaveTeam(teamId: string, userId: string) {
  await changeResourceOwner(teamId, userId);
  // 修改成员状态为 leave
  await MongoTeamMember.updateOne({ teamId, userId }, { status: TeamMemberStatusEnum.leave });
}

async function changeResourceOwner(teamId: string, userId: string) {
  // 查询mongo team 的ownerId
  const { ownerId } = (await MongoTeam.findById(teamId).lean()) as TeamSchema;
  // 查询ownerId 对应的tmbId
  const { _id: ownerTmbId } = (await MongoTeamMember.findOne({
    teamId,
    userId: ownerId,
    role: TeamMemberRoleEnum.owner
  }).lean()) as TeamMemberSchema;

  const { _id: leaveTmbId } = (await MongoTeamMember.findOne({
    teamId,
    userId
  }).lean()) as TeamMemberSchema;

  // 修改dataset的tmbId 为 ownerTmbId
  await MongoDataset.updateMany(
    { tmbId: leaveTmbId },
    {
      $set: { tmbId: ownerTmbId }
    }
  );

  const groups = await MongoMemberGroupModel.find({
    tmbId: leaveTmbId,
    role: GroupMemberRole.owner
  }).lean();
  // 转移mongo group 的所有者
  await Promise.all(
    groups.map(async (group) => {
      await updateMemberGroup({
        groupId: group._id,
        memberList: [
          {
            role: GroupMemberRole.member,
            tmbId: leaveTmbId
          },
          {
            role: GroupMemberRole.owner,
            tmbId: ownerTmbId
          }
        ]
      });
    })
  );
  // 修改app的tmbId 为 ownerTmbId
  await MongoApp.updateMany(
    { tmbId: leaveTmbId },
    {
      $set: { tmbId: ownerTmbId }
    }
  );

  // 修改resource permission的owner 权限
  await MongoResourcePermission.updateMany(
    {
      teamId,
      tmbId: leaveTmbId,
      permission: OwnerPermissionVal
    },
    {
      $set: {
        tmbId: ownerTmbId
      }
    }
  );
}
export async function inviteTeamMember({
  teamId,
  usernames
}: InviteMemberProps): Promise<InviteMemberResponse> {
  // check usernames exist
  const userList = await MongoUser.find({ username: { $in: usernames } });
  // convert userList to userMap key username value id
  const userMap = new Map<string, string>();
  userList.forEach((user) => {
    userMap.set(user.username, String(user._id));
  });

  // find not exist username
  const notExistUsernames = usernames.filter((username) => !userMap.has(username));

  let notInTeamUsernames: string[] = [];
  let existTeamMemberUsernames: string[] = [];
  // check team member exist, if userMap is not empty
  if (userMap.size > 0) {
    const userIds = Array.from(userMap.values()).map(
      (userId: string) => new Types.ObjectId(userId)
    );
    const existTeamMembers = (await MongoTeamMember.find({
      teamId,
      userId: { $in: userIds }
    }).populate('userId')) as TeamMemberWithUserSchema[];

    // get exist team member usernames
    existTeamMemberUsernames = existTeamMembers.map((member) => member.userId.username);

    // find userMaps username not exist in team
    userMap.forEach((userId, username) => {
      console.log('username', username);
      console.log('userId', userId);
      if (!existTeamMemberUsernames.includes(username)) {
        notInTeamUsernames.push(username);
      }
    });
    // create all team member, return all tmbIds
    await MongoTeamMember.create(
      notInTeamUsernames.map((username) => ({
        teamId,
        userId: userMap.get(username),
        name: username.replaceAll('@zenlayer.com', ''),
        status: TeamMemberStatusEnum.waiting,
        createTime: new Date(),
        defaultTeam: false
      }))
    );
    // get tmbIds
    // const tmbIds = createdTeamMembers.map((member) => member._id);
    // create permission
    // await MongoResourcePermission.create(
    //   tmbIds.map((tmbId) => ({
    //     tmbId,
    //     teamId,
    //     resourceType: PerResourceTypeEnum.team,
    //     permission: TeamReadPermissionVal
    //   }))
    // );
  }

  return {
    invite: notInTeamUsernames.map((username) => ({
      username,
      userId: userMap.get(username) || ''
    })),
    inValid: notExistUsernames.map((username) => ({
      username,
      userId: ''
    })),
    inTeam: existTeamMemberUsernames.map((username) => ({
      username,
      userId: userMap.get(username) || ''
    }))
  };
}

export async function switchTeam(newTeamId: string, userId: string, currentTeamId: string) {
  const teamMember = await MongoTeamMember.findOne({
    teamId: newTeamId,
    userId
  }).lean();
  if (!teamMember) {
    return Promise.reject('You are not a member of the team!');
  }
  // 修改用户 lastLoginTmbId
  await MongoUser.updateOne(
    {
      _id: userId
    },
    {
      $set: {
        lastLoginTmbId: teamMember._id
      }
    }
  );

  const userDetail = await getUserDetail({
    tmbId: teamMember._id,
    userId
  });

  return createJWT(userDetail);
}

export async function updatePermission(updatePermissionBody: UpdatePermissionBody, teamId: String) {
  if (updatePermissionBody.groupId) {
    if (updatePermissionBody.permission === TeamReadPermissionVal) {
      await MongoResourcePermission.deleteOne({
        teamId,
        groupId: updatePermissionBody.groupId,
        resourceType: PerResourceTypeEnum.team
      });
    } else {
      // 根据groupId 判断是否已经存在，如果存在则更新，如果不存在则创建
      if (
        await MongoResourcePermission.findOne({
          teamId,
          groupId: updatePermissionBody.groupId,
          resourceType: PerResourceTypeEnum.team
        })
      ) {
        await MongoResourcePermission.updateOne(
          {
            teamId,
            groupId: updatePermissionBody.groupId,
            resourceType: PerResourceTypeEnum.team
          },
          {
            permission: updatePermissionBody.permission
          }
        );
      } else {
        await MongoResourcePermission.create({
          teamId,
          groupId: updatePermissionBody.groupId,
          resourceType: PerResourceTypeEnum.team,
          permission: updatePermissionBody.permission
        });
      }
    }
  }
  if (updatePermissionBody.memberId) {
    if (updatePermissionBody.permission === TeamReadPermissionVal) {
      await MongoResourcePermission.deleteOne({
        teamId,
        tmbId: updatePermissionBody.memberId,
        resourceType: PerResourceTypeEnum.team
      });
    } else {
      // 根据tmbId 判断是否已经存在，如果存在则更新，如果不存在则创建
      if (
        await MongoResourcePermission.findOne({
          teamId,
          tmbId: updatePermissionBody.memberId,
          resourceType: PerResourceTypeEnum.team
        })
      ) {
        await MongoResourcePermission.updateOne(
          {
            teamId,
            tmbId: updatePermissionBody.memberId,
            resourceType: PerResourceTypeEnum.team
          },
          {
            permission: updatePermissionBody.permission
          }
        );
      } else {
        await MongoResourcePermission.create({
          teamId,
          tmbId: updatePermissionBody.memberId,
          resourceType: PerResourceTypeEnum.team,
          permission: updatePermissionBody.permission
        });
      }
    }
  }
  await MongoResourcePermission.updateOne(
    {
      teamId,
      tmbId: updatePermissionBody.memberId,
      groupId: updatePermissionBody.groupId,
      resourceType: PerResourceTypeEnum.team
    },
    {
      permission: updatePermissionBody.permission
    }
  );
}

export async function listMemberClbs(teamId: string) {
  const resourcePermissions = await MongoResourcePermission.find({
    teamId,
    resourceType: PerResourceTypeEnum.team
  }).lean();

  return resourcePermissions.map((resourcePer) => {
    if (!resourcePer.tmbId && !resourcePer.groupId) {
      console.error('Both tmbId and groupId are missing for resource:', resourcePer);
      return Promise.reject('Both tmbId and groupId are missing for resource');
    }

    if (resourcePer.tmbId && resourcePer.groupId) {
      console.error('Both tmbId and groupId are set for resource:', resourcePer);
      return Promise.reject('Both tmbId and groupId are set for resource');
    }

    if (resourcePer.tmbId) {
      return {
        teamId,
        tmbId: resourcePer.tmbId,
        resourceType: resourcePer.resourceType,
        permission: resourcePer.permission,
        resourceId: resourcePer.resourceId
      } as ResourcePermissionType;
    }
    if (resourcePer.groupId) {
      return {
        teamId,
        groupId: resourcePer.groupId,
        resourceType: resourcePer.resourceType,
        permission: resourcePer.permission,
        resourceId: resourcePer.resourceId
      } as ResourcePermissionType;
    }
  });
}

export async function deleteMemberPermission(tmbId: string) {
  await MongoResourcePermission.deleteMany({
    tmbId,
    resourceType: PerResourceTypeEnum.team
  });
}

export async function updateMemberName(tmbId: string, name: string) {
  await MongoTeamMember.updateOne(
    {
      _id: tmbId
    },
    {
      name
    }
  );
}

export async function updateInviteResult({ tmbId, status }: UpdateInviteProps) {
  await MongoTeamMember.updateOne(
    {
      _id: tmbId
    },
    {
      status
    }
  );
}
