import type { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getFastGPTConfigFromDB } from '@fastgpt/service/common/system/config/controller';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { jsonRes } from '@fastgpt/service/common/response';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const { userId } = await parseHeaderCert({ req, authToken: true });
  const user = await MongoUser.findById(userId);
  if (user?.username !== 'root') {
    return jsonRes(res, {
      code: 403,
      error: 'No permission'
    });
  }
  return (await getFastGPTConfigFromDB()).config;
}

export default NextAPI(handler);
