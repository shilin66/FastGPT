import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { NextApiRequest } from 'next';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import {
  type OrgListItemType,
  type OrgSchemaType
} from '@fastgpt/global/support/user/team/org/type';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { TeamDefaultPermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import {
  getChildrenByOrg,
  getRootOrgByTeamId
} from '@fastgpt/service/support/permission/org/controllers';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const { withPermission, searchKey, orgId } = req.body;
  const { userId, teamId } = await authUserPer({ req, authToken: true, per: ReadPermissionVal });
  if (!userId) {
    throw new Error('user not found');
  }
  let orgList: OrgListItemType[] = [];
  if (searchKey) {
    orgList = (await MongoOrgModel.find({
      teamId,
      name: {
        $regex: searchKey || '',
        $options: 'i'
      }
    }).lean()) as unknown as OrgListItemType[];
  } else if (!orgId) {
    const rootOrg = await getRootOrgByTeamId(teamId);
    if (!rootOrg) {
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
      return [];
    } else {
      orgList = (await getChildrenByOrg({
        org: rootOrg,
        teamId
      })) as unknown as OrgListItemType[];
    }
  } else if (orgId) {
    const org = (await MongoOrgModel.findById(orgId).lean()) as unknown as OrgSchemaType;
    if (!org) {
      return Promise.reject('orgId is not exist!');
    }
    orgList = (await getChildrenByOrg({
      org,
      teamId
    })) as unknown as OrgListItemType[];
  }

  // 统计一个每个org下子部门的个数
  orgList.forEach((org) => {
    org.total = orgList.filter((o) => o.path === org.path + `/${org.pathId}`).length;
  });

  if (withPermission) {
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
  }

  return orgList;
}

export default NextAPI(handler);
