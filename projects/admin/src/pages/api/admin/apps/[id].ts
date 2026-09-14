import { getAdminAppDetail } from '@fastgpt/service/admin/resource/controller';
import { getAdminContext } from '@/service/auth';
import { AdminAPI, allowAdminMethods } from '@/service/middleware/entry';
import { z } from 'zod';
import { AdminAppDetailSchema } from '@fastgpt/global/openapi/admin/manage/api';

export default AdminAPI(allowAdminMethods('GET'), async (req) => {
  await getAdminContext(req);
  const { id } = z.object({ id: z.string() }).parse(req.query);
  return AdminAppDetailSchema.parse(await getAdminAppDetail(id));
});
