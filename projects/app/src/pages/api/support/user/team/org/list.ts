import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { NextApiRequest } from 'next';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import {
  type OrgListItemType,
  type OrgSchemaType
} from '@fastgpt/global/support/user/team/org/type';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import {
  TeamDefaultRoleVal,
  TeamReadPermissionVal
} from '@fastgpt/global/support/permission/user/constant';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { getRootOrgByTeamId } from '@fastgpt/service/support/permission/org/controllers';
import { MongoOrgMemberModel } from '@fastgpt/service/support/permission/org/orgMemberSchema';
import { Types } from '@fastgpt/service/common/mongo';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const { withPermission, searchKey, orgId } = req.body;
  const { userId, teamId } = await authUserPer({
    req,
    authToken: true,
    per: TeamReadPermissionVal
  });
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
      orgList = (await MongoOrgModel.find({
        teamId,
        path: `/${rootOrg.pathId}`
      }).lean()) as unknown as OrgListItemType[];
    }
  } else if (orgId) {
    const org = (await MongoOrgModel.findById(orgId).lean()) as unknown as OrgSchemaType;
    if (!org) {
      return Promise.reject('orgId is not exist!');
    }
    orgList = (await MongoOrgModel.find({
      teamId,
      path: `${org.path}/${org.pathId}`
    }).lean()) as unknown as OrgListItemType[];
  }
  // 统计每个 org下面的成员数
  const orgMemberCount = await MongoOrgMemberModel.aggregate([
    {
      $match: {
        teamId: new Types.ObjectId(teamId),
        orgId: {
          $in: orgList.map((org) => new Types.ObjectId(org._id))
        }
      }
    },
    {
      $group: {
        _id: '$orgId',
        count: {
          $sum: 1
        }
      }
    }
  ]);
  // 统计每个org下面的子部门数
  const orgChildCount = await MongoOrgModel.aggregate([
    {
      $match: {
        teamId: new Types.ObjectId(teamId),
        path: {
          $regex: `^${orgList.map((org) => org.path + `/${org.pathId}`).join('|')}`,
          $options: 'i'
        }
      }
    },
    {
      $group: {
        _id: '$path',
        count: {
          $sum: 1
        }
      }
    }
  ]);
  orgList.forEach((org) => {
    org.total =
      (orgChildCount.find((per) => per._id.toString() === `${org.path}/${org.pathId}`)?.count ||
        0) + (orgMemberCount.find((per) => per._id.toString() === org._id.toString())?.count || 0);
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
        role: permission?.permission || TeamDefaultRoleVal
      });
    });
  }

  return orgList;
}

export default NextAPI(handler);
