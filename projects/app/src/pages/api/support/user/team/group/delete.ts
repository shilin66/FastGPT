import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { deleteMemberGroup } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';

export type createBody = {};

async function handler(req: ApiRequestProps<createBody>, res: ApiResponseType<any>) {
  const groupId = req.query.groupId as string;

  await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  await deleteMemberGroup(groupId);
}

export default NextAPI(handler);
