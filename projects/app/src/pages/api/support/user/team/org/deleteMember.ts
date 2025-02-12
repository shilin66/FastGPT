import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoOrgMemberModel } from '@fastgpt/service/support/permission/org/orgMemberSchema';
import type { NextApiRequest } from 'next';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const { orgId, tmbId } = req.query;

  const { teamId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  await MongoOrgMemberModel.deleteMany({
    teamId,
    orgId,
    tmbId
  });
  return {};
}

export default NextAPI(handler);
