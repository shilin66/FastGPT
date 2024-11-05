import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { listMemberGroup } from '@fastgpt/service/support/permission/memberGroup/controllers';

export type createBody = {};

async function handler(req: ApiRequestProps<createBody>, res: ApiResponseType<any>) {
  const { teamId, tmbId } = await parseHeaderCert({ req, authToken: true });

  return await listMemberGroup(teamId, tmbId);
}

export default NextAPI(handler);
