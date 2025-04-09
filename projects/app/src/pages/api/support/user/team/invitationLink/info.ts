import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoInvitationLink } from '@fastgpt/service/support/user/team/invitationLink/schema';
import { TeamSchema } from '@fastgpt/global/support/user/team/type';

async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  const { linkId } = req.query as { linkId: string };

  await authUserPer({ req, authToken: true });

  const linkWithTeam = await MongoInvitationLink.findOne({ linkId })
    .populate<{ team: TeamSchema }>({
      path: 'team',
      select: 'name avatar'
    })
    .lean();

  return {
    ...linkWithTeam,
    teamAvatar: linkWithTeam?.team?.avatar,
    teamName: linkWithTeam?.team?.name
  };
}

export default NextAPI(handler);
