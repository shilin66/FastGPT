import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { addLog } from '@fastgpt/service/common/system/log';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import type { PushDatasetDataChunkProps } from '@fastgpt/global/core/dataset/api.d';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { checkTeamAiPointsAndLock } from './utils';
import { addMinutes } from 'date-fns';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { ImageIndexPromptDefault } from '@fastgpt/global/core/ai/prompt/agent';
import { getImageBase64 } from '@fastgpt/service/common/file/image/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import type { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import { countGptMessagesTokens, countPromptTokens } from '@fastgpt/service/common/string/tiktoken';
import { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { UsageItemTypeEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';

const reduceQueue = () => {
  global.qaQueueLen = global.qaQueueLen > 0 ? global.qaQueueLen - 1 : 0;

  return global.qaQueueLen === 0;
};
const reduceQueueAndReturn = (delay = 0) => {
  reduceQueue();
  if (delay) {
    setTimeout(() => {
      generateImage();
    }, delay);
  } else {
    generateImage();
  }
};

const extractData = (content: string) => {
  const imageIndexMatch = content.match(/<imageIndex>\n([\s\S]*?)\n<\/imageIndex>/);
  const imageIndex = imageIndexMatch ? imageIndexMatch[1].trim() : '';

  // 匹配 <index> 标签内容的正则表达式（含多行处理）
  const pattern = /<index>([\s\S]*?)<\/index>/g;

  // 获取所有匹配结果
  const matches = Array.from(imageIndex.matchAll(pattern));

  // 提取内容并清理空白
  return matches.map((match) => {
    return match[1]
      .replace(/^\s*[\r\n]/gm, '') // 清理行首空行
      .trim(); // 清理首尾空格
  });
};

const extractLinkUrl = (text: string) => {
  const combinedRegex = new RegExp(
    `(https?:\\/\\/[^\\s/$.?#].[^\\s]*\\.(?:png|jpe?g|gif|webp|bmp|tiff?|svg|ico|heic|avif))|` +
      `(?<!https?:\\/\\/[^\\s]*)(?:\\/api\\/system\\/img\\/[^\\s.]*\\.[^\\s]*)|` +
      `(?:\\/api\\/common\\/s3\\/proxy\\/[^\\s]*\\.(?:png|jpe?g|gif|webp|bmp|tiff?|svg|ico|heic|avif))`,
    'gi'
  );
  // 提取所有匹配项
  const matches = Array.from(text.matchAll(combinedRegex), (m) => m[0]);

  // 去重并分类处理
  return [...new Set(matches)];
};

type PopulateType = {
  dataset: { vectorModel: string; agentModel: string; vlmModel: string };
  collection: { name: string; autoIndexes: boolean };
  data: { _id: string; indexes: DatasetDataSchemaType['indexes'] };
};

export async function generateImage(): Promise<any> {
  const max = global.systemEnv?.vlmMaxProcess || 10;
  if (global.qaQueueLen >= max) return;
  global.qaQueueLen++;

  const startTime = Date.now();
  // get training data
  const {
    data,
    text,
    done = false,
    error = false
  } = await (async () => {
    try {
      const data = await MongoDatasetTraining.findOneAndUpdate(
        {
          mode: TrainingModeEnum.image,
          retryCount: { $gte: 0 },
          lockTime: { $lte: addMinutes(new Date(), -10) }
        },
        {
          lockTime: new Date(),
          $inc: { retryCount: -1 }
        }
      )
        .populate<PopulateType>([
          {
            path: 'dataset',
            select: 'agentModel vectorModel vlmModel'
          },
          {
            path: 'collection',
            select: 'name autoIndexes'
          },
          {
            path: 'data',
            select: '_id indexes'
          }
        ])
        .lean();

      // task preemption
      if (!data) {
        return {
          done: true
        };
      }
      return {
        data,
        // collection,
        text: data.q
      };
    } catch (error) {
      addLog.error(`[ImageIndex  Queue] Error`, error);
      return {
        error: true
      };
    }
  })();

  if (done || !data) {
    if (reduceQueue()) {
      addLog.info(`[ImageIndex  Queue] Done`);
    }
    return;
  }
  if (error) {
    return reduceQueueAndReturn();
  }

  if (!data.dataset || !data.collection) {
    addLog.info(`[Image Queue] Dataset or collection not found`, data);
    // Delete data
    await MongoDatasetTraining.deleteOne({ _id: data._id });
    return reduceQueueAndReturn();
  }

  // auth balance
  if (!(await checkTeamAiPointsAndLock(data.teamId))) {
    return reduceQueueAndReturn();
  }
  addLog.info(`[ImageIndex  Queue] Start`);

  try {
    const modelData = getLLMModel(data.dataset.vlmModel);
    const imageIndexPrompt = global.feConfigs.imageIndexPrompt || ImageIndexPromptDefault;
    const prompt = `${replaceVariable(imageIndexPrompt, { text })}`;
    const images = extractLinkUrl(text);
    const newData: PushDatasetDataChunkProps = {
      q: data.q,
      chunkIndex: data.chunkIndex,
      indexes: []
    };

    if (images && images.length > 0) {
      const imgMsgs = await Promise.all(
        images.map(async (item) => {
          return {
            type: 'image_url' as const,
            image_url: {
              url: item.startsWith('/') ? (await getImageBase64(item)).completeBase64 : item
            }
          };
        })
      );
      for (const imgMsg of imgMsgs) {
        // request LLM to get QA
        const messages: ChatCompletionMessageParam[] = [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              imgMsg
            ]
          }
        ];

        const {
          answerText: answer,
          usage: { inputTokens, outputTokens }
        } = await createLLMResponse({
          body: {
            model: modelData.model,
            temperature: 0.3,
            messages,
            useVision: modelData.vision,
            stream: true
          }
        });

        const indexList = extractData(answer);

        addLog.info(`[ImageIndex  Queue] Finish`, {
          time: Date.now() - startTime,
          imageIndexLength: indexList?.length,
          usage: { inputTokens, outputTokens }
        });

        indexList.forEach((item) => {
          newData.indexes?.push({
            type: DatasetDataIndexTypeEnum.image,
            text: item
          });
        });
        // add bill
        pushLLMTrainingUsage({
          teamId: data.teamId,
          inputTokens,
          outputTokens,
          usageId: data.billId,
          model: modelData.model,
          type: UsageItemTypeEnum.training_imageIndex
        });
      }
    }

    // get vector and insert
    await pushDataListToTrainingQueue({
      teamId: data.teamId,
      tmbId: data.tmbId,
      datasetId: data.datasetId,
      collectionId: data.collectionId,
      mode: data.collection.autoIndexes ? TrainingModeEnum.auto : TrainingModeEnum.chunk,
      data: [newData],
      billId: data.billId,
      vectorModel: data.dataset.vectorModel,
      agentModel: data.dataset.agentModel,
      vlmModel: data.dataset.vlmModel
    });

    // delete data from training
    await MongoDatasetTraining.findByIdAndDelete(data._id);

    return reduceQueueAndReturn();
  } catch (err: any) {
    addLog.error(`[ImageIndex  Queue] Error`, err);
    await MongoDatasetTraining.updateOne(
      {
        teamId: data.teamId,
        datasetId: data.datasetId,
        _id: data._id
      },
      {
        errorMsg: getErrText(err, 'unknown error')
      }
    );

    return reduceQueueAndReturn(500);
  }
}
