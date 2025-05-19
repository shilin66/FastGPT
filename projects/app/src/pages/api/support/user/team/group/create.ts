import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { postCreateGroupData } from '@fastgpt/global/support/user/team/group/api';
import { createMemberGroup } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';

export type createBody = {};

async function handler(req: ApiRequestProps<createBody>, res: ApiResponseType<any>) {
  const body = req.body as postCreateGroupData;

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    per: TeamManagePermissionVal
  });

  if (!body.memberIdList) {
    body.memberIdList = [tmbId];
  }

  await createMemberGroup({
    ...body,
    teamId
  });
}

export default NextAPI(handler);
