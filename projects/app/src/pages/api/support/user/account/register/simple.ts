import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import { setCookie } from '@fastgpt/service/support/permission/controller';
import requestIp from 'request-ip';
import { createUserSession } from '@fastgpt/service/support/user/session';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    // await connectToDatabase();
    const { username, password } = req.body as { username: string; password: string };
    if (!username || !password) {
      throw new Error('params error');
    }

    // 用户存在
    if (
      await MongoUser.findOne({
        username
      })
    ) {
      throw new Error('user.Account Exist');
    }
    const userDefaultTeam = feConfigs.userDefaultTeam;
    // 使用MongoTeam findOne根据teamName查询teamId
    const defaultTeam = await MongoTeam.findOne({ name: userDefaultTeam });
    if (!defaultTeam) {
      throw new Error('默认团队不存在');
    }

    // 创建用户
    const [{ _id: userId }] = await MongoUser.create([
      {
        username,
        password,
        loginType: 'password'
      }
    ]);

    const [{ _id: tmbId }] = await MongoTeamMember.create([
      {
        teamId: defaultTeam._id,
        userId,
        name: username,
        // role: TeamMemberRoleEnum.visitor,
        status: TeamMemberStatusEnum.active,
        createTime: new Date(),
        defaultTeam: true
      }
    ]);

    // MongoResourcePermission 添加团队默认权限只读
    // await MongoResourcePermission.create([
    //   {
    //     resourceType: PerResourceTypeEnum.team,
    //     tmbId: tmbId,
    //     teamId: defaultTeam._id,
    //     permission: PermissionList['read'].value
    //   }
    // ]);

    const userDetail = await getUserDetail({
      tmbId: defaultTeam._id,
      userId
    });
    const token = await createUserSession({
      userId: userId,
      teamId: userDetail.team.teamId,
      tmbId: userDetail.team.tmbId,
      isRoot: username === 'root',
      ip: requestIp.getClientIp(req)
    });

    setCookie(res, token);

    jsonRes(res, {
      data: {
        user: userDetail,
        token
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
