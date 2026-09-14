import type {
  AdminCreateTeamSchema,
  AdminTeamListQuery,
  AdminUpdateTeamSchema
} from '@fastgpt/global/openapi/admin/manage/api';
import type { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import type { z } from 'zod';
import { MongoApp } from '../../core/app/schema';
import { MongoDataset } from '../../core/dataset/schema';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { MongoGroupMemberModel } from '../../support/permission/memberGroup/groupMemberSchema';
import { MongoMemberGroupModel } from '../../support/permission/memberGroup/memberGroupSchema';
import { MongoOrgMemberModel } from '../../support/permission/org/orgMemberSchema';
import { MongoOrgModel } from '../../support/permission/org/orgSchema';
import { MongoResourcePermission } from '../../support/permission/schema';
import { MongoUser } from '../../support/user/schema';
import { createTeam } from '../../support/user/team/controller';
import { MongoTeam } from '../../support/user/team/teamSchema';
import { MongoTeamMember } from '../../support/user/team/teamMemberSchema';
import { setTeamStatusCache } from '../../support/user/team/status';
import { transferTeamMemberResources } from '../user/resource';

type CreateTeamInput = z.infer<typeof AdminCreateTeamSchema>;
type UpdateTeamInput = z.infer<typeof AdminUpdateTeamSchema>;

const assertTeamMemberIds = async (teamId: string, tmbIds: string[]) => {
  if (!tmbIds.length) return;
  if (tmbIds.length !== new Set(tmbIds).size) throw new Error('成员列表存在重复项');

  const count = await MongoTeamMember.countDocuments({
    _id: { $in: tmbIds },
    teamId,
    status: { $ne: TeamMemberStatusEnum.leave }
  });
  if (count !== tmbIds.length) throw new Error('成员不属于当前团队');
};

export const listAdminTeams = async (query: AdminTeamListQuery) => {
  const { pageNum, pageSize, searchKey, ownerId, status } = query;
  const filter = {
    deleteTime: { $exists: false },
    ...(searchKey ? { name: { $regex: searchKey, $options: 'i' } } : {}),
    ...(ownerId ? { ownerId } : {}),
    ...(status === 'frozen'
      ? { status: 'frozen' }
      : status === 'active'
        ? { status: { $ne: 'frozen' } }
        : {})
  };
  const [total, teams] = await Promise.all([
    MongoTeam.countDocuments(filter),
    MongoTeam.find(filter)
      .sort({ createTime: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .lean()
  ]);
  const list = await Promise.all(
    teams.map(async (team) => {
      const [owner, memberCount, appCount, datasetCount] = await Promise.all([
        MongoUser.findById(team.ownerId, 'username').lean(),
        MongoTeamMember.countDocuments({ teamId: team._id, status: { $ne: 'leave' } }),
        MongoApp.countDocuments({ teamId: team._id, deleteTime: null }),
        MongoDataset.countDocuments({ teamId: team._id, deleteTime: null })
      ]);
      return {
        id: String(team._id),
        name: team.name,
        avatar: team.avatar,
        ownerId: String(team.ownerId),
        ownerName: owner?.username ?? '已删除用户',
        status: team.status === 'frozen' ? 'frozen' : 'active',
        createTime: team.createTime,
        memberCount,
        appCount,
        datasetCount
      };
    })
  );
  return { total, list };
};

export const getAdminTeamDetail = async (teamId: string) => {
  const team = await MongoTeam.findOne({ _id: teamId, deleteTime: { $exists: false } }).lean();
  if (!team) throw new Error('团队不存在');
  const [owner, members, appCount, datasetCount, orgs, groups] = await Promise.all([
    MongoUser.findById(team.ownerId, 'username').lean(),
    MongoTeamMember.find({ teamId, status: { $ne: TeamMemberStatusEnum.leave } }).lean(),
    MongoApp.countDocuments({ teamId, deleteTime: null }),
    MongoDataset.countDocuments({ teamId, deleteTime: null }),
    MongoOrgModel.find({ teamId }).sort({ path: 1, name: 1 }).lean(),
    MongoMemberGroupModel.find({ teamId }).sort({ name: 1 }).lean()
  ]);
  const groupIds = groups.map((group) => group._id);
  const [groupMembers, orgMembers, memberUsers] = await Promise.all([
    MongoGroupMemberModel.find({ groupId: { $in: groupIds } }).lean(),
    MongoOrgMemberModel.find({ orgId: { $in: orgs.map((org) => org._id) } }).lean(),
    MongoUser.find({ _id: { $in: members.map((member) => member.userId) } }, 'username').lean()
  ]);
  const usernameMap = new Map(memberUsers.map((user) => [String(user._id), user.username]));

  return {
    id: String(team._id),
    name: team.name,
    avatar: team.avatar,
    ownerId: String(team.ownerId),
    ownerName: owner?.username ?? '已删除用户',
    status: team.status === 'frozen' ? 'frozen' : 'active',
    createTime: team.createTime,
    teamDomain: team.teamDomain,
    balance: team.balance,
    memberCount: members.length,
    appCount,
    datasetCount,
    members: members.map((member) => ({
      tmbId: String(member._id),
      userId: String(member.userId),
      username: usernameMap.get(String(member.userId)) ?? '已删除用户',
      memberName: member.name,
      status: member.status,
      isOwner: String(team.ownerId) === String(member.userId),
      createTime: member.createTime
    })),
    orgs: orgs.map((org) => ({
      id: String(org._id),
      name: org.name,
      path: org.path,
      pathId: org.pathId,
      tmbIds: orgMembers
        .filter((member) => String(member.orgId) === String(org._id))
        .map((member) => String(member.tmbId))
    })),
    groups: groups.map((group) => ({
      id: String(group._id),
      name: group.name,
      tmbIds: groupMembers
        .filter((member) => String(member.groupId) === String(group._id))
        .map((member) => String(member.tmbId)),
      members: groupMembers
        .filter((member) => String(member.groupId) === String(group._id))
        .map((member) => ({ tmbId: String(member.tmbId), role: member.role }))
    }))
  };
};

export const createAdminTeam = async (input: CreateTeamInput) => {
  if (await MongoTeam.exists({ name: input.name, deleteTime: { $exists: false } })) {
    throw new Error('团队名称已存在');
  }
  const user = await MongoUser.findById(input.ownerId);
  if (!user || user.status === 'forbidden' || user.username === 'root') {
    throw new Error('团队所有者不可用');
  }
  return mongoSessionRun(async (session) => {
    const members = await createTeam(
      { name: input.name, avatar: input.avatar ?? '/icon/logo.svg' },
      input.ownerId,
      session
    );
    const member = members[0];
    return { id: String(member.teamId) };
  });
};

export const updateAdminTeam = async (input: UpdateTeamInput) => {
  const team = await MongoTeam.findOne({ _id: input.id, deleteTime: { $exists: false } });
  if (!team) throw new Error('团队不存在');
  if (
    input.name &&
    input.name !== team.name &&
    (await MongoTeam.exists({
      _id: { $ne: team._id },
      name: input.name,
      deleteTime: { $exists: false }
    }))
  ) {
    throw new Error('团队名称已存在');
  }
  if (input.name) team.name = input.name;
  if (input.avatar !== undefined) team.avatar = input.avatar;
  if (input.teamDomain !== undefined) team.teamDomain = input.teamDomain;
  await team.save();
  return { id: input.id };
};

export const setAdminTeamFrozen = async (teamId: string, frozen: boolean) => {
  const team = await MongoTeam.findOne({ _id: teamId, deleteTime: { $exists: false } });
  if (!team) throw new Error('团队不存在');
  team.status = frozen ? 'frozen' : 'active';
  team.statusChangedAt = new Date();
  await team.save();
  await setTeamStatusCache(teamId, frozen ? 'frozen' : 'active');
  return { id: teamId };
};

export const transferAdminTeamOwner = async (teamId: string, targetUserId: string) => {
  const [team, user] = await Promise.all([
    MongoTeam.findById(teamId),
    MongoUser.findById(targetUserId)
  ]);
  if (!team || !user || user.status === 'forbidden' || user.username === 'root') {
    throw new Error('目标所有者不可用');
  }
  if (String(team.ownerId) === targetUserId) throw new Error('目标用户已是团队所有者');
  let targetMember = await MongoTeamMember.findOne({ teamId, userId: targetUserId });
  if (!targetMember) {
    [targetMember] = await MongoTeamMember.create([
      {
        teamId,
        userId: targetUserId,
        name: user.username,
        status: TeamMemberStatusEnum.active,
        createTime: new Date()
      }
    ]);
  } else if (targetMember.status !== TeamMemberStatusEnum.active) {
    targetMember.status = TeamMemberStatusEnum.active;
  }
  const oldOwner = await MongoTeamMember.findOne({ teamId, userId: team.ownerId });
  team.ownerId = user._id;
  targetMember.role = TeamMemberRoleEnum.owner;
  await Promise.all([
    team.save(),
    targetMember.save(),
    oldOwner
      ? MongoTeamMember.updateOne({ _id: oldOwner._id }, { $unset: { role: 1 } })
      : Promise.resolve()
  ]);
  return { id: teamId };
};

export const addAdminTeamMember = async (teamId: string, userId: string) => {
  const [team, user] = await Promise.all([MongoTeam.findById(teamId), MongoUser.findById(userId)]);
  if (!team || !user || user.status === 'forbidden') throw new Error('用户或团队不可用');
  const existing = await MongoTeamMember.findOne({ teamId, userId });
  if (existing) {
    existing.status = TeamMemberStatusEnum.active;
    await existing.save();
    return { id: String(existing._id) };
  }
  const member = await MongoTeamMember.create({
    teamId,
    userId,
    name: user.username,
    status: TeamMemberStatusEnum.active,
    createTime: new Date()
  });
  return { id: String(member._id) };
};

export const removeAdminTeamMember = async (teamId: string, tmbId: string) => {
  const [team, member] = await Promise.all([
    MongoTeam.findById(teamId),
    MongoTeamMember.findOne({ _id: tmbId, teamId })
  ]);
  if (!team || !member) throw new Error('成员不存在');
  if (String(team.ownerId) === String(member.userId)) throw new Error('请先转移团队所有权');
  const ownerMember = await MongoTeamMember.findOne({ teamId, userId: team.ownerId });
  if (!ownerMember) throw new Error('团队所有者成员信息不存在');
  await transferTeamMemberResources(tmbId, String(ownerMember._id));
  await MongoTeamMember.deleteOne({ _id: tmbId });
  return { id: tmbId };
};

export const updateAdminTeamMemberStatus = async (
  teamId: string,
  tmbId: string,
  status: TeamMemberStatusEnum.active | TeamMemberStatusEnum.forbidden
) => {
  const [team, member] = await Promise.all([
    MongoTeam.findById(teamId),
    MongoTeamMember.findOne({ _id: tmbId, teamId })
  ]);
  if (!team || !member) throw new Error('成员不存在');
  if (String(team.ownerId) === String(member.userId)) throw new Error('不能停用团队所有者');
  member.status = status;
  await member.save();
  return { id: tmbId };
};

export const updateAdminTeamMember = async (teamId: string, tmbId: string, name: string) => {
  const member = await MongoTeamMember.findOne({ _id: tmbId, teamId });
  if (!member) throw new Error('成员不存在');
  member.name = name;
  await member.save();
  return { id: tmbId };
};

export const createAdminOrg = async (teamId: string, name: string, parentOrgId?: string) => {
  const parent = parentOrgId
    ? await MongoOrgModel.findOne({ _id: parentOrgId, teamId })
    : await MongoOrgModel.findOne({ teamId, path: '' });
  if (!parent) throw new Error('上级组织不存在');
  const path = `${parent.path}/${parent.pathId}`;
  const org = await MongoOrgModel.create({ teamId, name, path });
  return { id: String(org._id) };
};

export const updateAdminOrg = async (
  teamId: string,
  orgId: string,
  name: string,
  tmbIds?: string[]
) => {
  const result = await MongoOrgModel.updateOne({ _id: orgId, teamId }, { $set: { name } });
  if (!result.matchedCount) throw new Error('组织不存在');
  if (tmbIds) await updateAdminOrgMembers(teamId, orgId, tmbIds);
  return { id: orgId };
};

export const deleteAdminOrg = async (teamId: string, orgId: string) => {
  const org = await MongoOrgModel.findOne({ _id: orgId, teamId });
  if (!org) throw new Error('组织不存在');
  if (org.path === '') throw new Error('不能删除根组织');
  const childPath = `${org.path}/${org.pathId}`;
  const orgs = await MongoOrgModel.find({
    teamId,
    $or: [{ _id: orgId }, { path: { $regex: `^${childPath}` } }]
  });
  const ids = orgs.map((item) => item._id);
  await Promise.all([
    MongoOrgMemberModel.deleteMany({ orgId: { $in: ids } }),
    MongoResourcePermission.deleteMany({ orgId: { $in: ids } }),
    MongoOrgModel.deleteMany({ _id: { $in: ids } })
  ]);
  return { id: orgId };
};

export const moveAdminOrg = async (teamId: string, orgId: string, parentOrgId: string) => {
  const [org, parent] = await Promise.all([
    MongoOrgModel.findOne({ _id: orgId, teamId }),
    MongoOrgModel.findOne({ _id: parentOrgId, teamId })
  ]);
  if (!org || !parent) throw new Error('组织不存在');
  if (org.path === '') throw new Error('不能移动根组织');
  if (orgId === parentOrgId) throw new Error('不能移动到当前组织');

  const oldChildrenPrefix = `${org.path}/${org.pathId}`;
  if (parent.path === oldChildrenPrefix || parent.path.startsWith(`${oldChildrenPrefix}/`)) {
    throw new Error('不能移动到当前组织的子组织');
  }

  const newPath = `${parent.path}/${parent.pathId}`;
  const children = await MongoOrgModel.find({
    teamId,
    path: { $regex: `^${oldChildrenPrefix}` }
  });
  org.path = newPath;
  await org.save();
  await Promise.all(
    children.map((child) => {
      child.path = `${newPath}/${org.pathId}${child.path.slice(oldChildrenPrefix.length)}`;
      return child.save();
    })
  );
  return { id: orgId };
};

export const updateAdminOrgMembers = async (teamId: string, orgId: string, tmbIds: string[]) => {
  if (!(await MongoOrgModel.exists({ _id: orgId, teamId }))) throw new Error('组织不存在');
  await assertTeamMemberIds(teamId, tmbIds);
  await MongoOrgMemberModel.deleteMany({ teamId, orgId });
  if (tmbIds.length) {
    await MongoOrgMemberModel.insertMany(tmbIds.map((tmbId) => ({ teamId, orgId, tmbId })));
  }
  return { id: orgId };
};

type AdminGroupMember = { tmbId: string; role: `${GroupMemberRole}` };

export const createAdminGroup = async (
  teamId: string,
  name: string,
  members: AdminGroupMember[]
) => {
  if (name === DefaultGroupName) throw new Error('分组名称不可用');
  if (await MongoMemberGroupModel.exists({ teamId, name })) throw new Error('分组名称已存在');
  await assertTeamMemberIds(
    teamId,
    members.map((member) => member.tmbId)
  );

  const group = await MongoMemberGroupModel.create({ teamId, name });
  if (members.length) {
    await MongoGroupMemberModel.insertMany(
      members.map(({ tmbId, role }) => ({
        groupId: group._id,
        tmbId,
        role
      }))
    );
  }
  return { id: String(group._id) };
};

export const updateAdminGroup = async (
  teamId: string,
  groupId: string,
  name: string,
  members: AdminGroupMember[]
) => {
  const group = await MongoMemberGroupModel.findOne({ _id: groupId, teamId });
  if (!group) throw new Error('分组不存在');
  if (group.name === DefaultGroupName) throw new Error('不能修改默认分组');
  if (
    await MongoMemberGroupModel.exists({
      _id: { $ne: groupId },
      teamId,
      name
    })
  ) {
    throw new Error('分组名称已存在');
  }
  await assertTeamMemberIds(
    teamId,
    members.map((member) => member.tmbId)
  );

  group.name = name;
  await group.save();
  await MongoGroupMemberModel.deleteMany({ groupId });
  if (members.length) {
    await MongoGroupMemberModel.insertMany(
      members.map(({ tmbId, role }) => ({
        groupId,
        tmbId,
        role
      }))
    );
  }
  return { id: groupId };
};

export const deleteAdminGroup = async (teamId: string, groupId: string) => {
  const group = await MongoMemberGroupModel.findOne({ _id: groupId, teamId });
  if (!group) throw new Error('分组不存在');
  if (group.name === DefaultGroupName) throw new Error('不能删除默认分组');
  await Promise.all([
    MongoGroupMemberModel.deleteMany({ groupId }),
    MongoResourcePermission.deleteMany({ groupId }),
    group.deleteOne()
  ]);
  return { id: groupId };
};

export const updateAdminTeamBalance = async (teamId: string, balance: number) => {
  const result = await MongoTeam.updateOne({ _id: teamId }, { $set: { balance } });
  if (!result.matchedCount) throw new Error('团队不存在');
  return { id: teamId };
};
