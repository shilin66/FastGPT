import { jsonRes } from '../response';
import type { NextApiRequest, NextApiResponse } from 'next';
import { withNextCors } from './cors';
import { type ApiRequestProps } from '../../type/next';
import { getLogger, LogCategories, withContext } from '../logger';
import { ZodError } from 'zod';
import { randomUUID } from 'crypto';

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
      const requestId = randomUUID();
      res.setHeader('x-request-id', requestId);

      const requestLogger = getLogger(LogCategories.HTTP.REQUEST);
      const responseLogger = getLogger(LogCategories.HTTP.RESPONSE);
      const errorLogger = getLogger(LogCategories.HTTP.ERROR);

      const url = req.url || '';
      const method = req.method?.toUpperCase() || '';
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const contentLength = req.headers['content-length'];

      return withContext({ requestId }, async () => {
        requestLogger.info(`[${method}] ${url}`, {
          verbose: false,
          requestId,
          method,
          url,
          ip,
          userAgent,
          contentLength
        });

        let responseLogged = false;
        const logResponse = (event: 'request-finish' | 'request-close') => {
          if (responseLogged) return;
          responseLogged = true;
          const durationMs = Date.now() - start;
          const httpStatusCode = res.statusCode;

          responseLogger.info(`[${method}] ${url} - ${httpStatusCode} in ${durationMs}ms`, {
            verbose: false,
            requestId,
            method,
            httpStatusCode,
            event
          });
        };

        res.once('finish', () => logResponse('request-finish'));
        res.once('close', () => logResponse('request-close'));

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

          const contentType = res.getHeader('Content-Type');
          if ((!contentType || contentType === 'application/json') && !res.writableFinished) {
            return jsonRes(res, {
              code: 200,
              data: response
            });
          }
        } catch (error) {
          // Handle Zod validation errors
          if (error instanceof ZodError) {
            return jsonRes(res, {
              code: 400,
              message: 'Data validation error',
              error,
              url: req.url
            });
          }

          return jsonRes(res, {
            code: 500,
            error,
            url: req.url
          });
        }
      });
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
