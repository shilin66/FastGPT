import type { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemMsg } from '@fastgpt/service/support/user/inform/schema';
import { UpdateSystemModalBodySchema } from '@fastgpt/global/openapi/admin/support/user/inform/api';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { getNanoid } from '@fastgpt/global/common/string/tools';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  await authSystemAdmin({ req });
  const { content, licenseExpiryReminder } = UpdateSystemModalBodySchema.parse(req.body);
  const current = await MongoSystemMsg.findOne().sort({ _id: -1 }).lean();
  return MongoSystemMsg.findOneAndUpdate(
    current ? { _id: current._id } : {},
    {
      $set: {
        content,
        ...(current?.content === content ? {} : { id: getNanoid() }),
        ...(licenseExpiryReminder === undefined ? {} : { licenseExpiryReminder })
      }
    },
    {
      upsert: true,
      new: true
    }
  );
}

export default NextAPI(handler);
