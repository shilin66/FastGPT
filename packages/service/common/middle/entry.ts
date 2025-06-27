import { jsonRes } from '../response';
import type { NextApiRequest, NextApiResponse } from 'next';
import { withNextCors } from './cors';
import { type ApiRequestProps } from '../../type/next';
import { addLog } from '../system/log';
import { verifyDbLicense } from '../license/verify';
export type NextApiHandler<T = any> = (
  req: ApiRequestProps,
  res: NextApiResponse<T>
) => unknown | Promise<unknown>;

export const NextEntry = ({
  beforeCallback = []
}: {
  beforeCallback?: ((req: NextApiRequest, res: NextApiResponse) => Promise<any>)[];
}) => {
  return (...args: NextApiHandler[]): NextApiHandler => {
    return async function api(req: ApiRequestProps, res: NextApiResponse) {
      const start = Date.now();
      addLog.debug(`Request start ${req.url}`);

      try {
        await Promise.all([
          apiVerifyLicense(req),
          withNextCors(req, res),
          ...beforeCallback.map((item) => item(req, res))
        ]);

        let response = null;
        for await (const handler of args) {
          response = await handler(req, res);
          if (res.writableFinished) {
            break;
          }
        }

        // Get request duration
        const duration = Date.now() - start;
        if (duration < 2000) {
          addLog.debug(`Request finish ${req.url}, time: ${duration}ms`);
        } else {
          addLog.warn(`Request finish ${req.url}, time: ${duration}ms`);
        }

        const contentType = res.getHeader('Content-Type');
        if ((!contentType || contentType === 'application/json') && !res.writableFinished) {
          return jsonRes(res, {
            code: 200,
            data: response
          });
        }
      } catch (error) {
        return jsonRes(res, {
          code: 500,
          error,
          url: req.url
        });
      }
    };
  };
};

const apiVerifyLicense = async (req: NextApiRequest) => {
  console.log('apiVerifyLicense');
  const api_white_list = [
    '/api/support/user/account/login/oauth',
    '/api/support/user/account/loginByPassword',
    '/api/support/user/account/preLogin*',
    '/api/support/user/account/loginout',
    '/api/support/user/account/tokenLogin',
    '/api/support/system/*',
    '/api/support/license/*'
  ];
  // 从 req中获取url
  const urlstr = req.url ?? '';
  const url = new URL(urlstr, 'http://localhost');
  const path = url.pathname;

  const isWhitelisted = api_white_list.some((pattern) => {
    if (pattern.includes('*')) {
      const regex = new RegExp(`^${pattern.replace('*', '.*')}$`);
      return regex.test(path);
    }
    return path === pattern;
  });
  if (!isWhitelisted) {
    await verifyDbLicense();
  }
};
