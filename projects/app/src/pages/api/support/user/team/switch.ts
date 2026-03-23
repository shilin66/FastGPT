import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { switchTeam } from '@fastgpt/service/support/user/team/controller';
import { parseHeaderCert, setCookie } from '@fastgpt/service/support/permission/controller';
import type { NextApiRequest } from 'next';
import requestIp from 'request-ip';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const { teamId: newTeamId } = req.body as { teamId: string };
  const { userId } = await parseHeaderCert({ req, authToken: true });
  if (!userId) {
    throw new Error('user not found');
  }
  const token = await switchTeam(newTeamId, userId, requestIp.getClientIp(req));
  await updatedReloadSystemModel();
  setCookie(res, token);
}

export default NextAPI(handler);
