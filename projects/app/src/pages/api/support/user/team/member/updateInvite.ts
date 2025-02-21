import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { UpdateInviteProps } from '@fastgpt/global/support/user/team/controller';
import { updateInviteResult } from '@fastgpt/service/support/user/team/controller';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';

async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  const body = req.body as UpdateInviteProps;

  await parseHeaderCert({ req, authToken: true });

  if (body.status !== TeamMemberStatusEnum.active && body.status !== TeamMemberStatusEnum.reject) {
    return Promise.reject('status error');
  }

  await updateInviteResult(body);
}

export default NextAPI(handler);
