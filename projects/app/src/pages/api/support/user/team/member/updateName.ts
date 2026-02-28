import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';

async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  const { name } = req.body as { name: string };

  const { tmbId } = await parseHeaderCert({ req, authToken: true });
}

export default NextAPI(handler);
