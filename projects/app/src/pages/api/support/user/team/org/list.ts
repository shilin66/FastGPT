import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { NextApiRequest } from 'next';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { OrgType } from '@fastgpt/global/support/user/team/org/type';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { TeamDefaultPermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const { userId, teamId } = await authUserPer({ req, authToken: true, per: ReadPermissionVal });
  if (!userId) {
    throw new Error('user not found');
  }

  const orgList = (await MongoOrgModel.find({ teamId })
    .populate('members')
    .lean()) as unknown as OrgType[];

  if (!orgList || orgList.length === 0) {
    const team = await MongoTeam.findById(teamId).lean();
    if (!team) {
      return Promise.reject('teamId is not exist!');
    }
    // create
    const org = await MongoOrgModel.create({
      name: team.name,
      avatar: '',
      teamId,
      path: ''
    });
    orgList.push({
      ...org.toObject(),
      members: [],
      avatar: '',
      permission: new TeamPermission({
        per: TeamDefaultPermissionVal
      })
    });
  }

  const orgIds = orgList.map((org) => org._id);
  const orgPerList = await MongoResourcePermission.find({
    teamId,
    orgId: {
      $in: orgIds
    }
  }).lean();

  orgList.forEach((org) => {
    const permission = orgPerList.find((per) => per.orgId === org._id);

    org.permission = new TeamPermission({
      per: permission?.permission || TeamDefaultPermissionVal
    });
  });

  return orgList;
}

export default NextAPI(handler);
