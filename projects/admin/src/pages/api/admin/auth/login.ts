import { AdminLoginBodySchema } from '@fastgpt/global/openapi/admin/support/user/login/api';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { createUserSession } from '@fastgpt/service/support/user/session';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { useIPFrequencyLimit as createIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { AdminAPI } from '@/service/middleware/entry';
import { setAdminCookie } from '@/service/auth';
import requestIp from 'request-ip';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { NextApiResponse } from 'next';

const loginHandler = async (req: ApiRequestProps, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }
  const input = AdminLoginBodySchema.parse(req.body);
  if (input.username !== 'root') throw new Error('仅 root 可以登录管理后台');
  const user = await MongoUser.findOne({ username: 'root', password: input.password });
  if (!user || user.status === UserStatusEnum.forbidden) throw new Error('用户名或密码错误');
  const member = await MongoTeamMember.findOne({ userId: user._id, status: { $ne: 'leave' } });
  if (!member) throw new Error('root 缺少有效团队');
  const token = await createUserSession({
    userId: String(user._id),
    teamId: String(member.teamId),
    tmbId: String(member._id),
    isRoot: true,
    ip: requestIp.getClientIp(req)
  });
  setAdminCookie(res, token);
  return { userId: String(user._id), username: user.username };
};

const lockTime = Number(process.env.PASSWORD_LOGIN_LOCK_SECONDS || 120);
export default AdminAPI(
  createIPFrequencyLimit({
    id: 'admin-login-by-password',
    seconds: lockTime,
    limit: 10,
    force: true
  }),
  loginHandler
);
