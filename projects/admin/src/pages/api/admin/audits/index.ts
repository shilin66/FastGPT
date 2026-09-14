import {
  AdminAuditListQuerySchema,
  AdminAuditSchema,
  AdminPaginatedResponseSchema
} from '@fastgpt/global/openapi/admin/manage/api';
import { listAdminAuditLogs } from '@fastgpt/service/admin/audit/controller';
import { getAdminContext } from '@/service/auth';
import { AdminAPI, allowAdminMethods } from '@/service/middleware/entry';

export default AdminAPI(allowAdminMethods('GET'), async (req) => {
  await getAdminContext(req);
  const query = AdminAuditListQuerySchema.parse(req.query);
  return AdminPaginatedResponseSchema(AdminAuditSchema).parse(await listAdminAuditLogs(query));
});
