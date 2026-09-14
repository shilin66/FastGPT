import {
  AdminCreateTeamSchema,
  AdminPaginatedResponseSchema,
  AdminTeamListItemSchema,
  AdminTeamListQuerySchema,
  AdminUpdateTeamSchema
} from '@fastgpt/global/openapi/admin/manage/api';
import { runAdminAuditedAction } from '@fastgpt/service/admin/audit/controller';
import {
  createAdminTeam,
  getAdminTeamDetail,
  listAdminTeams,
  updateAdminTeam
} from '@fastgpt/service/admin/team/controller';
import { getAdminContext } from '@/service/auth';
import { AdminAPI } from '@/service/middleware/entry';

export default AdminAPI(async (req) => {
  const admin = await getAdminContext(req);
  if (req.method === 'GET') {
    const query = AdminTeamListQuerySchema.parse(req.query);
    return AdminPaginatedResponseSchema(AdminTeamListItemSchema).parse(await listAdminTeams(query));
  }
  if (req.method === 'POST') {
    const input = AdminCreateTeamSchema.parse(req.body);
    return runAdminAuditedAction(
      {
        operatorId: admin.userId,
        event: 'team.create',
        targetType: 'team',
        targetId: input.name,
        targetName: input.name,
        ip: admin.ip
      },
      () => createAdminTeam(input),
      (result) => ({ targetId: result.id, targetName: input.name })
    );
  }
  if (req.method === 'PUT') {
    const input = AdminUpdateTeamSchema.parse(req.body);
    const team = await getAdminTeamDetail(input.id);
    return runAdminAuditedAction(
      {
        operatorId: admin.userId,
        event: 'team.update',
        targetType: 'team',
        targetId: input.id,
        targetName: team.name,
        ip: admin.ip
      },
      () => updateAdminTeam(input)
    );
  }
  throw new Error('不支持的请求方法');
});
