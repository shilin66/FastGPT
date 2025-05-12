import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoInvitationLink } from '@fastgpt/service/support/user/team/invitationLink/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { TeamManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';

async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  const { teamId } = await authUserPer({ req, authToken: true, per: TeamManagePermissionVal });

  // list all
  const linkList = await MongoInvitationLink.find({ teamId }).lean();
  // get all link memberId
  const tmbIds = linkList.flatMap((item) => item.members);
  const tmbList = await MongoTeamMember.find({ _id: { $in: tmbIds } }).lean();
  // 转成。key value 对象
  const tmbMap = tmbList.reduce(
    (acc, cur) => {
      acc[cur._id] = cur;
      return acc;
    },
    {} as Record<string, any>
  );

  return linkList.map((item) => ({
    ...item,
    members: item.members
      .map((memberId) => {
        const tmb = tmbMap[memberId];
        if (!tmb) return null;
        return {
          tmbId: tmb?._id || '',
          avatar: tmb?.avatar || '',
          name: tmb?.name || ''
        };
      })
      .filter(Boolean)
  }));
}

export default NextAPI(handler);
