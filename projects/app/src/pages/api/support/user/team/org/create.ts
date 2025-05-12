import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { postCreateOrgData } from '@fastgpt/global/support/user/team/org/api';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';

async function handler(req: ApiRequestProps<postCreateOrgData>, res: ApiResponseType<any>) {
  const { name, avatar, orgId, description } = req.body as postCreateOrgData;

  const { teamId } = await authUserPer({ req, authToken: true, per: TeamManagePermissionVal });

  const parentOrg = orgId
    ? await MongoOrgModel.findById(orgId).lean()
    : await MongoOrgModel.findOne({
        teamId,
        path: ''
      });
  if (!parentOrg) {
    return Promise.reject(TeamErrEnum.orgParentNotExist);
  }

  await MongoOrgModel.create({
    name,
    avatar,
    teamId,
    description,
    path: `${parentOrg.path}/${parentOrg.pathId}`
  });
  return {};
}

export default NextAPI(handler);
