import {
  TeamMemberItemType,
  TeamMemberSchema,
  TeamMemberWithTeamAndUserSchema,
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
import {
  createJWT,
  getClbsAndGroupsWithInfo,
  getResourcePermission
} from '../../permission/controller';
import {
  OwnerPermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { TeamDefaultPermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoMemberGroupModel } from '../../permission/memberGroup/memberGroupSchema';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { MongoResourcePermission } from '../../permission/schema';
import { getUserDetail } from '../controller';
import { MongoUser } from '../schema';
import {
  ResourcePerWithGroup,
  ResourcePerWithOrg,
  ResourcePerWithTmbWithUser
} from '@fastgpt/global/support/permission/type';
import { MongoGroupMemberModel } from '../../permission/memberGroup/groupMemberSchema';
import { MongoDataset } from '../../../core/dataset/schema';
import { MongoApp } from '../../../core/app/schema';
import { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import { getAIApi } from '../../../core/ai/config';
import {
  createRootOrg,
  getRootOrgByTeamId,
  listOrgPathByTeamId
} from '../../permission/org/controllers';
import { refreshSourceAvatar } from '../../../common/file/image/controller';
import { PaginationResponse } from '../../../../web/common/fetch/type';
import {
  CollaboratorItemType,
  DeletePermissionQuery,
  UpdateClbPermissionProps
} from '@fastgpt/global/support/permission/collaborator';
import { MongoOrgModel } from '../../permission/org/orgSchema';
import { MongoOrgMemberModel } from '../../permission/org/orgMemberSchema';

async function getTeamMember(match: Record<string, any>): Promise<TeamTmbItemType> {
  const tmb = await MongoTeamMember.findOne(match).populate<{ team: TeamSchema }>('team').lean();
  if (!tmb) {
    return Promise.reject('member not exist');
  }

  const Per = await getResourcePermission({
    resourceType: PerResourceTypeEnum.team,
    teamId: tmb.teamId,
    tmbId: tmb._id
  });

  return {
    userId: String(tmb.userId),
    teamId: String(tmb.teamId),
    teamAvatar: tmb.team.avatar,
    teamName: tmb.team.name,
    memberName: tmb.name,
    avatar: tmb.avatar,
    balance: tmb.team.balance,
    tmbId: String(tmb._id),
    teamDomain: tmb.team?.teamDomain,
    role: tmb.role,
    status: tmb.status,
    permission: new TeamPermission({
      per: Per ?? TeamDefaultPermissionVal,
      isOwner: tmb.role === TeamMemberRoleEnum.owner
    }),
    notificationAccount: tmb.team.notificationAccount,

    lafAccount: tmb.team.lafAccount,
    openaiAccount: tmb.team.openaiAccount,
    externalWorkflowVariables: tmb.team.externalWorkflowVariables
  };
}

export const getTeamOwner = async (teamId: string) => {
  const tmb = await MongoTeamMember.findOne({
    teamId,
    role: TeamMemberRoleEnum.owner
  }).lean();
  return tmb;
};

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
    userId: new Types.ObjectId(userId)
  });
}

export async function createDefaultTeam({
  userId,
  teamName = 'My Team',
  avatar = '/icon/logo.svg',
  session
}: {
  userId: string;
  teamName?: string;
  avatar?: string;
  session: ClientSession;
}) {
  // auth default team
  const tmb = await MongoTeamMember.findOne({
    userId: new Types.ObjectId(userId)
  });

  if (!tmb) {
    // create team
    const [{ _id: insertedId }] = await MongoTeam.create(
      [
        {
          ownerId: userId,
          name: teamName,
          avatar,
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
          createTime: new Date()
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
    await createRootOrg({ teamId: tmb.teamId, session });
    console.log('create default team, group and root org', userId);
    return tmb;
  } else {
    console.log('default team exist', userId);
  }
}

export async function updateTeam({
  teamId,
  name,
  avatar,
  teamDomain,
  lafAccount,
  openaiAccount,
  externalWorkflowVariable
}: UpdateTeamProps & { teamId: string }) {
  if (global.feConfigs?.userDefaultTeam === name) {
    return Promise.reject('The team name is not allowed');
  }
  // auth openai key
  if (openaiAccount?.key) {
    console.log('auth user openai key', openaiAccount?.key);
    const baseUrl = openaiAccount?.baseUrl || 'https://api.openai.com/v1';
    openaiAccount.baseUrl = baseUrl;

    const ai = getAIApi({
      userKey: openaiAccount
    });

    const response = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }]
    });
    if (response?.choices?.[0]?.message?.content === undefined) {
      return Promise.reject('Key response is empty');
    }
  }

  return mongoSessionRun(async (session) => {
    const unsetObj = (() => {
      const obj: Record<string, 1> = {};
      if (lafAccount?.pat === '') {
        obj.lafAccount = 1;
      }
      if (openaiAccount?.key === '') {
        obj.openaiAccount = 1;
      }
      if (externalWorkflowVariable) {
        if (externalWorkflowVariable.value === '') {
          obj[`externalWorkflowVariables.${externalWorkflowVariable.key}`] = 1;
        }
      }

      if (Object.keys(obj).length === 0) {
        return undefined;
      }
      return {
        $unset: obj
      };
    })();
    const setObj = (() => {
      const obj: Record<string, any> = {};
      if (lafAccount?.pat && lafAccount?.appid) {
        obj.lafAccount = lafAccount;
      }
      if (openaiAccount?.key && openaiAccount?.baseUrl) {
        obj.openaiAccount = openaiAccount;
      }
      if (externalWorkflowVariable) {
        if (externalWorkflowVariable.value !== '') {
          obj[`externalWorkflowVariables.${externalWorkflowVariable.key}`] =
            externalWorkflowVariable.value;
        }
      }
      if (Object.keys(obj).length === 0) {
        return undefined;
      }
      return obj;
    })();

    // This is where we get the old team
    const team = await MongoTeam.findByIdAndUpdate(
      teamId,
      {
        $set: {
          ...(name ? { name } : {}),
          ...(avatar ? { avatar } : {}),
          ...(teamDomain ? { teamDomain } : {}),
          ...setObj
        },
        ...unsetObj
      },
      { session }
    );

    // Update member group avatar
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

      await refreshSourceAvatar(avatar, team?.avatar, session);
    }
  });
}

export async function createTeam(
  { name, avatar }: CreateTeamProps,
  userId: string,
  session: ClientSession
) {
  if (global.feConfigs?.userDefaultTeam === name) {
    return Promise.reject('The team name is not allowed');
  }

  const user = await MongoUser.findById(userId, undefined, { session }).lean();
  if (!user) {
    return Promise.reject('用户不存在');
  }

  const [{ _id: teamId }] = await MongoTeam.create(
    [
      {
        ownerId: userId,
        name: name,
        avatar: avatar,
        createTime: new Date()
      }
    ],
    { session }
  );
  await MongoOrgModel.create(
    [
      {
        teamId,
        name: name,
        path: ''
      }
    ],
    { session }
  );
  await MongoMemberGroupModel.create(
    [
      {
        teamId,
        name: DefaultGroupName
      }
    ],
    { session }
  );
  return MongoTeamMember.create(
    [
      {
        teamId,
        userId,
        name: user.username,
        role: TeamMemberRoleEnum.owner,
        status: TeamMemberStatusEnum.active,
        createTime: new Date(),
        defaultTeam: false
      }
    ],
    { session }
  );
}

export async function listUserTeam(status: string, userId: string): Promise<TeamTmbItemType[]> {
  const tmbList = (await MongoTeamMember.find({ status, userId }).populate(
    'team'
  )) as unknown as TeamMemberWithTeamAndUserSchema[];

  // teams 转成 TeamTmbItemType 数据
  return tmbList.map((tmb) => ({
    userId: String(tmb.userId),
    teamId: String(tmb.team._id),
    teamName: tmb.team.name,
    memberName: tmb.name,
    avatar: tmb.team.avatar,
    balance: tmb.team.balance,
    tmbId: String(tmb._id),
    teamDomain: tmb.team.teamDomain,
    role: tmb.role,
    status: tmb.status
  })) as TeamTmbItemType[];
}

export async function getTeamMembers(
  teamId: string,
  pageSize: number,
  offset: number,
  status?: 'active' | 'inactive',
  withPermission?: boolean,
  withOrgs?: boolean,
  searchKey?: string,
  orgId?: string,
  groupId?: string
): Promise<PaginationResponse<TeamMemberItemType>> {
  const getTmbIdsByOrgId = async (orgId: string): Promise<string[]> => {
    const orgMembers = await MongoOrgMemberModel.find({ orgId }, 'tmbId').lean();
    return orgMembers.map((member) => member.tmbId);
  };

  const getTmbIdsByGroupId = async () => {
    const groupMembers = await MongoGroupMemberModel.find({ groupId }, 'tmbId role').lean();

    // 单次遍历提取数据和构建映射
    const [tmbIds, tmbIdRoleMap] = groupMembers.reduce(
      (acc, member) => {
        acc[0].push(member.tmbId);
        acc[1][member.tmbId] = member.role;
        return acc;
      },
      [[], {}] as [string[], Record<string, string>]
    );

    return { tmbIds, tmbIdRoleMap };
  };

  let tmbIdGroupRole: Record<string, string> = {};

  const tmbIdsCondition = await (async () => {
    if (orgId === '') {
      const rootOrg = await getRootOrgByTeamId(teamId);
      return { _id: rootOrg ? { $in: await getTmbIdsByOrgId(rootOrg._id) } : {} };
    } else if (orgId) {
      return { _id: { $in: await getTmbIdsByOrgId(orgId) } };
    }
    if (groupId) {
      const { tmbIds, tmbIdRoleMap } = await getTmbIdsByGroupId();
      tmbIdGroupRole = tmbIdRoleMap;
      return { _id: { $in: tmbIds } };
    }
    return {};
  })();

  const statusCondition = (() => {
    if (status === 'active') return { status: notLeaveStatus };
    if (status === 'inactive') return { status: TeamMemberStatusEnum.leave };
    return {};
  })();
  const searchCondition = (() => {
    if (!searchKey) return {};
    return {
      $or: [{ name: { $regex: searchKey, $options: 'i' } }]
    };
  })();
  // 构建查询条件
  const baseCondition = {
    teamId,
    ...statusCondition,
    ...tmbIdsCondition,
    ...searchCondition
  };

  // 统一查询条件
  const [total, tmbUserList] = (await Promise.all([
    MongoTeamMember.countDocuments(baseCondition),
    MongoTeamMember.find(baseCondition)
      .populate('team')
      .populate('user')
      .skip(offset)
      .limit(pageSize)
      .lean()
  ])) as unknown as [number, TeamMemberWithTeamAndUserSchema[]];
  const tmbIds = tmbUserList.map((tmb) => tmb._id.toString());
  const getPermissionData = async (
    tmbIds: string[],
    teamId: string
  ): Promise<
    Record<
      string,
      {
        permission?: number;
      }
    >
  > => {
    if (tmbIds.length === 0) return {};

    const permissions = await MongoResourcePermission.find({
      tmbId: { $in: tmbIds },
      teamId,
      resourceType: PerResourceTypeEnum.team
    }).lean();

    return permissions.reduce(
      (acc, perm) => {
        if (perm.tmbId && perm.permission !== undefined) {
          acc[perm.tmbId] = { permission: perm.permission };
        }
        return acc;
      },
      {} as Record<string, { permission?: number }>
    );
  };
  const getOrgPathData = async (tmbIds: string[]) => {
    const orgMembers = await MongoOrgMemberModel.find({ tmbId: { $in: tmbIds } }).lean();
    const orgPaths = await listOrgPathByTeamId(teamId);

    // 构建 tmbIdPaths 数据
    const tmbIdPaths: Record<string, string[]> = {};

    for (const orgMember of orgMembers) {
      const orgId = orgMember.orgId;
      const path = orgPaths[orgId];
      tmbIdPaths[orgMember.tmbId] = tmbIdPaths[orgMember.tmbId] || [];
      tmbIdPaths[orgMember.tmbId].push(path);
    }
    return tmbIdPaths;
  };

  // 并行处理关联数据
  const [permissionData, orgPathData] = await Promise.all([
    withPermission
      ? getPermissionData(tmbIds, teamId)
      : Promise.resolve({} as Record<string, { permission?: number }>),
    withOrgs ? getOrgPathData(tmbIds) : Promise.resolve({} as Record<string, string[]>)
  ]);
  return {
    total,
    list: tmbUserList
      .map((tmb) => {
        if (!tmb || !tmb._id || !tmb.userId || !tmb.teamId) {
          console.warn(`Incomplete team member data encountered: ${JSON.stringify(tmb)}`);
          return;
        }
        const tmbId = tmb._id.toString();
        return {
          userId: tmb.user._id,
          teamId: tmb.team._id,
          memberName: tmb.name,
          avatar: tmb.avatar,
          tmbId: tmb._id,
          role: tmb.role,
          status: tmb.status,
          createTime: tmb.createTime,
          updateTime: tmb.updateTime,
          permission: withPermission
            ? new TeamPermission({
                per: (permissionData[tmbId]?.permission ?? TeamDefaultPermissionVal) as number,
                isOwner: tmb.role === TeamMemberRoleEnum.owner
              })
            : undefined,
          orgs: withOrgs ? orgPathData[tmbId] || [] : undefined,
          groupRole: groupId ? tmbIdGroupRole[tmbId] : undefined
        };
      })
      .filter((member) => member !== undefined) as unknown as TeamMemberItemType[]
  };
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
    userId: ownerId
    // role: TeamMemberRoleEnum.owner
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

  const ownerGroups = await MongoGroupMemberModel.find({
    tmbId: leaveTmbId,
    role: GroupMemberRole.owner
  }).lean();
  // 转移mongo group 的所有者
  await Promise.all(
    ownerGroups.map(async (group) => {
      await MongoGroupMemberModel.updateOne(
        {
          groupId: group.groupId,
          role: GroupMemberRole.owner,
          tmbId: leaveTmbId
        },
        {
          $set: {
            tmbId: ownerTmbId
          }
        }
      );
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
    }).populate('user')) as unknown as TeamMemberWithTeamAndUserSchema[];

    // get exist team member usernames
    existTeamMemberUsernames = existTeamMembers.map((member) => member.user.username);

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
        name: username,
        // status: TeamMemberStatusEnum.waiting,
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

export async function switchTeam(newTeamId: string, userId: string) {
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

export async function updatePermission(
  updateClbPermissionProps: UpdateClbPermissionProps,
  teamId: String
) {
  const per = updateClbPermissionProps.permission;
  const memberIds = updateClbPermissionProps.members;
  const groupIds = updateClbPermissionProps.groups;
  const orgIds = updateClbPermissionProps.orgs;

  if (memberIds && memberIds.length > 0) {
    await Promise.all(
      memberIds.map(async (memberId) => {
        await MongoResourcePermission.updateOne(
          { teamId, tmbId: memberId, resourceType: PerResourceTypeEnum.team },
          { $set: { permission: per } },
          { upsert: true }
        );
      })
    );
  }

  if (groupIds && groupIds.length > 0) {
    await Promise.all(
      groupIds.map(async (groupId) => {
        await MongoResourcePermission.updateOne(
          { teamId, groupId: groupId, resourceType: PerResourceTypeEnum.team },
          { $set: { permission: per, groupId: groupId } },
          { upsert: true }
        );
      })
    );
  }

  if (orgIds && orgIds.length > 0) {
    await Promise.all(
      orgIds.map(async (orgId) => {
        await MongoResourcePermission.updateOne(
          { teamId, orgId: orgId, resourceType: PerResourceTypeEnum.team },
          { $set: { permission: per, orgId: orgId } },
          { upsert: true }
        );
      })
    );
  }
}

export async function listMemberClbs(teamId: string) {
  const permissionTypes = await getClbsAndGroupsWithInfo({
    teamId,
    resourceType: PerResourceTypeEnum.team
  });
  if (!permissionTypes) {
    return [];
  }
  const perList: CollaboratorItemType[] = [];
  permissionTypes.map((item) => {
    //  判断item是ResourcePerWithTmbWithUser[]类型
    item.map((per) => {
      if (per.tmbId) {
        const rpt = per as unknown as ResourcePerWithTmbWithUser;
        perList.push({
          teamId: rpt.teamId,
          tmbId: rpt.tmb._id,
          permission: new TeamPermission({
            per: rpt.permission
            // isOwner: String(resource.tmbId) === String(rpt.tmb._id)
          }),
          name: rpt.tmb.name,
          avatar: rpt.tmb.avatar
        });
      }
      if (per.groupId) {
        const rpg = per as ResourcePerWithGroup;
        perList.push({
          teamId: rpg.teamId,
          groupId: rpg.group._id,
          permission: new TeamPermission({
            per: rpg.permission
          }),
          name: rpg.group.name,
          avatar: rpg.group.avatar
        });
      }
      if (per.orgId) {
        const rpg = per as ResourcePerWithOrg;
        perList.push({
          teamId: rpg.teamId,
          orgId: rpg.org._id,
          permission: new TeamPermission({
            per: rpg.permission
          }),
          name: rpg.org.name,
          avatar: rpg.org.avatar || ''
        });
      }
    });
  });
  return perList;
}

export async function deleteMemberPermission(deletePermissionQuery: DeletePermissionQuery) {
  await MongoResourcePermission.deleteOne({
    ...deletePermissionQuery,
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
