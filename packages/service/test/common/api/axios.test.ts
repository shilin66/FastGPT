import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProxyAxios, getProxyForUrlWithCidr } from '@fastgpt/service/common/api/axios';

type AxiosRequestConfig = {
  timeout?: number;
  headers?: Record<string, string>;
  proxy?: false | { host: string; port: number };
  baseURL?: string;
  httpAgent?: any;
  httpsAgent?: any;
};

describe('axios.ts', () => {
  const originalEnv = {
    HTTP_PROXY: process.env.HTTP_PROXY,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    NO_PROXY: process.env.NO_PROXY,
    http_proxy: process.env.http_proxy,
    https_proxy: process.env.https_proxy,
    no_proxy: process.env.no_proxy,
    npm_config_no_proxy: process.env.npm_config_no_proxy
  };

  const restoreProxyEnv = () => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  describe('createProxyAxios', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      restoreProxyEnv();
    });

    it('应该创建一个带有 ProxyAgent 的 axios 实例', () => {
      const instance = createProxyAxios();

      expect(instance).toBeDefined();
      expect(instance.defaults).toBeDefined();
      expect(instance.defaults.proxy).toBe(false);
      expect(instance.defaults.httpAgent).toBeDefined();
      expect(instance.defaults.httpsAgent).toBeDefined();
    });

    it('应该使用相同的 agent 作为 httpAgent 和 httpsAgent', () => {
      const instance = createProxyAxios();

      expect(instance.defaults.httpAgent).toBe(instance.defaults.httpsAgent);
    });

    it('应该接受自定义配置并合并到默认配置中', () => {
      const customConfig: AxiosRequestConfig = {
        timeout: 5000,
        headers: {
          'Custom-Header': 'test-value'
        }
      };

      const instance = createProxyAxios(customConfig);

      expect(instance.defaults.timeout).toBe(5000);
      expect(instance.defaults.headers?.['Custom-Header']).toBe('test-value');
      expect(instance.defaults.proxy).toBe(false);
      expect(instance.defaults.httpAgent).toBeDefined();
      expect(instance.defaults.httpsAgent).toBeDefined();
    });

    it('应该允许自定义配置覆盖默认的 proxy 设置', () => {
      const customConfig: AxiosRequestConfig = {
        proxy: {
          host: 'localhost',
          port: 8080
        }
      };

      const instance = createProxyAxios(customConfig);

      expect(instance.defaults.proxy).toEqual({
        host: 'localhost',
        port: 8080
      });
    });

    it('应该保留 ProxyAgent 即使提供了自定义配置', () => {
      const customConfig: AxiosRequestConfig = {
        baseURL: 'https://api.example.com'
      };

      const instance = createProxyAxios(customConfig);

      expect(instance.defaults.baseURL).toBe('https://api.example.com');
      expect(instance.defaults.httpAgent).toBeDefined();
      expect(instance.defaults.httpsAgent).toBeDefined();
    });

    it('应该创建可以发起请求的 axios 实例', () => {
      const instance = createProxyAxios();

      expect(typeof instance.get).toBe('function');
      expect(typeof instance.post).toBe('function');
      expect(typeof instance.put).toBe('function');
      expect(typeof instance.delete).toBe('function');
      expect(typeof instance.request).toBe('function');
    });
  });

  describe('axios 导出实例', () => {
    it('应该导出一个默认的 axios 实例', async () => {
      const { axios } = await import('@fastgpt/service/common/api/axios');

      expect(axios).toBeDefined();
      expect(axios.defaults).toBeDefined();
      expect(axios.defaults.proxy).toBe(false);
      expect(axios.defaults.httpAgent).toBeDefined();
      expect(axios.defaults.httpsAgent).toBeDefined();
    });
  });

  describe('getProxyForUrlWithCidr', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      restoreProxyEnv();
      delete process.env.http_proxy;
      delete process.env.https_proxy;
      delete process.env.no_proxy;
      delete process.env.npm_config_no_proxy;
      process.env.HTTP_PROXY = 'http://proxy.example:8080';
      process.env.HTTPS_PROXY = 'http://proxy.example:8080';
    });

    it('应该支持 NO_PROXY 中的 IPv4 CIDR', () => {
      process.env.NO_PROXY = 'localhost,10.0.0.0/8,192.168.0.0/16';

      expect(getProxyForUrlWithCidr('http://10.5.10.49:8011')).toBe('');
      expect(getProxyForUrlWithCidr('http://192.168.1.10:8011')).toBe('');
      expect(getProxyForUrlWithCidr('http://8.8.8.8:8011')).toBe('http://proxy.example:8080');
    });

    it('应该保留原有 host:port 精确匹配逻辑', () => {
      process.env.NO_PROXY = '10.5.10.49:8011';

      expect(getProxyForUrlWithCidr('http://10.5.10.49:8011')).toBe('');
      expect(getProxyForUrlWithCidr('http://10.5.10.49:8081')).toBe('http://proxy.example:8080');
    });

    it('应该忽略非法 CIDR 并回退到原有代理规则', () => {
      process.env.NO_PROXY = '10.0.0.0/invalid';

      expect(getProxyForUrlWithCidr('http://10.5.10.49:8011')).toBe('http://proxy.example:8080');
    });
  });
});
