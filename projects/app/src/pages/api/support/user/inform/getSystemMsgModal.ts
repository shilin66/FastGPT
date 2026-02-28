import type { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemMsg } from '@fastgpt/service/support/user/inform/schema';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  return MongoSystemMsg.findOne().sort({ _id: -1 }).lean();
}

export default NextAPI(handler);
