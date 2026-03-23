import type { NextApiResponse } from 'next';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type InitDateResponse } from '@/global/common/api/systemRes';
import { type SystemModelItemType } from '@fastgpt/service/core/ai/type';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

const filterModelsByTeam = (teamId?: string) => {
  return global.systemActiveModelList
    .filter((model) => !model.teamIds?.length || (teamId && model.teamIds.includes(teamId)))
    .map((model) => ({
      ...model,
      defaultSystemChatPrompt: undefined,
      fieldMap: undefined,
      defaultConfig: undefined,
      weight: undefined,
      dbConfig: undefined,
      queryConfig: undefined,
      requestUrl: undefined,
      requestAuth: undefined,
      teamIds: undefined
    })) as SystemModelItemType[];
};

async function handler(
  req: ApiRequestProps<{}, { bufferId?: string }>,
  res: NextApiResponse
): Promise<InitDateResponse> {
  const { bufferId } = req.query;

  try {
    const { teamId } = await authCert({ req, authToken: true, authApiKey: true });
    const activeModelList = filterModelsByTeam(teamId);
    // If bufferId is the same as the current bufferId, return directly
    if (bufferId && global.systemInitBufferId && global.systemInitBufferId === bufferId) {
      return {
        bufferId: global.systemInitBufferId,
        systemVersion: global.systemVersion
      };
    }

    return {
      bufferId: global.systemInitBufferId,
      feConfigs: {
        ...global.feConfigs,
        oauth: {
          ...global.feConfigs.oauth,
          github: global.feConfigs.oauth?.github
            ? {
                ...global.feConfigs?.oauth?.github,
                clientSecret: '******'
              }
            : undefined,
          microsoft: global.feConfigs.oauth?.microsoft
            ? {
                ...global.feConfigs?.oauth?.microsoft,
                clientSecret: '******'
              }
            : undefined
        }
      },
      subPlans: global.subPlans,
      systemVersion: global.systemVersion,
      activeModelList,
      defaultModels: global.systemDefaultModel
    };
  } catch (error) {
    const referer = req.headers.referer;
    if (referer?.includes('/price')) {
      const publicModelList = filterModelsByTeam();
      return {
        feConfigs: {
          ...global.feConfigs,
          oauth: {
            ...global.feConfigs.oauth,
            github: global.feConfigs.oauth?.github
              ? {
                  ...global.feConfigs?.oauth?.github,
                  clientSecret: '******'
                }
              : undefined,
            microsoft: global.feConfigs.oauth?.microsoft
              ? {
                  ...global.feConfigs?.oauth?.microsoft,
                  clientSecret: '******'
                }
              : undefined
          }
        },
        subPlans: global.subPlans,
        activeModelList: publicModelList
      };
    }

    const unAuthBufferId = global.systemInitBufferId ? `unAuth_${global.systemInitBufferId}` : '';
    if (bufferId && unAuthBufferId === bufferId) {
      return {
        bufferId: unAuthBufferId
      };
    }

    return {
      bufferId: unAuthBufferId,
      feConfigs: {
        ...global.feConfigs,
        oauth: {
          ...global.feConfigs.oauth,
          github: global.feConfigs.oauth?.github
            ? {
                ...global.feConfigs?.oauth?.github,
                clientSecret: '******'
              }
            : undefined,
          microsoft: global.feConfigs.oauth?.microsoft
            ? {
                ...global.feConfigs?.oauth?.microsoft,
                clientSecret: '******'
              }
            : undefined
        }
      }
    };
  }
}

export default NextAPI(handler);
