import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { putUpdateGroupData } from '@fastgpt/global/support/user/team/group/api';
import {
  authGroupMemberRole,
  updateMemberGroup
} from '@fastgpt/service/support/permission/memberGroup/controllers';
import { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';

export type createBody = {};

async function handler(req: ApiRequestProps<createBody>, res: ApiResponseType<any>) {
  const body = req.body as putUpdateGroupData;

  await authGroupMemberRole({
    groupId: body.groupId,
    role: [GroupMemberRole.admin, GroupMemberRole.owner],
    req,
    authToken: true
  });

  await updateMemberGroup(body);
}

export default NextAPI(handler);
