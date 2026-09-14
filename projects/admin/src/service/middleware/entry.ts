import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import type { NextApiResponse } from 'next';
import { ZodError } from 'zod';

export type AdminApiHandler = (
  req: ApiRequestProps,
  res: NextApiResponse
) => unknown | Promise<unknown>;

const logger = getLogger(LogCategories.MODULE.API);

export const AdminAPI = (...handlers: readonly AdminApiHandler[]): AdminApiHandler => {
  return async (req, res) => {
    try {
      let response: unknown = null;
      for (const handler of handlers) {
        response = await handler(req, res);
        if (res.writableFinished) return;
      }
      res.status(200).json({ code: 200, data: response });
    } catch (error) {
      const isValidationError = error instanceof ZodError;
      const isUnauthorized = error instanceof Error && error.message === ERROR_ENUM.unAuthorization;
      const status = isUnauthorized ? 401 : isValidationError ? 400 : 500;
      logger.error('Admin API error', { error, url: req.url, method: req.method });
      res.status(status).json({
        code: status,
        message: isUnauthorized
          ? '登录已失效'
          : isValidationError
            ? '请求参数错误'
            : error instanceof Error
              ? error.message
              : '服务暂时不可用'
      });
    }
  };
};

export const allowAdminMethods = (...methods: readonly string[]): AdminApiHandler => {
  return (req, res) => {
    if (req.method && methods.includes(req.method)) return;
    res.status(405).json({ code: 405, message: '不支持的请求方法', data: null });
  };
};
