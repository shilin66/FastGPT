import { AdminTeamDetailSchema } from '@fastgpt/global/openapi/admin/manage/api';
import { getAdminTeamDetail } from '@fastgpt/service/admin/team/controller';
import { getAdminContext } from '@/service/auth';
import { AdminAPI, allowAdminMethods } from '@/service/middleware/entry';
import { z } from 'zod';

export default AdminAPI(allowAdminMethods('GET'), async (req) => {
  await getAdminContext(req);
  const { id } = z.object({ id: z.string() }).parse(req.query);
  return AdminTeamDetailSchema.parse(await getAdminTeamDetail(id));
});
