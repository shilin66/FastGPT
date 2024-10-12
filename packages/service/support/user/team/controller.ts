import {
  TeamMemberItemType,
  TeamMemberWithTeamAndUserSchema,
  TeamMemberWithTeamSchema,
  TeamMemberWithUserSchema,
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
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { TeamDefaultPermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoMemberGroupModel } from '../../permission/memberGroup/memberGroupSchema';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { MongoResourcePermission } from '../../permission/schema';
import { getUserDetail } from '../controller';
import { MongoUser } from '../schema';
import { UpdateClbPermissionProps } from '@fastgpt/global/support/permission/collaborator';

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
          name: 'Owner',
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
  const [{ _id: teamId }] = await MongoTeam.create([
    {
      ownerId: userId,
      name,
      avatar,
      createTime: new Date()
    }
  ]);

  return MongoTeamMember.create([
    {
      teamId,
      userId,
      name: 'Owner',
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
        memberName: tmb.userId.username,
        avatar: tmb.teamId.avatar,
        balance: tmb.teamId.balance,
        tmbId: tmb._id,
        teamDomain: tmb.teamId.teamDomain,
        role: tmb.role,
        status: tmb.status,
        permission: new TeamPermission({
          per: permData.permission ?? tmb.teamId.defaultPermission,
          isOwner: tmb.role === TeamMemberRoleEnum.owner
        })
      };
    })
    .filter((member) => member !== undefined) as TeamMemberItemType[];
}

export async function deleteTeamMember(tmbId: string) {
  await MongoTeamMember.deleteOne({ _id: tmbId });
  await MongoResourcePermission.deleteMany({ tmbId });
}

export async function leaveTeam(teamId: string, userId: string) {
  await MongoTeamMember.updateOne({ teamId, userId }, { status: TeamMemberStatusEnum.leave });
}

export async function inviteTeamMember({
  teamId,
  usernames,
  permission
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
    const createdTeamMembers = await MongoTeamMember.create(
      notInTeamUsernames.map((username) => ({
        teamId,
        userId: userMap.get(username),
        name: username,
        // role: TeamMemberRoleEnum.visitor,
        status: TeamMemberStatusEnum.waiting,
        createTime: new Date(),
        defaultTeam: false
      }))
    );
    // get tmbIds
    const tmbIds = createdTeamMembers.map((member) => member._id);
    // create permission
    await MongoResourcePermission.create(
      tmbIds.map((tmbId) => ({
        tmbId,
        teamId,
        resourceType: PerResourceTypeEnum.team,
        permission
      }))
    );
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
  // MongoTeamMember 根据currentTeamId和userId，修改defautlTeam为false
  await MongoTeamMember.updateMany(
    {
      teamId: currentTeamId,
      userId: userId
    },
    {
      defaultTeam: false
    }
  );

  // MongoTeamMember 根据newTeamId和userId，修改defautlTeam为true
  await MongoTeamMember.updateMany(
    {
      teamId: newTeamId,
      userId: userId
    },
    {
      defaultTeam: true
    }
  );

  const userDetail = await getUserDetail({
    tmbId: undefined,
    userId
  });

  return createJWT(userDetail);
}

export async function updateMemberPermission({ tmbIds, permission }: UpdateClbPermissionProps) {
  await MongoResourcePermission.updateMany(
    {
      tmbId: { $in: tmbIds },
      resourceType: PerResourceTypeEnum.team
    },
    {
      permission
    }
  );
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
