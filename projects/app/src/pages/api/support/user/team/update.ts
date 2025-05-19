import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { UpdateTeamProps } from '@fastgpt/global/support/user/team/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { updateTeam } from '@fastgpt/service/support/user/team/controller';
import { TeamManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';

export type updateQuery = {};

export type updateBody = {};

export type updateResponse = {};

async function handler(req: ApiRequestProps<updateBody, updateQuery>, res: ApiResponseType<any>) {
  const body = req.body as UpdateTeamProps;

  const { teamId } = await authUserPer({ req, authToken: true, per: TeamManagePermissionVal });

  await updateTeam({ teamId, ...body });
}

export default NextAPI(handler);
