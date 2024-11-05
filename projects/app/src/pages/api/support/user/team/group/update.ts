import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { putUpdateGroupData } from '@fastgpt/global/support/user/team/group/api';
import { updateMemberGroup } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';

export type createBody = {};

async function handler(req: ApiRequestProps<createBody>, res: ApiResponseType<any>) {
  const body = req.body as putUpdateGroupData;

  await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  await updateMemberGroup(body);
}

export default NextAPI(handler);
