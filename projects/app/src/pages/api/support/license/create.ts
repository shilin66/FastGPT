import type { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { LicenseDataType } from '@fastgpt/global/common/system/types';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { jsonRes } from '@fastgpt/service/common/response';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const body = req.body as LicenseDataType;
  const { userId } = await parseHeaderCert({ req, authToken: true });
  const user = await MongoUser.findById(userId);
  if (user?.username !== 'root') {
    return jsonRes(res, {
      code: 403,
      error: 'No permission'
    });
  }
  await MongoSystemConfigs.create({
    type: SystemConfigsTypeEnum.license,
    value: body
  });
  global.licenseData = body;
  return;
}

export default NextAPI(handler);
