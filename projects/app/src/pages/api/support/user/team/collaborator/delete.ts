import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { deleteMemberPermission } from '@fastgpt/service/support/user/team/controller';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextApiRequest } from 'next';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const tmbId = req.query.tmbId as string;

  await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  await deleteMemberPermission(tmbId);
}

export default NextAPI(handler);