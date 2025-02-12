import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { putUpdateOrgData } from '@fastgpt/global/support/user/team/org/api';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: ApiRequestProps<putUpdateOrgData>, res: ApiResponseType<any>) {
  const { name, avatar, orgId, description } = req.body;

  await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  const org = await MongoOrgModel.findByIdAndUpdate(orgId, {
    $set: {
      name,
      avatar,
      description
    }
  });

  if (!org) {
    return Promise.reject(TeamErrEnum.orgNotExist);
  }

  return {};
}

export default NextAPI(handler);
