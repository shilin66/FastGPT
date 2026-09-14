import {
  AdminPaginatedResponseSchema,
  AdminTaskListQuerySchema,
  AdminTaskSchema
} from '@fastgpt/global/openapi/admin/manage/api';
import { listAdminTasks } from '@fastgpt/service/admin/operation/controller';
import { getAdminContext } from '@/service/auth';
import { AdminAPI, allowAdminMethods } from '@/service/middleware/entry';

export default AdminAPI(allowAdminMethods('GET'), async (req) => {
  await getAdminContext(req);
  const query = AdminTaskListQuerySchema.parse(req.query);
  return AdminPaginatedResponseSchema(AdminTaskSchema).parse(await listAdminTasks(query));
});
