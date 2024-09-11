import type { NextApiRequest, NextApiResponse } from 'next';
import type { InitDateResponse } from '@/global/common/api/systemRes';
import { connectToDatabase } from '@/service/mongo';
import { jsonRes } from '@fastgpt/service/common/response';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectToDatabase();

  jsonRes<InitDateResponse>(res, {
    data: {
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
      llmModels: global.llmModels.map((model) => ({
        ...model,
        customCQPrompt: '',
        customExtractPrompt: '',
        defaultSystemChatPrompt: ''
      })),
      vectorModels: global.vectorModels,
      reRankModels:
        global.reRankModels?.map((item) => ({
          ...item,
          requestUrl: '',
          requestAuth: ''
        })) || [],
      whisperModel: global.whisperModel,
      audioSpeechModels: global.audioSpeechModels,
      systemVersion: global.systemVersion || '0.0.0'
    }
  });
}

export default handler;
