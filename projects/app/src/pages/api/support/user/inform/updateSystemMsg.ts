import type { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemMsg } from '@fastgpt/service/support/user/inform/schema';
import type { SystemMsgModalValueType } from '@fastgpt/service/support/user/inform/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const { content } = req.body as SystemMsgModalValueType;
  return MongoSystemMsg.findOneAndUpdate(
    {},
    {
      content,
      id: getNanoid()
    },
    {
      upsert: true
    }
  );
}

export default NextAPI(handler);
