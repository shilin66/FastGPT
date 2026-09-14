import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import type { ApiRequestProps } from '../type/next';
import { MongoUser } from '../support/user/schema';
import { authUserSession } from '../support/user/session';
import { parse } from 'cookie';

export const AdminTokenName = 'fastgpt_admin_token';

export type AdminSession = {
  userId: string;
  sessionId: string;
};

export const authAdminSession = async (req: ApiRequestProps): Promise<AdminSession> => {
  const cookies = parse(req.headers.cookie ?? '');
  const sessionId = cookies[AdminTokenName];
  if (!sessionId) throw new Error(ERROR_ENUM.unAuthorization);

  const session = await authUserSession(sessionId);
  if (!session.isRoot) throw new Error(ERROR_ENUM.unAuthorization);

  const user = await MongoUser.findById(session.userId, 'username status').lean();
  if (!user || user.username !== 'root' || user.status === 'forbidden') {
    throw new Error(ERROR_ENUM.unAuthorization);
  }

  return { userId: String(user._id), sessionId };
};
