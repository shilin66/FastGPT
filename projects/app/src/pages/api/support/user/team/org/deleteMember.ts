import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoOrgMemberModel } from '@fastgpt/service/support/permission/org/orgMemberSchema';
import type { NextApiRequest } from 'next';
import { TeamManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const { orgId, tmbId } = req.query;

  const { teamId } = await authUserPer({ req, authToken: true, per: TeamManagePermissionVal });

  await MongoOrgMemberModel.deleteMany({
    teamId,
    orgId,
    tmbId
  });
  return {};
}

export default NextAPI(handler);
