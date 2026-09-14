import { AdminTeamActionSchema } from '@fastgpt/global/openapi/admin/manage/api';
import { addAdminAuditLog, runAdminAuditedAction } from '@fastgpt/service/admin/audit/controller';
import {
  assertNoActiveAdminTask,
  createAdminTask,
  updateAdminTask
} from '@fastgpt/service/admin/operation/controller';
import {
  addAdminTeamMember,
  createAdminGroup,
  createAdminOrg,
  deleteAdminGroup,
  deleteAdminOrg,
  getAdminTeamDetail,
  moveAdminOrg,
  removeAdminTeamMember,
  setAdminTeamFrozen,
  transferAdminTeamOwner,
  updateAdminGroup,
  updateAdminOrg,
  updateAdminOrgMembers,
  updateAdminTeamBalance,
  updateAdminTeamMember,
  updateAdminTeamMemberStatus
} from '@fastgpt/service/admin/team/controller';
import { addTeamDeleteJob } from '@fastgpt/service/support/user/team/delete';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { setTeamStatusCache } from '@fastgpt/service/support/user/team/status';
import { getAdminContext } from '@/service/auth';
import { AdminAPI } from '@/service/middleware/entry';

export default AdminAPI(async (req) => {
  if (req.method !== 'POST') throw new Error('不支持的请求方法');
  const admin = await getAdminContext(req);
  const input = AdminTeamActionSchema.parse(req.body);
  const team = await getAdminTeamDetail(input.teamId);

  if (input.action === 'delete') {
    if (input.confirmName !== team.name) throw new Error('输入的团队名称不匹配');
    if (team.ownerName === 'root') throw new Error('不能删除 root 所属团队');
    const task = await createAdminTask({
      type: 'team.delete',
      targetType: 'team',
      targetId: input.teamId,
      targetName: team.name,
      operatorId: admin.userId,
      ip: admin.ip
    });
    await MongoTeam.updateOne(
      { _id: input.teamId },
      { $set: { status: 'frozen', deleteTime: new Date(), statusChangedAt: new Date() } }
    );
    await setTeamStatusCache(input.teamId, 'frozen');
    try {
      await addTeamDeleteJob({ teamId: input.teamId, adminTaskId: String(task._id) });
    } catch (error) {
      const message = error instanceof Error ? error.message : '任务入队失败';
      await updateAdminTask(String(task._id), {
        status: 'failed',
        currentStep: '任务入队失败',
        error: message
      });
      await addAdminAuditLog({
        operatorId: admin.userId,
        event: 'team.delete',
        targetType: 'team',
        targetId: input.teamId,
        targetName: team.name,
        success: false,
        error: message,
        ip: admin.ip,
        taskId: String(task._id)
      });
      throw error;
    }
    return { taskId: String(task._id) };
  }

  if (input.action === 'freeze' && team.ownerName === 'root') {
    throw new Error('不能冻结 root 所属团队');
  }

  await assertNoActiveAdminTask('team', input.teamId);
  return runAdminAuditedAction(
    {
      operatorId: admin.userId,
      event: `team.${input.action}`,
      targetType: 'team',
      targetId: input.teamId,
      targetName: team.name,
      ip: admin.ip
    },
    async () => {
      if (input.action === 'freeze') return setAdminTeamFrozen(input.teamId, true);
      if (input.action === 'unfreeze') return setAdminTeamFrozen(input.teamId, false);
      if (input.action === 'transferOwner') {
        return transferAdminTeamOwner(input.teamId, input.targetUserId);
      }
      if (input.action === 'addMember') return addAdminTeamMember(input.teamId, input.userId);
      if (input.action === 'removeMember') return removeAdminTeamMember(input.teamId, input.tmbId);
      if (input.action === 'updateMember') {
        return updateAdminTeamMember(input.teamId, input.tmbId, input.name);
      }
      if (input.action === 'updateMemberStatus') {
        return updateAdminTeamMemberStatus(input.teamId, input.tmbId, input.status);
      }
      if (input.action === 'createOrg') {
        return createAdminOrg(input.teamId, input.name, input.parentOrgId);
      }
      if (input.action === 'updateOrg') {
        return updateAdminOrg(input.teamId, input.orgId, input.name, input.tmbIds);
      }
      if (input.action === 'deleteOrg') return deleteAdminOrg(input.teamId, input.orgId);
      if (input.action === 'moveOrg') {
        return moveAdminOrg(input.teamId, input.orgId, input.parentOrgId);
      }
      if (input.action === 'updateOrgMembers') {
        return updateAdminOrgMembers(input.teamId, input.orgId, input.tmbIds);
      }
      if (input.action === 'createGroup') {
        return createAdminGroup(input.teamId, input.name, input.members);
      }
      if (input.action === 'updateGroup') {
        return updateAdminGroup(input.teamId, input.groupId, input.name, input.members);
      }
      if (input.action === 'deleteGroup') {
        return deleteAdminGroup(input.teamId, input.groupId);
      }
      return updateAdminTeamBalance(input.teamId, input.balance);
    }
  );
});
