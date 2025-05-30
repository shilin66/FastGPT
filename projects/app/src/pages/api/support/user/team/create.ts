import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { CreateTeamProps } from '@fastgpt/global/support/user/team/controller';
import { createTeam } from '@fastgpt/service/support/user/team/controller';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

export type createBody = {};

async function handler(req: ApiRequestProps<createBody>, res: ApiResponseType<any>) {
  const body = req.body as CreateTeamProps;

  const { userId } = await parseHeaderCert({ req, authToken: true });

  await mongoSessionRun(async (session) => {
    await createTeam({ ...body }, userId, session);
  });
}

export default NextAPI(handler);
