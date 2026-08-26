import './env'; // dotenv 最先加载
import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { z } from 'zod';
import { config } from './config';
import { ProcessPool } from './pool/process-pool';
import { PythonProcessPool } from './pool/python-process-pool';
import type { ExecuteOptions } from './types';
import { getErrText } from './utils';
import { configureLogger, getLogger, LogCategories } from './utils/logger';
import { randomUUID } from 'node:crypto';

await configureLogger();

const serverLogger = getLogger(LogCategories.MODULE.SANDBOX.SERVER);
const apiLogger = getLogger(LogCategories.MODULE.SANDBOX.API);

/** 请求体校验 schema */
const executeSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(5 * 1024 * 1024), // 最大 5MB 代码
  variables: z.record(z.string(), z.any()).default({})
});

type AppEnv = {
  Variables: {
    requestId: string;
  };
};

const app = new Hono<AppEnv>();

/** 进程池 */
const jsPool = new ProcessPool(config.poolSize);
const pythonPool = new PythonProcessPool(config.poolSize);

const poolReady = Promise.all([jsPool.init(), pythonPool.init()])
  .then(() => {
    serverLogger.info(
      `Process pools ready: JS=${config.poolSize}, Python=${config.poolSize} workers`
    );
  })
  .catch((err) => {
    serverLogger.error('Failed to init process pool:', err.message);
    process.exit(1);
  });

/** 健康检查（不需要认证） */
app.get('/health', (c) => {
  const jsStats = jsPool.stats;
  const pyStats = pythonPool.stats;
  const isReady = jsStats.total > 0 && pyStats.total > 0;
  return c.json(
    {
      status: isReady ? 'ok' : 'degraded',
      pools: {
        js: jsStats,
        python: pyStats
      }
    },
    isReady ? 200 : 503
  );
});

app.use('/sandbox/*', async (c, next) => {
  const requestId = c.req.header('x-fastgpt-request-id') ?? randomUUID();
  const startTime = Date.now();
  const language = c.req.path.endsWith('/python')
    ? 'python3'
    : c.req.path.endsWith('/js')
      ? 'js'
      : 'system';
  const poolStats =
    language === 'python3' ? pythonPool.stats : language === 'js' ? jsPool.stats : undefined;

  c.set('requestId', requestId);
  c.header('x-fastgpt-request-id', requestId);
  apiLogger.info('sandbox.request.start', {
    requestId,
    method: c.req.method,
    path: c.req.path,
    language,
    contentLength: Number(c.req.header('content-length') ?? 0),
    ...poolStats
  });

  await next();

  const duration = Date.now() - startTime;
  const { status } = c.res;

  let businessSuccess = true;

  try {
    const clonedRes = c.res.clone();
    const contentType = clonedRes.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      const body = await clonedRes.json();
      businessSuccess = body.success !== false;
    }
  } catch {}

  const isHttpSuccess = status >= 200 && status < 300;
  const isFullSuccess = isHttpSuccess && businessSuccess;

  const responseContext = {
    requestId,
    method: c.req.method,
    path: c.req.path,
    language,
    status,
    businessSuccess,
    durationMs: duration
  };

  if (isFullSuccess) {
    apiLogger.info('sandbox.request.complete', responseContext);
  } else if (status >= 500) {
    apiLogger.error('sandbox.request.complete', responseContext);
  } else {
    apiLogger.warn('sandbox.request.complete', responseContext);
  }
});
/** 认证中间件：仅当配置了 token 时启用 */
if (config.token) {
  app.use('/sandbox/*', bearerAuth({ token: config.token }));
} else {
  apiLogger.warn(
    '⚠️  WARNING: SANDBOX_TOKEN is not set. API endpoints are unauthenticated. Set SANDBOX_TOKEN in production!'
  );
}

/** JS 执行 */
app.post('/sandbox/js', async (c) => {
  try {
    const raw = await c.req.json();
    const parsed = executeSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          message: `Invalid request: ${parsed.error.issues[0]?.message || 'validation failed'}`
        },
        400
      );
    }
    const result = await jsPool.execute({
      ...(parsed.data as ExecuteOptions),
      requestId: c.get('requestId')
    });
    return c.json(result);
  } catch (err: any) {
    return c.json({
      success: false,
      message: getErrText(err)
    });
  }
});

/** Python 执行 */
app.post('/sandbox/python', async (c) => {
  try {
    const raw = await c.req.json();
    const parsed = executeSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          message: `Invalid request: ${parsed.error.issues[0]?.message || 'validation failed'}`
        },
        400
      );
    }
    const result = await pythonPool.execute({
      ...(parsed.data as ExecuteOptions),
      requestId: c.get('requestId')
    });
    return c.json(result);
  } catch (err: any) {
    return c.json({
      success: false,
      message: getErrText(err)
    });
  }
});

/** 查询可用模块 */
app.get('/sandbox/modules', (c) => {
  return c.json({
    success: true,
    data: {
      js: config.jsAllowedModules,
      python: config.pythonAllowedModules,
      builtinGlobals: ['SystemHelper.httpRequest']
    }
  });
});

/** 启动服务 */
serverLogger.info(`Sandbox server starting on port ${config.port}...`);

/** 导出 app 和 poolReady 供测试使用 */
export { app, poolReady };
export default {
  port: config.port,
  fetch: app.fetch
};
