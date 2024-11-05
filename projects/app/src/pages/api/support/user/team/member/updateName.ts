import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { updateMemberName } from '@fastgpt/service/support/user/team/controller';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';

async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  const { name } = req.body as { name: string };

  const { tmbId } = await parseHeaderCert({ req, authToken: true });
  // await updateMemberName(tmbId, name);
}

export default NextAPI(handler);
