import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { deleteMemberPermission } from '@fastgpt/service/support/user/team/controller';
import { NextApiRequest } from 'next';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { DeletePermissionQuery } from '@fastgpt/global/support/permission/collaborator';
import { TeamManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const deletePer = req.query as DeletePermissionQuery;

  await authUserPer({ req, authToken: true, per: TeamManagePermissionVal });

  await deleteMemberPermission(deletePer);
}

export default NextAPI(handler);
