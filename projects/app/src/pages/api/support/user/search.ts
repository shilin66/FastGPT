import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { NextApiRequest } from 'next';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const searchKey = req.query.searchKey as string;
  const members = req.query.members === 'true';
  const orgs = req.query.orgs === 'true';
  const groups = req.query.groups === 'true';
  const { teamId } = await authUserPer({ req, authToken: true, per: ReadPermissionVal });

  if (members) {
    return { members: await searchMember(searchKey, teamId) };
  }

  if (orgs) {
    return { orgs: await searchOrg(searchKey, teamId) };
  }

  if (groups) {
    return { groups: await searchGroup(searchKey, teamId) };
  }

  if (!members && !orgs && !groups) {
    return {
      members: await searchMember(searchKey, teamId),
      orgs: await searchOrg(searchKey, teamId),
      groups: await searchGroup(searchKey, teamId)
    };
  }
}

const searchMember = async (searchKey: string, teamId: string) => {
  const members = await MongoTeamMember.find({
    teamId,
    name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') }
  }).lean();

  return members.map((item) => ({
    userId: item.userId,
    tmbId: item._id,
    memberName: item.name,
    avatar: item.avatar,
    role: item.role,
    status: item.status,
    createTime: item.createTime,
    updateTime: item.updateTime
  }));
};

const searchOrg = async (searchKey: string, teamId: string) => {
  const orgs = await MongoOrgModel.find({
    teamId,
    name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') }
  }).lean();

  return orgs.map((item) => ({
    _id: item._id,
    teamId,
    path: item.path,
    pathId: item.pathId,
    name: item.name,
    avatar: item.avatar,
    description: item.description,
    updateTime: item.updateTime
  }));
};

const searchGroup = async (searchKey: string, teamId: string) => {
  const groups = await MongoMemberGroupModel.find({
    teamId,
    name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') }
  }).lean();
  return groups.map((item) => ({
    _id: item._id,
    teamId,
    name: item.name,
    avatar: item.avatar,
    updateTime: item.updateTime
  }));
};

export default NextAPI(handler);
