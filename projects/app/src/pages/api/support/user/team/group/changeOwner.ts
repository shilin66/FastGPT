import type { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  authGroupMemberRole,
  changeGroupOwner
} from '@fastgpt/service/support/permission/memberGroup/controllers';
import { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const { groupId, tmbId } = req.body as { groupId: string; tmbId: string };

  await authGroupMemberRole({
    groupId,
    role: [GroupMemberRole.owner],
    req,
    authToken: true
  });

  return changeGroupOwner(groupId, tmbId);
}

export default NextAPI(handler);
