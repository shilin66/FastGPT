import type { NextApiRequest, NextApiResponse } from 'next';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { authRequestFromLocal } from '@fastgpt/service/support/permission/auth/common';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {

    await authRequestFromLocal({ req });

    res.json({
      feConfigs: global.feConfigs
    });
  } catch (err) {
    console.log(err);
    res.status(500).send(getErrText(err));
  }
}
