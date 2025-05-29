import axios from 'axios';
import Cookie from 'cookie';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import { getErrText } from '@fastgpt/global/common/error/utils';

type Props = {
  username: string;
  password: string;
};
type Response = Promise<{
  result: any;
}>;

const getConfig = async (): Promise<FastGPTFeConfigsType> => {
  try {
    const response = await axios.get(`http://localhost:3000/api/local/getConfig`);
    return response.data.feConfigs as FastGPTFeConfigsType;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Error fetching config:', error.message);
    } else {
      console.error('Unexpected error:', error);
    }
    throw error;
  }
};

const main = async ({ username, password }: Props): Response => {
  const cacheKey = `${username}-${password}`;
  try {
    const cacheResponse = await axios.get(`http://localhost:3000/api/local/getCache`, {
      params: { cacheKey },
      timeout: 10000
    });
    const cachedValue = cacheResponse.data.value;
    if (cachedValue) {
      return { result: cachedValue };
    }
  } catch (error) {
    console.error('Error fetching cache:', error);
  }

  try {
    const feConfigs = await getConfig();
    // 明确设置 Content-Type 头
    const loginResponse = await axios.post(
      `${feConfigs.oss3Url}/localApi/login`,
      {
        email: username,
        password,
        expireMin: 60 * 24
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );

    if (loginResponse.data.code !== 'SUCCESS') {
      return {
        result: {
          errMsg: getErrText('Failed to Login Oss: ' + loginResponse.data.msg)
        }
      };
    }

    const token = loginResponse.data.data.token;

    // 获取 cookie 并解析
    const zenlayerWebNew = await getCookie(`${feConfigs.oss2Url}/zenlayer_web_new/index`, token);

    const zenlayerWeb = await getCookie(`${feConfigs.oss2Url}/zenlayer_web/index`, token);

    try {
      await axios.post(
        `http://localhost:3000/api/local/setCache`,
        {
          cacheKey,
          cacheValue: {
            token,
            zenlayerWeb: `JSESSIONID=${zenlayerWeb}; lang=en`,
            zenlayerWebNew: `JSESSIONID=${zenlayerWebNew}; lang=en`
          },
          ttl: 1000 * 60 * 60 * 2
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        }
      );
    } catch (cacheError) {
      console.error('Error setting cache:', cacheError);
    }

    return {
      result: {
        token,
        zenlayerWeb: `JSESSIONID=${zenlayerWeb}; lang=en`,
        zenlayerWebNew: `JSESSIONID=${zenlayerWebNew}; lang=en`
      }
    };
  } catch (error) {
    console.error('Login Oss failed:', error);
    return {
      result: {
        errMsg: getErrText(error, 'Failed to Login Oss')
      }
    };
  }
};

const getCookie = async (url: string, token: string) => {
  // 获取 cookie 并解析
  const cookieResponse = await axios.get(url, {
    params: { jwt: token },
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000
  });

  const cookieHeaders = cookieResponse.headers['set-cookie'] || [];
  const cookieString = cookieHeaders.join('; ');
  const parsedCookie = Cookie.parse(cookieString);
  return parsedCookie.JSESSIONID;
};

export default main;
