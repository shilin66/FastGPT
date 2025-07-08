import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { createChatCompletion } from '@fastgpt/service/core/ai/config';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { addLog } from '@fastgpt/service/common/system/log';
import type { PushDatasetDataChunkProps } from '@fastgpt/global/core/dataset/api.d';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { checkTeamAiPointsAndLock } from './utils';
import { addMinutes } from 'date-fns';
import { loadRequestMessages } from '@fastgpt/service/core/chat/utils';
import { llmCompletionsBodyFormat, formatLLMResponse } from '@fastgpt/service/core/ai/utils';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { ImageParsePromptDefault } from '@fastgpt/global/core/ai/prompt/agent';
import { getImageBase64 } from '@fastgpt/service/common/file/image/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import type { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import { countGptMessagesTokens, countPromptTokens } from '@fastgpt/service/common/string/tiktoken';
import { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getDatasetImagePreviewUrl } from '@fastgpt/service/core/dataset/image/utils';

const reduceQueue = () => {
  global.qaQueueLen = global.qaQueueLen > 0 ? global.qaQueueLen - 1 : 0;

  return global.qaQueueLen === 0;
};
const reduceQueueAndReturn = (delay = 0) => {
  reduceQueue();
  if (delay) {
    setTimeout(() => {
      generateImageParse();
    }, delay);
  } else {
    generateImageParse();
  }
};

const extractData = (content: string) => {
  // 使用正则表达式匹配标签内容
  const summaryMatch = content.match(/<summary>[\s\S]*?<\/summary>/);
  const descMatch = content.match(/<desc>[\s\S]*?<\/desc>/);
  const indexMatch = content.match(/<index>[\s\S]*?<\/index>/);

  const extractContent = (tagged: RegExpMatchArray | null): string => {
    if (!tagged) {
      return '';
    }
    // 去除开闭标签，并 trim
    return tagged[0]
      .replace(/^<\w+>/, '')
      .replace(/<\/\w+>$/, '')
      .trim();
  };

  return {
    summary: extractContent(summaryMatch),
    desc: extractContent(descMatch),
    index: extractContent(indexMatch)
  };
};

type PopulateType = {
  dataset: { vectorModel: string; agentModel: string; vlmModel: string };
  collection: { name: string; autoIndexes: boolean };
  data: { _id: string; indexes: DatasetDataSchemaType['indexes']; imageId: string };
};

export async function generateImageParse(): Promise<any> {
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
          mode: TrainingModeEnum.imageParse,
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
            select: '_id indexes imageId'
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
      addLog.error(`[ImageParse  Queue] Error`, error);
      return {
        error: true
      };
    }
  })();

  if (done || !data) {
    if (reduceQueue()) {
      addLog.info(`[ImageParse  Queue] Done`);
    }
    return;
  }
  if (error) {
    return reduceQueueAndReturn();
  }

  if (!data.dataset || !data.collection) {
    addLog.info(`[ImageParse Queue] Dataset or collection not found`, data);
    // Delete data
    await MongoDatasetTraining.deleteOne({ _id: data._id });
    return reduceQueueAndReturn();
  }

  // auth balance
  if (!(await checkTeamAiPointsAndLock(data.teamId))) {
    return reduceQueueAndReturn();
  }
  addLog.info(`[ImageParse  Queue] Start`);

  try {
    const modelData = getLLMModel(data.dataset.vlmModel);
    const imageIndexPrompt = ImageParsePromptDefault;
    const imageId = data.imageId;

    if (imageId) {
      const imageUrl = getDatasetImagePreviewUrl({
        imageId,
        teamId: data.teamId,
        datasetId: data.datasetId,
        expiredMinutes: 30
      });
      const base64img = (await getImageBase64(imageUrl)).completeBase64;

      // request LLM to get QA
      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: imageIndexPrompt
            },
            {
              type: 'image_url',
              image_url: {
                url: base64img
              }
            }
          ]
        }
      ];

      const { response: chatResponse } = await createChatCompletion({
        body: llmCompletionsBodyFormat(
          {
            model: modelData.model,
            temperature: 0.3,
            messages: await loadRequestMessages({ messages, useVision: true }),
            stream: true
          },
          modelData
        )
      });
      const { text: answer, usage } = await formatLLMResponse(chatResponse);
      const inputTokens = usage?.prompt_tokens || (await countGptMessagesTokens(messages));
      const outputTokens = usage?.completion_tokens || (await countPromptTokens(answer));

      const { summary, desc, index } = extractData(answer);

      addLog.info(`[ImageParse  Queue] Finish`, {
        time: Date.now() - startTime,
        summaryLength: summary?.length,
        descLength: desc?.length,
        indexLength: index?.length,
        usage
      });

      const newData: PushDatasetDataChunkProps = {
        imageId,
        chunkIndex: data.chunkIndex,
        indexes: []
      };

      if (summary) {
        newData.indexes?.push({
          type: DatasetDataIndexTypeEnum.summary,
          text: summary
        });
      }
      if (index) {
        newData.indexes?.push({
          type: DatasetDataIndexTypeEnum.question,
          text: index
        });
      }
      if (desc) {
        newData.q = desc;
        // newData.indexes?.push({
        //   type: DatasetDataIndexTypeEnum.default,
        //   text: desc
        // });
      }

      // get vector and insert
      await pushDataListToTrainingQueue({
        teamId: data.teamId,
        tmbId: data.tmbId,
        datasetId: data.datasetId,
        collectionId: data.collectionId,
        mode: TrainingModeEnum.chunk,
        data: [newData],
        billId: data.billId,
        vectorModel: data.dataset.vectorModel,
        agentModel: data.dataset.agentModel,
        vlmModel: data.dataset.vlmModel
      });
      // add bill
      pushLLMTrainingUsage({
        teamId: data.teamId,
        tmbId: data.tmbId,
        inputTokens,
        outputTokens,
        billId: data.billId,
        model: modelData.model,
        mode: 'imageParse'
      });
    }

    // delete data from training
    await MongoDatasetTraining.findByIdAndDelete(data._id);

    return reduceQueueAndReturn();
  } catch (err: any) {
    addLog.error(`[ImageParse  Queue] Error`, err);
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
