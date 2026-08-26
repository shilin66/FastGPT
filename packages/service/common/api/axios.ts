import _, { type AxiosRequestConfig } from 'axios';
import { ProxyAgent } from 'proxy-agent';
import { getProxyForUrl } from 'proxy-from-env';
import ipaddr from 'ipaddr.js';
import { isDevEnv } from '@fastgpt/global/common/system/constants';

const getNoProxyEnv = () =>
  process.env.npm_config_no_proxy || process.env.no_proxy || process.env.NO_PROXY || '';

const getHostnameFromUrl = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

const isNoProxyCidrMatched = (url: string) => {
  const hostname = getHostnameFromUrl(url);
  if (!hostname) return false;

  let hostIp: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    hostIp = ipaddr.process(hostname);
  } catch {
    return false;
  }

  const noProxyList = getNoProxyEnv().split(/[,\s]/).filter(Boolean);
  for (const item of noProxyList) {
    if (!item.includes('/')) continue;

    try {
      const [rangeIp, prefix] = ipaddr.parseCIDR(item);
      if (hostIp.kind() === rangeIp.kind() && hostIp.match(rangeIp, prefix)) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
};

export const getProxyForUrlWithCidr = (url: string) => {
  if (isNoProxyCidrMatched(url)) return '';
  return getProxyForUrl(url);
};

export function createProxyAxios(config?: AxiosRequestConfig) {
  const agent = new ProxyAgent({ getProxyForUrl: getProxyForUrlWithCidr });

  if (isDevEnv) {
    return _.create(config);
  }

  return _.create({
    proxy: false,
    httpAgent: agent,
    httpsAgent: agent,
    ...config
  });
}

/** @see https://github.com/axios/axios/issues/4531 */
export const axios = createProxyAxios();
