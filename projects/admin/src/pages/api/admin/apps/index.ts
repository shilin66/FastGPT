import {
  AdminAppListItemSchema,
  AdminPaginatedResponseSchema,
  AdminResourceListQuerySchema
} from '@fastgpt/global/openapi/admin/manage/api';
import { listAdminApps } from '@fastgpt/service/admin/resource/controller';
import { getAdminContext } from '@/service/auth';
import { AdminAPI, allowAdminMethods } from '@/service/middleware/entry';

export default AdminAPI(allowAdminMethods('GET'), async (req) => {
  await getAdminContext(req);
  const query = AdminResourceListQuerySchema.parse(req.query);
  return AdminPaginatedResponseSchema(AdminAppListItemSchema).parse(await listAdminApps(query));
});
