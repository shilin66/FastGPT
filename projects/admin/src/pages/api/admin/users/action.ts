import { AdminUserActionSchema } from '@fastgpt/global/openapi/admin/manage/api';
import { addAdminAuditLog, runAdminAuditedAction } from '@fastgpt/service/admin/audit/controller';
import {
  assertNoActiveAdminTask,
  createAdminTask,
  updateAdminTask
} from '@fastgpt/service/admin/operation/controller';
import { addAdminUserOperationJob } from '@fastgpt/service/admin/operation/queue';
import {
  freezeAdminUser,
  getAdminUserDetail,
  resetAdminUserPassword,
  unfreezeAdminUser
} from '@fastgpt/service/admin/user/controller';
import { AdminAPI } from '@/service/middleware/entry';
import { getAdminContext } from '@/service/auth';

export default AdminAPI(async (req) => {
  if (req.method !== 'POST') throw new Error('不支持的请求方法');
  const admin = await getAdminContext(req);
  const input = AdminUserActionSchema.parse(req.body);
  const user = await getAdminUserDetail(input.userId);

  if (input.action === 'transfer' || input.action === 'delete') {
    if (input.action === 'delete' && input.confirmName !== user.username) {
      throw new Error('输入的用户名不匹配');
    }
    const task = await createAdminTask({
      type: input.action === 'transfer' ? 'user.transfer' : 'user.delete',
      targetType: 'user',
      targetId: input.userId,
      targetName: user.username,
      operatorId: admin.userId,
      ip: admin.ip,
      payload: input.action === 'transfer' ? { targetUserId: input.targetUserId } : undefined
    });
    try {
      await addAdminUserOperationJob(String(task._id));
    } catch (error) {
      const message = error instanceof Error ? error.message : '任务入队失败';
      await updateAdminTask(String(task._id), {
        status: 'failed',
        currentStep: '任务入队失败',
        error: message
      });
      await addAdminAuditLog({
        operatorId: admin.userId,
        event: task.type,
        targetType: 'user',
        targetId: input.userId,
        targetName: user.username,
        success: false,
        error: message,
        ip: admin.ip,
        taskId: String(task._id)
      });
      throw error;
    }
    return { taskId: String(task._id) };
  }

  await assertNoActiveAdminTask('user', input.userId);
  return runAdminAuditedAction(
    {
      operatorId: admin.userId,
      event: `user.${input.action}`,
      targetType: 'user',
      targetId: input.userId,
      targetName: user.username,
      ip: admin.ip
    },
    async () => {
      if (input.action === 'freeze') return freezeAdminUser(input.userId);
      if (input.action === 'unfreeze') return unfreezeAdminUser(input.userId);
      return resetAdminUserPassword(input.userId, input.password);
    }
  );
});
