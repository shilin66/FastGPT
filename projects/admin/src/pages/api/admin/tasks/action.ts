import { AdminTaskActionSchema } from '@fastgpt/global/openapi/admin/manage/api';
import { addAdminUserOperationJob } from '@fastgpt/service/admin/operation/queue';
import {
  getAdminTask,
  resetFailedAdminTask,
  updateAdminTask
} from '@fastgpt/service/admin/operation/controller';
import { addTeamDeleteJob } from '@fastgpt/service/support/user/team/delete';
import { getAdminContext } from '@/service/auth';
import { AdminAPI, allowAdminMethods } from '@/service/middleware/entry';

export default AdminAPI(allowAdminMethods('POST'), async (req) => {
  await getAdminContext(req);
  const input = AdminTaskActionSchema.parse(req.body);
  const task = await getAdminTask(input.taskId);
  if (task.status !== 'failed') throw new Error('仅失败任务可以重试');

  await resetFailedAdminTask(input.taskId);
  try {
    if (task.type === 'user.transfer' || task.type === 'user.delete') {
      await addAdminUserOperationJob(input.taskId);
    } else if (task.type === 'team.delete') {
      await addTeamDeleteJob({ teamId: task.targetId, adminTaskId: input.taskId });
    } else {
      throw new Error('该任务不支持重试');
    }
  } catch (error) {
    await updateAdminTask(input.taskId, {
      status: 'failed',
      currentStep: '重新入队失败',
      error: error instanceof Error ? error.message : '重新入队失败'
    });
    throw error;
  }

  return { id: input.taskId };
});
