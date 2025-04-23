import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextApiRequest, NextApiResponse } from 'next';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { ChunkSettingsType } from '@fastgpt/global/core/dataset/type';
import {
  ChunkSettingModeEnum,
  DataChunkSplitModeEnum,
  DatasetCollectionDataProcessModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';

async function handler(req: NextApiRequest, _res: NextApiResponse) {
  await authCert({ req, authRoot: true });

  const datasetList = await MongoDataset.find({
    confluenceConfig: { $exists: true, $ne: {} },
    'confluenceConfig.spaceKey': { $exists: true, $ne: '' },
    chunkSettings: { $exists: false }
  }).lean();

  await Promise.all(
    datasetList.map(async (dataset) => {
      const confluenceConfig = dataset.confluenceConfig;
      if (!confluenceConfig) {
        return;
      }
      const chunkSetting: ChunkSettingsType = {
        chunkSize: confluenceConfig?.chunkSize ? confluenceConfig.chunkSize : 1000,
        chunkSplitMode: DataChunkSplitModeEnum.size,
        chunkSettingMode: confluenceConfig?.way ? confluenceConfig.way : ChunkSettingModeEnum.auto,
        trainingType: confluenceConfig?.mode
          ? confluenceConfig.mode
          : DatasetCollectionDataProcessModeEnum.auto,
        chunkSplitter: confluenceConfig?.chunkSplitter ? confluenceConfig.chunkSplitter : '',
        qaPrompt: confluenceConfig?.qaPrompt
          ? confluenceConfig.qaPrompt
          : Prompt_AgentQA.description
      };
      await MongoDataset.updateOne({ _id: dataset._id }, { $set: { chunkSettings: chunkSetting } });
    })
  );

  return { success: true };
}

export default NextAPI(handler);
