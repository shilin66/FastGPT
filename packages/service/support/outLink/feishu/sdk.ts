import * as lark from '@larksuiteoapi/node-sdk';
import type { FeishuAppType } from '@fastgpt/global/support/outLink/type';
import { createFeishuSdkAxios } from '../../../common/api/feishu';

export const getFeishuClient = (appConfig: FeishuAppType) =>
  new lark.Client({
    appId: appConfig.appId,
    appSecret: appConfig.appSecret,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu,
    httpInstance: createFeishuSdkAxios()
  });
