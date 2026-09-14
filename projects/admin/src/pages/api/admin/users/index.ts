import {
  AdminCreateUserSchema,
  AdminPaginatedResponseSchema,
  AdminUpdateUserSchema,
  AdminUserListItemSchema,
  AdminUserListQuerySchema
} from '@fastgpt/global/openapi/admin/manage/api';
import {
  createAdminUser,
  getAdminUserDetail,
  listAdminUsers,
  updateAdminUser
} from '@fastgpt/service/admin/user/controller';
import { runAdminAuditedAction } from '@fastgpt/service/admin/audit/controller';
import { AdminAPI } from '@/service/middleware/entry';
import { getAdminContext } from '@/service/auth';

export default AdminAPI(async (req) => {
  const admin = await getAdminContext(req);
  if (req.method === 'GET') {
    const query = AdminUserListQuerySchema.parse(req.query);
    return AdminPaginatedResponseSchema(AdminUserListItemSchema).parse(await listAdminUsers(query));
  }
  if (req.method === 'POST') {
    const input = AdminCreateUserSchema.parse(req.body);
    return runAdminAuditedAction(
      {
        operatorId: admin.userId,
        event: 'user.create',
        targetType: 'user',
        targetId: input.username,
        targetName: input.username,
        ip: admin.ip
      },
      () => createAdminUser(input),
      (result) => ({ targetId: result.id, targetName: input.username })
    );
  }
  if (req.method === 'PUT') {
    const input = AdminUpdateUserSchema.parse(req.body);
    const user = await getAdminUserDetail(input.id);
    return runAdminAuditedAction(
      {
        operatorId: admin.userId,
        event: 'user.update',
        targetType: 'user',
        targetId: input.id,
        targetName: user.username,
        ip: admin.ip
      },
      () => updateAdminUser(input)
    );
  }
  throw new Error('不支持的请求方法');
});
