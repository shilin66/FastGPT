import {
  TeamMemberStatusEnum,
  TeamMemberRoleEnum
} from '@fastgpt/global/support/user/team/constant';
import { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import { deleteSkill } from '../../core/agentSkills/controller';
import { MongoAgentSkills } from '../../core/agentSkills/schema';
import { addAppDeleteJob } from '../../core/app/delete';
import { MongoApp } from '../../core/app/schema';
import { addDatasetDeleteJob } from '../../core/dataset/delete';
import { MongoDataset } from '../../core/dataset/schema';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { MongoGroupMemberModel } from '../../support/permission/memberGroup/groupMemberSchema';
import { MongoOrgMemberModel } from '../../support/permission/org/orgMemberSchema';
import { MongoResourcePermission } from '../../support/permission/schema';
import { MongoUser } from '../../support/user/schema';
import { MongoUserAuth } from '../../support/user/auth/schema';
import { delUserAllSession } from '../../support/user/session';
import { deleteTeamData } from '../../support/user/team/delete/processor';
import { MongoTeam } from '../../support/user/team/teamSchema';
import { MongoTeamMember } from '../../support/user/team/teamMemberSchema';
import { setTeamStatusCache } from '../../support/user/team/status';

const groupRoleRank = {
  [GroupMemberRole.member]: 0,
  [GroupMemberRole.admin]: 1,
  [GroupMemberRole.owner]: 2
} as const;

const moveMembershipReferences = async (sourceTmbId: string, targetTmbId: string) => {
  const permissions = await MongoResourcePermission.find({ tmbId: sourceTmbId });
  for (const permission of permissions) {
    const identity = {
      teamId: permission.teamId,
      resourceType: permission.resourceType,
      ...(permission.resourceId ? { resourceId: permission.resourceId } : {}),
      ...(permission.resourceName ? { resourceName: permission.resourceName } : {})
    };
    const target = await MongoResourcePermission.findOne({ ...identity, tmbId: targetTmbId });
    if (target) {
      const mergedPermission = permission.permission | target.permission;
      if (mergedPermission !== target.permission) {
        target.permission = mergedPermission;
        await target.save();
      }
      await permission.deleteOne();
    } else {
      permission.tmbId = targetTmbId;
      await permission.save();
    }
  }

  const groupRecords = await MongoGroupMemberModel.find({ tmbId: sourceTmbId });
  for (const record of groupRecords) {
    const duplicate = await MongoGroupMemberModel.findOne({
      groupId: record.groupId,
      tmbId: targetTmbId
    });
    if (duplicate) {
      if (groupRoleRank[record.role] > groupRoleRank[duplicate.role]) {
        duplicate.role = record.role;
        await duplicate.save();
      }
      await record.deleteOne();
    } else {
      record.tmbId = targetTmbId;
      await record.save();
    }
  }

  const orgRecords = await MongoOrgMemberModel.find({ tmbId: sourceTmbId });
  for (const record of orgRecords) {
    const duplicate = await MongoOrgMemberModel.exists({
      orgId: record.orgId,
      tmbId: targetTmbId
    });
    if (duplicate) await record.deleteOne();
    else {
      record.tmbId = targetTmbId;
      await record.save();
    }
  }
};

export const transferTeamMemberResources = async (sourceTmbId: string, targetTmbId: string) => {
  await Promise.all([
    MongoApp.updateMany({ tmbId: sourceTmbId }, { $set: { tmbId: targetTmbId } }),
    MongoDataset.updateMany({ tmbId: sourceTmbId }, { $set: { tmbId: targetTmbId } }),
    MongoAgentSkills.updateMany({ tmbId: sourceTmbId }, { $set: { tmbId: targetTmbId } })
  ]);
  await moveMembershipReferences(sourceTmbId, targetTmbId);
};

export const transferAdminUserResources = async (userId: string, targetUserId: string) => {
  if (userId === targetUserId) throw new Error('接收人不能是源用户');
  const [source, target] = await Promise.all([
    MongoUser.findById(userId),
    MongoUser.findById(targetUserId)
  ]);
  if (!source || !target) throw new Error('用户不存在');
  if (source.username === 'root' || target.username === 'root')
    throw new Error('root 不能参与资源转移');
  if (target.status === 'forbidden') throw new Error('接收用户已冻结');

  const originalStatus = source.status;
  source.status = 'forbidden';
  await source.save();
  await delUserAllSession(userId);

  try {
    const sourceMembers = await MongoTeamMember.find({ userId });
    for (const sourceMember of sourceMembers) {
      let targetMember = await MongoTeamMember.findOne({
        teamId: sourceMember.teamId,
        userId: targetUserId
      });
      if (!targetMember) {
        [targetMember] = await MongoTeamMember.create([
          {
            teamId: sourceMember.teamId,
            userId: targetUserId,
            name: target.username,
            status: TeamMemberStatusEnum.active,
            createTime: new Date()
          }
        ]);
      } else if (targetMember.status !== TeamMemberStatusEnum.active) {
        targetMember.status = TeamMemberStatusEnum.active;
        await targetMember.save();
      }

      const team = await MongoTeam.findById(sourceMember.teamId);
      if (team && String(team.ownerId) === userId) {
        team.ownerId = target._id;
        targetMember.role = TeamMemberRoleEnum.owner;
        await Promise.all([
          team.save(),
          MongoTeamMember.updateOne({ _id: sourceMember._id }, { $unset: { role: 1 } }),
          targetMember.save()
        ]);
      }

      await transferTeamMemberResources(String(sourceMember._id), String(targetMember._id));
    }
  } finally {
    source.status = originalStatus;
    await source.save();
  }
};

const queueOwnedResourceDeletion = async (tmbIds: readonly string[]) => {
  const [apps, datasets, skills] = await Promise.all([
    MongoApp.find({ tmbId: { $in: tmbIds }, deleteTime: null }, '_id teamId parentId'),
    MongoDataset.find({ tmbId: { $in: tmbIds }, deleteTime: null }, '_id teamId parentId'),
    MongoAgentSkills.find({ tmbId: { $in: tmbIds }, deleteTime: null }, '_id teamId')
  ]);
  const now = new Date();
  await Promise.all([
    MongoApp.updateMany(
      { _id: { $in: apps.map((item) => item._id) } },
      { $set: { deleteTime: now } }
    ),
    MongoDataset.updateMany(
      { _id: { $in: datasets.map((item) => item._id) } },
      { $set: { deleteTime: now } }
    )
  ]);
  await Promise.all([
    ...apps
      .filter((item) => !item.parentId)
      .map((item) => addAppDeleteJob({ teamId: String(item.teamId), appId: String(item._id) })),
    ...datasets
      .filter((item) => !item.parentId)
      .map((item) =>
        addDatasetDeleteJob({ teamId: String(item.teamId), datasetId: String(item._id) })
      )
  ]);
  await mongoSessionRun(async (session) => {
    for (const skill of skills) {
      await deleteSkill({ skillId: String(skill._id), teamId: String(skill.teamId) }, session);
    }
  });
};

export const deleteAdminUserResources = async (userId: string) => {
  const user = await MongoUser.findById(userId);
  if (!user) throw new Error('用户不存在');
  if (user.username === 'root') throw new Error('不能删除 root 用户');
  user.status = 'forbidden';
  await user.save();
  await delUserAllSession(userId);

  const ownedTeams = await MongoTeam.find({ ownerId: userId, deleteTime: { $exists: false } });
  for (const team of ownedTeams) {
    team.deleteTime = new Date();
    team.status = 'frozen';
    await team.save();
    await setTeamStatusCache(String(team._id), 'frozen');
    await deleteTeamData(String(team._id));
  }

  const remainingMembers = await MongoTeamMember.find({ userId });
  const tmbIds = remainingMembers.map((member) => String(member._id));
  await queueOwnedResourceDeletion(tmbIds);
  await Promise.all([
    MongoResourcePermission.deleteMany({ tmbId: { $in: tmbIds } }),
    MongoGroupMemberModel.deleteMany({ tmbId: { $in: tmbIds } }),
    MongoOrgMemberModel.deleteMany({ tmbId: { $in: tmbIds } }),
    MongoTeamMember.deleteMany({ userId })
  ]);
  await MongoUserAuth.deleteMany({
    key: { $in: [user.username, user.contact].filter((value): value is string => !!value) }
  });
  await MongoUser.deleteOne({ _id: userId });
};
