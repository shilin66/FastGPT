import { AdminTokenName, authAdminSession } from '@fastgpt/service/admin/auth';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { serialize } from 'cookie';
import type { NextApiResponse } from 'next';

export const setAdminCookie = (res: NextApiResponse, token: string) => {
  res.setHeader(
    'Set-Cookie',
    serialize(AdminTokenName, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 7 * 24 * 60 * 60
    })
  );
};

export const clearAdminCookie = (res: NextApiResponse) => {
  res.setHeader(
    'Set-Cookie',
    serialize(AdminTokenName, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 })
  );
};

export const getAdminContext = async (req: ApiRequestProps) => {
  const session = await authAdminSession(req);
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded ?? req.socket.remoteAddress;
  return { ...session, ip };
};
