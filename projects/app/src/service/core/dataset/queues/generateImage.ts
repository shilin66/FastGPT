import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { createChatCompletion } from '@fastgpt/service/core/ai/config';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { addLog } from '@fastgpt/service/common/system/log';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import type { PushDatasetDataChunkProps } from '@fastgpt/global/core/dataset/api.d';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { checkTeamAiPointsAndLock } from './utils';
import { addMinutes } from 'date-fns';
import { pushDataListToTrainingQueueByCollectionId } from '@fastgpt/service/core/dataset/training/controller';
import { loadRequestMessages } from '@fastgpt/service/core/chat/utils';
import {
  llmCompletionsBodyFormat,
  formatLLMResponse,
  llmStreamResponseToAnswerText
} from '@fastgpt/service/core/ai/utils';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { pushQAUsage } from '../support/wallet/usage/push';
import { countGptMessagesTokens, countPromptTokens } from '@fastgpt/service/common/string/tiktoken';
import { ImageIndexPromptDefault } from '@fastgpt/global/core/ai/prompt/agent';
import { getImageBase64 } from '@fastgpt/service/common/file/image/utils';

const reduceQueue = () => {
  global.vectorQueueLen = global.vectorQueueLen > 0 ? global.vectorQueueLen - 1 : 0;

  return global.vectorQueueLen === 0;
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
      `(?<!https?:\\/\\/[^\\s]*)(?:\\/api\\/system\\/img\\/[^\\s.]*\\.[^\\s]*)`,
    'gi'
  );
  // 提取所有匹配项
  const matches = Array.from(text.matchAll(combinedRegex), (m) => m[0]);

  // 去重并分类处理
  return [...new Set(matches)];
};

export async function generateImage(): Promise<any> {
  const max = global.systemEnv?.vlmMaxProcess || 10;
  if (global.vectorQueueLen >= max) return;
  global.vectorQueueLen++;

  const startTime = Date.now();
  // get training data
  const {
    data,
    text,
    collection,
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
        .select({
          _id: 1,
          teamId: 1,
          tmbId: 1,
          datasetId: 1,
          collectionId: 1,
          q: 1,
          model: 1,
          chunkIndex: 1,
          billId: 1,
          prompt: 1
        })
        .lean();

      // task preemption
      if (!data) {
        return {
          done: true
        };
      }
      const collection = await MongoDatasetCollection.findById(data.collectionId);
      if (!collection) {
        addLog.error(`[ImageIndex  Queue] Error collection is null`);
        return {
          error: true
        };
      }
      return {
        data,
        collection,
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
    reduceQueue();
    return generateImage();
  }
  // auth balance
  if (!(await checkTeamAiPointsAndLock(data.teamId))) {
    reduceQueue();
    return generateImage();
  }
  addLog.info(`[ImageIndex  Queue] Start`);

  try {
    const modelData = getLLMModel(data.model);
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
      // request LLM to get QA
      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            ...imgMsgs
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

      const indexList = extractData(answer);

      addLog.info(`[ImageIndex  Queue] Finish`, {
        time: Date.now() - startTime,
        imageIndexLength: indexList?.length,
        usage
      });

      indexList.forEach((item) => {
        newData.indexes?.push({
          type: DatasetDataIndexTypeEnum.image,
          text: item
        });
      });

      pushQAUsage({
        teamId: data.teamId,
        tmbId: data.tmbId,
        inputTokens: await countGptMessagesTokens(messages),
        outputTokens: await countPromptTokens(answer),
        billId: data.billId,
        model: modelData.model
      });
    }

    // get vector and insert
    const { insertLen } = await pushDataListToTrainingQueueByCollectionId({
      teamId: data.teamId,
      tmbId: data.tmbId,
      collectionId: data.collectionId,
      mode: collection.autoIndexes ? TrainingModeEnum.auto : TrainingModeEnum.chunk,
      data: [newData],
      billId: data.billId
    });

    // delete data from training
    await MongoDatasetTraining.findByIdAndDelete(data._id);

    reduceQueue();
    generateImage();
  } catch (err: any) {
    addLog.error(`[ImageIndex  Queue] Error`, err);
    reduceQueue();

    setTimeout(() => {
      generateImage();
    }, 1000);
  }
}
