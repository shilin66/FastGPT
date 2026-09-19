import { afterEach, describe, expect, it } from 'vitest';
import {
  createFeishuAxios,
  createFeishuSdkAxios,
  getFeishuProxyUrl
} from '@fastgpt/service/common/api/feishu';

const proxyEnvKeys = [
  'FEISHU_PROXY_URL',
  'FEISHU_PROXY_HOST',
  'FEISHU_PROXY_PORT',
  'AXIOS_PROXY_HOST',
  'AXIOS_PROXY_PORT'
] as const;

const originalEnv = proxyEnvKeys.reduce(
  (acc, key) => {
    acc[key] = process.env[key];
    return acc;
  },
  {} as Record<(typeof proxyEnvKeys)[number], string | undefined>
);

const clearProxyEnv = () => {
  for (const key of proxyEnvKeys) {
    delete process.env[key];
  }
};

describe('feishu api proxy', () => {
  afterEach(() => {
    clearProxyEnv();

    for (const key of proxyEnvKeys) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('应该优先使用 FEISHU_PROXY_URL', () => {
    clearProxyEnv();
    process.env.FEISHU_PROXY_URL = 'http://127.0.0.1:50375';
    process.env.FEISHU_PROXY_HOST = '127.0.0.1';
    process.env.FEISHU_PROXY_PORT = '50376';

    expect(getFeishuProxyUrl()).toBe('http://127.0.0.1:50375');
  });

  it('应该支持 FEISHU_PROXY_HOST 和 FEISHU_PROXY_PORT', () => {
    clearProxyEnv();
    process.env.FEISHU_PROXY_HOST = '127.0.0.1';
    process.env.FEISHU_PROXY_PORT = '50375';

    expect(getFeishuProxyUrl()).toBe('http://127.0.0.1:50375');
  });

  it('应该兼容 AXIOS_PROXY_HOST 和 AXIOS_PROXY_PORT', () => {
    clearProxyEnv();
    process.env.AXIOS_PROXY_HOST = '127.0.0.1';
    process.env.AXIOS_PROXY_PORT = '50375';

    expect(getFeishuProxyUrl()).toBe('http://127.0.0.1:50375');
  });

  it('配置飞书代理后应该注入 httpAgent 和 httpsAgent', () => {
    clearProxyEnv();
    process.env.FEISHU_PROXY_URL = 'http://127.0.0.1:50375';

    const instance = createFeishuAxios({ timeout: 30000 });

    expect(instance.defaults.proxy).toBe(false);
    expect(instance.defaults.timeout).toBe(30000);
    expect(instance.defaults.httpAgent).toBeDefined();
    expect(instance.defaults.httpsAgent).toBeDefined();
    expect(instance.defaults.httpAgent).not.toBe(instance.defaults.httpsAgent);
  });

  it('SDK axios 应该保持飞书 SDK 的响应数据格式', async () => {
    clearProxyEnv();
    let userAgent = '';
    const instance = createFeishuSdkAxios({
      adapter: async (config) => {
        userAgent = String(config.headers?.['User-Agent'] || '');

        return {
          data: { code: 0, data: { ok: true } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          request: {}
        };
      }
    });

    await expect(instance.get('/open-apis/test')).resolves.toEqual({
      code: 0,
      data: { ok: true }
    });
    expect(userAgent).toBe('oapi-node-sdk/1.0.0');
  });
});
