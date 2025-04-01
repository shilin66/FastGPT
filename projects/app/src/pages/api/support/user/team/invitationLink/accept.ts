import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoInvitationLink } from '@fastgpt/service/support/user/team/invitationLink/schema';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

async function handler(req: ApiRequestProps<{ linkId: string }>, res: ApiResponseType<any>) {
  const { linkId } = req.body;

  const { userId } = await parseHeaderCert({ req, authToken: true });

  // get link
  const linkInfo = await MongoInvitationLink.findById(linkId).lean();
  if (!linkInfo) {
    return Promise.reject(TeamErrEnum.invitationLinkInvalid);
  }

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
      _id: linkId
    },
    {
      $set: {
        members: [...linkInfo.members, tmbId]
      }
    }
  );
}

export default NextAPI(handler);
