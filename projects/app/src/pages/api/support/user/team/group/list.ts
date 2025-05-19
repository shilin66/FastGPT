import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { listMemberGroup } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { GetGroupListBody } from '@fastgpt/global/support/permission/memberGroup/api';

async function handler(req: ApiRequestProps<GetGroupListBody>, res: ApiResponseType<any>) {
  const { teamId, tmbId } = await parseHeaderCert({ req, authToken: true });
  const { withMembers, searchKey } = req.body;

  return await listMemberGroup(teamId, tmbId, searchKey, withMembers);
}

export default NextAPI(handler);
