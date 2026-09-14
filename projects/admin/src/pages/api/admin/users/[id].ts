import { AdminUserDetailSchema } from '@fastgpt/global/openapi/admin/manage/api';
import { getAdminUserDetail } from '@fastgpt/service/admin/user/controller';
import { AdminAPI, allowAdminMethods } from '@/service/middleware/entry';
import { getAdminContext } from '@/service/auth';
import { z } from 'zod';

export default AdminAPI(allowAdminMethods('GET'), async (req) => {
  await getAdminContext(req);
  const { id } = z.object({ id: z.string() }).parse(req.query);
  return AdminUserDetailSchema.parse(await getAdminUserDetail(id));
});
