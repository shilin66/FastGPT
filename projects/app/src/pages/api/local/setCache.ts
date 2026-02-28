import type { NextApiResponse } from 'next';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { authRequestFromLocal } from '@fastgpt/service/support/permission/auth/common';
import type {ApiRequestProps} from "@fastgpt/service/type/next";
import {localCacheManager} from "@fastgpt/service/support/globalCache/cache";

type Props = {
  cacheKey: string;
  cacheValue: any;
  ttl: number;
};


export default async function handler(req: ApiRequestProps<Props>, res: NextApiResponse<any>) {
  try {
    const {cacheKey, cacheValue, ttl} = req.body as Props;
    await authRequestFromLocal({ req });
    localCacheManager.set(cacheKey, cacheValue, ttl);
    res.json({
      value: cacheValue
    });
  } catch (err) {
    console.log(err);
    res.status(500).send(getErrText(err));
  }
}
