import type { AxiosRequestConfig } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import type { AxiosResponse } from 'axios';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createProxyAxios } from './axios';

const buildHttpProxyUrl = (host?: string, port?: string) => {
  if (!host || !port) return '';

  if (/^https?:\/\//.test(host)) {
    return `${host}:${port}`;
  }

  return `http://${host}:${port}`;
};

export const getFeishuProxyUrl = () => {
  return (
    process.env.FEISHU_PROXY_URL ||
    buildHttpProxyUrl(process.env.FEISHU_PROXY_HOST, process.env.FEISHU_PROXY_PORT) ||
    buildHttpProxyUrl(process.env.AXIOS_PROXY_HOST, process.env.AXIOS_PROXY_PORT) ||
    ''
  );
};

export function createFeishuAxios(config?: AxiosRequestConfig) {
  const proxyUrl = getFeishuProxyUrl();

  if (!proxyUrl) {
    return createProxyAxios(config);
  }

  return createProxyAxios({
    proxy: false,
    httpAgent: new HttpProxyAgent(proxyUrl),
    httpsAgent: new HttpsProxyAgent(proxyUrl),
    ...config
  });
}

export function createFeishuSdkAxios(config?: AxiosRequestConfig) {
  const instance = createFeishuAxios(config);

  instance.interceptors.request.use((req: InternalAxiosRequestConfig) => {
    if (req.headers) {
      req.headers['User-Agent'] = 'oapi-node-sdk/1.0.0';
    }
    return req;
  });

  instance.interceptors.response.use((resp: AxiosResponse) => {
    const config = resp.config as AxiosRequestConfig & Record<string, unknown>;

    if (config['$return_headers']) {
      return {
        data: resp.data,
        headers: resp.headers
      };
    }

    return resp.data;
  });

  return instance;
}
