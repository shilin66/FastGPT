import { getAdminTask } from '@fastgpt/service/admin/operation/controller';
import { getAdminContext } from '@/service/auth';
import { AdminAPI, allowAdminMethods } from '@/service/middleware/entry';
import { z } from 'zod';

export default AdminAPI(allowAdminMethods('GET'), async (req) => {
  await getAdminContext(req);
  const { id } = z.object({ id: z.string() }).parse(req.query);
  const task = await getAdminTask(id);
  return {
    id: String(task._id),
    type: task.type,
    targetType: task.targetType,
    targetId: task.targetId,
    targetName: task.targetName,
    status: task.status,
    progress: task.progress,
    currentStep: task.currentStep,
    error: task.error,
    createdAt: task.createTime,
    updatedAt: task.updateTime
  };
});
