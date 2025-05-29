import { type UserType } from '@fastgpt/global/support/user/type';
import { MongoUser } from './schema';
import { getTmbInfoByTmbId, getUserDefaultTeam } from './team/controller';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { MongoTeam } from './team/teamSchema';
import { MongoTeamMember } from './team/teamMemberSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';

export async function authUserExist({ userId, username }: { userId?: string; username?: string }) {
  if (userId) {
    return MongoUser.findOne({ _id: userId });
  }
  if (username) {
    return MongoUser.findOne({ username });
  }
  return null;
}

export async function getUserDetail({
  tmbId,
  userId
}: {
  tmbId?: string;
  userId?: string;
}): Promise<UserType> {
  const tmb = await (async () => {
    if (tmbId) {
      try {
        const result = await getTmbInfoByTmbId({ tmbId });
        return result;
      } catch (error) {}
    }
    if (userId) {
      return getUserDefaultTeam({ userId });
    }
    return Promise.reject(ERROR_ENUM.unAuthorization);
  })();
  const user = await MongoUser.findById(tmb.userId);

  if (!user) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  return {
    _id: user._id,
    username: user.username,
    avatar: tmb.avatar,
    timezone: user.timezone,
    loginType: user.loginType,
    promotionRate: user.promotionRate,
    confluenceAccount: user.confluenceAccount,
    team: tmb,
    notificationAccount: tmb.notificationAccount,
    permission: tmb.permission,
    contact: user.contact
  };
}

export async function createUserWithDefaultTeamAndPermission(
  username: string,
  loginType: string
): Promise<string> {
  const userDefaultTeam = feConfigs.userDefaultTeam;
  const defaultTeam = await MongoTeam.findOne({ name: userDefaultTeam });

  if (!defaultTeam) {
    throw new Error('默认团队不存在');
  }

  const [{ _id: userId }] = await MongoUser.create([{ username, loginType }]);

  const [{ _id: tmbId }] = await MongoTeamMember.create([
    {
      teamId: defaultTeam._id,
      userId,
      name: username.replaceAll('@zenlayer.com', ''),
      status: TeamMemberStatusEnum.active,
      createTime: new Date(),
      defaultTeam: true
    }
  ]);

  // await MongoResourcePermission.create([
  //   {
  //     resourceType: PerResourceTypeEnum.team,
  //     tmbId,
  //     teamId: defaultTeam._id,
  //     permission: PermissionList['read'].value
  //   }
  // ]);
  return userId;
}
