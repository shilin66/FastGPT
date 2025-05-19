import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoInvitationLink } from '@fastgpt/service/support/user/team/invitationLink/schema';

async function handler(req: ApiRequestProps<{ linkId: string }>, res: ApiResponseType<any>) {
  const { linkId } = req.body;

  const { userId } = await parseHeaderCert({ req, authToken: true });

  // get link
  const linkInfo = await MongoInvitationLink.findOne({ linkId, forbidden: false }).lean();
  if (!linkInfo) {
    return Promise.reject(TeamErrEnum.invitationLinkInvalid);
  }
  const usedTimesLimit = linkInfo.usedTimesLimit ?? 0;
  const isLimited = usedTimesLimit > 0 ? usedTimesLimit <= linkInfo.members.length + 1 : false;
  // check if user in team
  await MongoTeamMember.findOne({
    userId,
    teamId: linkInfo.teamId
  }).then((tmb) => {
    if (tmb) {
      return Promise.reject(TeamErrEnum.youHaveBeenInTheTeam);
    }
  });

  // get Team
  const team = await MongoTeam.findById(linkInfo.teamId).lean();
  if (!team) {
    return Promise.reject('Team Not Exist!');
  }

  if (team.ownerId === userId) {
    return Promise.reject(TeamErrEnum.youHaveBeenInTheTeam);
  }

  // get user
  const user = await MongoUser.findById(userId).lean();
  if (!user) {
    return Promise.reject(UserErrEnum.notUser);
  }

  // create team member
  const { _id: tmbId } = await MongoTeamMember.create({
    teamId: linkInfo.teamId,
    userId,
    name: user.username.replaceAll('@zenlayer.com', ''),
    status: TeamMemberStatusEnum.active,
    createTime: new Date()
  });

  // update invitation link
  await MongoInvitationLink.updateOne(
    {
      linkId
    },
    {
      $set: {
        members: [...linkInfo.members, tmbId],
        forbidden: isLimited
      }
    }
  );
}

export default NextAPI(handler);
