import type { Processor } from 'bullmq';
import { getQueue, getWorker, QueueNames } from '../../common/bullmq';
import { addAdminAuditLog } from '../audit/controller';
import { deleteAdminUserResources, transferAdminUserResources } from '../user/resource';
import { getAdminTask, updateAdminTask } from './controller';

type AdminUserOperationJob = {
  taskId: string;
};

const adminUserOperationProcessor: Processor<AdminUserOperationJob> = async (job) => {
  const task = await getAdminTask(job.data.taskId);
  await updateAdminTask(String(task._id), {
    status: 'running',
    progress: 10,
    currentStep: '准备执行'
  });

  try {
    if (task.type === 'user.transfer') {
      const targetUserId = task.payload?.targetUserId;
      if (!targetUserId) throw new Error('缺少资源接收人');
      await updateAdminTask(String(task._id), {
        progress: 30,
        currentStep: '转移资源所有权'
      });
      await transferAdminUserResources(task.targetId, targetUserId);
    } else if (task.type === 'user.delete') {
      await updateAdminTask(String(task._id), {
        progress: 30,
        currentStep: '级联删除用户资源'
      });
      await deleteAdminUserResources(task.targetId);
    } else {
      throw new Error('不支持的用户任务类型');
    }

    await updateAdminTask(String(task._id), {
      status: 'succeeded',
      progress: 100,
      currentStep: '执行完成'
    });
    await addAdminAuditLog({
      operatorId: task.operatorId,
      event: task.type,
      targetType: task.targetType,
      targetId: task.targetId,
      targetName: task.targetName,
      success: true,
      ip: task.ip,
      taskId: String(task._id)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '任务执行失败';
    await updateAdminTask(String(task._id), {
      status: 'failed',
      currentStep: '执行失败',
      error: message
    });
    await addAdminAuditLog({
      operatorId: task.operatorId,
      event: task.type,
      targetType: task.targetType,
      targetId: task.targetId,
      targetName: task.targetName,
      success: false,
      error: message,
      ip: task.ip,
      taskId: String(task._id)
    });
    throw error;
  }
};

export const initAdminOperationWorker = () =>
  getWorker<AdminUserOperationJob>(QueueNames.adminUserOperation, adminUserOperationProcessor, {
    concurrency: 1,
    removeOnFail: { age: 90 * 24 * 60 * 60, count: 1000 }
  });

export const addAdminUserOperationJob = (taskId: string) => {
  const queue = getQueue<AdminUserOperationJob>(QueueNames.adminUserOperation, {
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: { age: 30 * 24 * 60 * 60 }
    }
  });
  return queue.add('admin_user_operation', { taskId }, { jobId: `${taskId}-${Date.now()}` });
};
