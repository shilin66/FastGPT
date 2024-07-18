import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { UpdateInviteProps } from '@fastgpt/global/support/user/team/controller';
import { updateInviteResult } from '@fastgpt/service/support/user/team/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  const body = req.body as UpdateInviteProps;

  await authUserPer({ req, authToken: true, per: ManagePermissionVal });
  await updateInviteResult(body);
}

export default NextAPI(handler);
