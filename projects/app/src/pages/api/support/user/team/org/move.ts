import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { putMoveOrgType } from '@fastgpt/global/support/user/team/org/api';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  getOrgAndChildren,
  getRootOrgByTeamId
} from '@fastgpt/service/support/permission/org/controllers';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { TeamManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';

async function handler(req: ApiRequestProps<putMoveOrgType>, res: ApiResponseType<any>) {
  const { orgId, targetOrgId } = req.body;

  const { teamId } = await authUserPer({ req, authToken: true, per: TeamManagePermissionVal });
  await mongoSessionRun(async (session) => {
    const { org, children } = await getOrgAndChildren({ orgId, teamId, session });
    const targetOrg =
      targetOrgId === ''
        ? await getRootOrgByTeamId(teamId)
        : await MongoOrgModel.findById(targetOrgId, undefined, { session }).lean();

    if (!org || !targetOrg) {
      return Promise.reject(TeamErrEnum.orgNotExist);
    }

    // 更新org的path
    const newOrgPath = `${targetOrg.path}/${targetOrg.pathId}`;
    await MongoOrgModel.updateOne({ _id: orgId }, { path: newOrgPath }, { session });

    // 更新所有子org的path
    for (const childOrg of children) {
      const newPath = `${newOrgPath}${childOrg.path.slice(org.path.length)}`;
      await MongoOrgModel.updateOne({ _id: childOrg._id }, { path: newPath }, { session });
    }
  });

  return {};
}

export default NextAPI(handler);
