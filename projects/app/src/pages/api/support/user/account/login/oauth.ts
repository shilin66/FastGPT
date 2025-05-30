import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import {
  createUserWithDefaultTeamAndPermission,
  getUserDetail
} from '@fastgpt/service/support/user/controller';
import type { OauthLoginProps } from '@fastgpt/global/support/user/api';
import axios from 'axios';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { setCookie } from '@fastgpt/service/support/permission/controller';
import type { Configuration } from '@azure/msal-node';
import { ConfidentialClientApplication, LogLevel } from '@azure/msal-node';
import { OAuthEnum } from '@fastgpt/global/support/user/constant';
import { createUserSession } from '@fastgpt/service/support/user/session';
import requestIp from 'request-ip';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // await connectToDatabase();
    const { props, callbackUrl, type } = req.body as OauthLoginProps;
    let username;
    switch (type) {
      case OAuthEnum.github:
        username = await authByGithub(props.code, callbackUrl);
        break;
      case OAuthEnum.microsoft:
        username = await authByMicrosoft(props.code, callbackUrl);
        break;
      default:
        return Promise.reject('未配置登录方式');
    }
    if (!username) {
      return Promise.reject(CommonErrEnum.invalidParams);
    }

    const user = await MongoUser.findOne({
      username
    });
    const userId = user ? user._id : await createUserWithDefaultTeamAndPermission(username, type);
    const userDetail = await getUserDetail({
      userId: userId,
      tmbId: user?.lastLoginTmbId
    });
    const token = await createUserSession({
      userId: userDetail._id,
      teamId: userDetail.team.teamId,
      tmbId: userDetail.team.tmbId,
      isRoot: userDetail.username === 'root',
      ip: requestIp.getClientIp(req)
    });
    setCookie(res, token);

    jsonRes(res, {
      data: {
        user: userDetail,
        token
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

async function authByGithub(code: string, callbackUrl: string) {
  const tokenResponse = await axios({
    method: 'post',
    url:
      'https://github.com/login/oauth/access_token?' +
      `client_id=${feConfigs?.oauth?.github?.clientId}&` +
      `client_secret=${feConfigs?.oauth?.github?.clientSecret}&` +
      `code=${code}`,
    headers: {
      accept: 'application/json'
    }
  });
  const accessToken = tokenResponse.data.access_token;
  console.log('accessToken:', accessToken);
  const result = await axios({
    method: 'get',
    url: `https://api.github.com/user`,
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${accessToken}`
    }
  });
  const username = result.data.login;
  console.log('name is', username);
  return username;
}

async function authByMicrosoft(code: string, callbackUrl: string) {
  const microsoft = feConfigs?.oauth?.microsoft;
  if (!microsoft) {
    throw new Error('未配置微软登录');
  }
  const response = await getMsalInstance().acquireTokenByCode({
    code,
    redirectUri: callbackUrl,
    scopes: ['user.read']
  });
  console.log('tokenResp:', response.account?.username);
  return response.account?.username;
}

let msalInstance: ConfidentialClientApplication;
function getMsalInstance() {
  const microsoft = feConfigs?.oauth?.microsoft;
  if (!microsoft) {
    throw new Error('未配置微软登录');
  }
  if (msalInstance) {
    return msalInstance;
  } else {
    const msalConfig: Configuration = {
      auth: {
        clientId: microsoft.clientId,
        authority: 'https://login.microsoftonline.com/' + microsoft.tenantId,
        clientSecret: microsoft?.clientSecret
      },
      // optional
      system: {
        loggerOptions: {
          loggerCallback: (level, message, containsPii) => {
            if (containsPii) {
              return;
            }
            switch (level) {
              case LogLevel.Error:
                console.error(message);
                return;
              case LogLevel.Info:
                console.info(message);
                return;
              case LogLevel.Verbose:
                console.debug(message);
                return;
              case LogLevel.Warning:
                console.warn(message);
                return;
            }
          }
        }
      }
    };
    msalInstance = new ConfidentialClientApplication(msalConfig);
    return msalInstance;
  }
}
