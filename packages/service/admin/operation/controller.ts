import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { AdminTaskListQuery } from '@fastgpt/global/openapi/admin/manage/api';
import { MongoAdminOperationTask } from './schema';

type CreateAdminTaskProps = {
  type: string;
  targetType: string;
  targetId: string;
  targetName: string;
  operatorId: string;
  ip?: string;
  payload?: Record<string, string>;
};

export const assertNoActiveAdminTask = async (targetType: string, targetId: string) => {
  const active = await MongoAdminOperationTask.exists({
    targetType,
    targetId,
    status: { $in: ['queued', 'running'] }
  });
  if (active) throw new Error('该对象已有正在执行的管理任务');
};

export const createAdminTask = async (props: CreateAdminTaskProps) => {
  await assertNoActiveAdminTask(props.targetType, props.targetId);

  return MongoAdminOperationTask.create({
    ...props,
    status: 'queued',
    progress: 0,
    idempotencyKey: `${props.type}:${props.targetId}:${getNanoid(16)}`,
    activeKey: `${props.targetType}:${props.targetId}`,
    createTime: new Date(),
    updateTime: new Date()
  });
};

export const updateAdminTask = async (
  taskId: string,
  update: {
    status?: 'queued' | 'running' | 'succeeded' | 'failed';
    progress?: number;
    currentStep?: string;
    error?: string;
  }
) => {
  const terminal = update.status === 'succeeded' || update.status === 'failed';
  return MongoAdminOperationTask.updateOne(
    { _id: taskId },
    {
      $set: { ...update, updateTime: new Date() },
      ...(terminal ? { $unset: { activeKey: 1 } } : {})
    }
  );
};

export const listAdminTasks = async ({
  pageNum,
  pageSize,
  searchKey,
  status,
  type
}: AdminTaskListQuery) => {
  const filter = {
    ...(searchKey
      ? {
          $or: [
            { type: { $regex: searchKey, $options: 'i' } },
            { targetName: { $regex: searchKey, $options: 'i' } }
          ]
        }
      : {}),
    ...(status ? { status } : {}),
    ...(type ? { type } : {})
  };
  const [total, docs] = await Promise.all([
    MongoAdminOperationTask.countDocuments(filter),
    MongoAdminOperationTask.find(filter)
      .sort({ createTime: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .lean()
  ]);
  return {
    total,
    list: docs.map((doc) => ({
      id: String(doc._id),
      type: doc.type,
      targetType: doc.targetType,
      targetId: doc.targetId,
      targetName: doc.targetName,
      status: doc.status,
      progress: doc.progress,
      currentStep: doc.currentStep,
      error: doc.error,
      createdAt: doc.createTime,
      updatedAt: doc.updateTime
    }))
  };
};

export const getAdminTask = async (taskId: string) => {
  const task = await MongoAdminOperationTask.findById(taskId).lean();
  if (!task) throw new Error('任务不存在');
  return task;
};

export const resetFailedAdminTask = async (taskId: string) => {
  const task = await MongoAdminOperationTask.findOne({ _id: taskId, status: 'failed' });
  if (!task) throw new Error('仅失败任务可以重试');
  await assertNoActiveAdminTask(task.targetType, task.targetId);
  task.status = 'queued';
  task.progress = 0;
  task.currentStep = '等待重新执行';
  task.error = undefined;
  task.activeKey = `${task.targetType}:${task.targetId}`;
  task.updateTime = new Date();
  await task.save();
  return task;
};
