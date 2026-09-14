import type { AdminAuditListQuery } from '@fastgpt/global/openapi/admin/manage/api';
import { MongoAdminAuditLog } from './schema';

export type AddAdminAuditLogProps = {
  operatorId: string;
  event: string;
  targetType: string;
  targetId: string;
  targetName: string;
  success: boolean;
  error?: string;
  ip?: string;
  taskId?: string;
  changes?: Record<string, string>;
};

export const addAdminAuditLog = async (props: AddAdminAuditLogProps) => {
  return MongoAdminAuditLog.create(props);
};

export const runAdminAuditedAction = async <T>(
  props: Omit<AddAdminAuditLogProps, 'success' | 'error'>,
  action: () => Promise<T>,
  resolveSuccessTarget?: (result: T) => Pick<AddAdminAuditLogProps, 'targetId' | 'targetName'>
) => {
  try {
    const result = await action();
    await addAdminAuditLog({
      ...props,
      ...(resolveSuccessTarget ? resolveSuccessTarget(result) : {}),
      success: true
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : '操作失败';
    await addAdminAuditLog({ ...props, success: false, error: message });
    throw error;
  }
};

export const listAdminAuditLogs = async ({
  pageNum,
  pageSize,
  searchKey,
  event,
  targetType,
  success,
  startTime,
  endTime
}: AdminAuditListQuery) => {
  const filter = {
    ...(searchKey
      ? {
          $or: [
            { event: { $regex: searchKey, $options: 'i' } },
            { targetName: { $regex: searchKey, $options: 'i' } }
          ]
        }
      : {}),
    ...(event ? { event } : {}),
    ...(targetType ? { targetType } : {}),
    ...(success !== undefined ? { success } : {}),
    ...(startTime || endTime
      ? {
          createTime: {
            ...(startTime ? { $gte: startTime } : {}),
            ...(endTime ? { $lte: endTime } : {})
          }
        }
      : {})
  };
  const [total, docs] = await Promise.all([
    MongoAdminAuditLog.countDocuments(filter),
    MongoAdminAuditLog.find(filter)
      .sort({ createTime: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .lean()
  ]);

  return {
    total,
    list: docs.map((doc) => ({
      id: String(doc._id),
      event: doc.event,
      targetType: doc.targetType,
      targetId: doc.targetId,
      targetName: doc.targetName,
      success: doc.success,
      error: doc.error,
      ip: doc.ip,
      taskId: doc.taskId,
      createdAt: doc.createTime
    }))
  };
};
