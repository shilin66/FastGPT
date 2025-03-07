import type { NextApiRequest, NextApiResponse } from 'next';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { authRequestFromLocal } from '@fastgpt/service/support/permission/auth/common';
import {localCacheManager} from "@fastgpt/service/support/globalCache/cache";


export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const cacheKey = req.query.cacheKey as string;

    await authRequestFromLocal({ req });
    const cacheToken = localCacheManager.get(cacheKey);
    res.json({
      value: cacheToken
    });
  } catch (err) {
    console.log(err);
    res.status(500).send(getErrText(err));
  }
}
