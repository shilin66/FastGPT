import type { ApiDatasetServerType } from './type';

export const filterApiDatasetServerPublicData = (apiDatasetServer?: ApiDatasetServerType) => {
  if (!apiDatasetServer) return undefined;

  const { apiServer, yuqueServer, feishuServer, confluenceServer } = apiDatasetServer;

  return {
    apiServer: apiServer
      ? {
          baseUrl: apiServer.baseUrl,
          authorization: '******',
          basePath: apiServer.basePath
        }
      : undefined,
    yuqueServer: yuqueServer
      ? {
          userId: yuqueServer.userId,
          token: '******',
          basePath: yuqueServer.basePath
        }
      : undefined,
    feishuServer: feishuServer
      ? {
          appId: feishuServer.appId,
          appSecret: '******',
          folderToken: feishuServer.folderToken
        }
      : undefined,
    confluenceServer: confluenceServer
      ? {
          account: confluenceServer.account,
          token: '******',
          baseUrl: confluenceServer.baseUrl,
          spaceKey: confluenceServer.spaceKey,
          pageId: confluenceServer.pageId,
          syncSubPages: confluenceServer.syncSubPages
        }
      : undefined
  };
};

export const mergeApiDatasetServerForUpdate = (
  currentApiDatasetServer: ApiDatasetServerType | undefined,
  originalApiDatasetServer: ApiDatasetServerType | undefined
): ApiDatasetServerType => {
  if (!currentApiDatasetServer) return {};

  const mergedServer: ApiDatasetServerType = {};

  // 处理API服务器配置
  if (currentApiDatasetServer.apiServer) {
    mergedServer.apiServer = {
      ...currentApiDatasetServer.apiServer
    };

    // 如果当前提交的authorization是占位符'******'，则保留原始值
    if (
      currentApiDatasetServer.apiServer.authorization === '******' &&
      originalApiDatasetServer?.apiServer?.authorization
    ) {
      mergedServer.apiServer.authorization = originalApiDatasetServer.apiServer.authorization;
    }
  }

  // 处理语雀服务器配置
  if (currentApiDatasetServer.yuqueServer) {
    mergedServer.yuqueServer = {
      ...currentApiDatasetServer.yuqueServer
    };

    // 如果当前提交的token是占位符'******'，则保留原始值
    if (
      currentApiDatasetServer.yuqueServer.token === '******' &&
      originalApiDatasetServer?.yuqueServer?.token
    ) {
      mergedServer.yuqueServer.token = originalApiDatasetServer.yuqueServer.token;
    }
  }

  // 处理飞书服务器配置
  if (currentApiDatasetServer.feishuServer) {
    mergedServer.feishuServer = {
      ...currentApiDatasetServer.feishuServer
    };

    // 如果当前提交的appSecret是占位符'******'，则保留原始值
    if (
      currentApiDatasetServer.feishuServer.appSecret === '******' &&
      originalApiDatasetServer?.feishuServer?.appSecret
    ) {
      mergedServer.feishuServer.appSecret = originalApiDatasetServer.feishuServer.appSecret;
    }
  }

  // 处理Confluence服务器配置
  if (currentApiDatasetServer.confluenceServer) {
    mergedServer.confluenceServer = {
      ...currentApiDatasetServer.confluenceServer
    };

    // 如果当前提交的token是占位符'******'，则保留原始值
    if (
      currentApiDatasetServer.confluenceServer.token === '******' &&
      originalApiDatasetServer?.confluenceServer?.token
    ) {
      mergedServer.confluenceServer.token = originalApiDatasetServer.confluenceServer.token;
    }
  }

  return mergedServer;
};
