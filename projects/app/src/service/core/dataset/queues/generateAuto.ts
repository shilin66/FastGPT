import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { AutoIndexPromptDefault } from '@fastgpt/global/core/ai/prompt/agent';
import type { PushDatasetDataChunkProps } from '@fastgpt/global/core/dataset/api';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { checkTeamAiPointsAndLock } from './utils';
import { addMinutes } from 'date-fns';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { UsageItemTypeEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.MODULE.DATASET.QUEUES);
const reduceQueue = () => {
  global.qaQueueLen = global.qaQueueLen > 0 ? global.qaQueueLen - 1 : 0;

  return global.qaQueueLen === 0;
};
const reduceQueueAndReturn = (delay = 0) => {
  reduceQueue();
  if (delay) {
    setTimeout(() => {
      generateAuto();
    }, delay);
  } else {
    generateAuto();
  }
};
const extractData = (content: string) => {
  const summaryMatch = content.match(/<summary>\n([\s\S]*?)\n<\/summary>/);
  const summary = summaryMatch ? summaryMatch[1].trim() : '';

  const questionIndexMatch = content.match(/<questionIndex>\n([\s\S]*?)\n<\/questionIndex>/);
  const questionIndex = questionIndexMatch ? questionIndexMatch[1].trim() : '';
  return { summary, questionIndex };
};

type PopulateType = {
  dataset: { vectorModel: string; agentModel: string; vlmModel: string };
  collection: { name: string };
  data: { _id: string; indexes: DatasetDataSchemaType['indexes'] };
};
export async function generateAuto(): Promise<any> {
  const max = global.systemEnv?.qaMaxProcess || 10;
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
          mode: TrainingModeEnum.auto,
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
            select: 'vectorModel'
          },
          {
            path: 'collection',
            select: 'name'
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
        text: data.q
      };
    } catch (error) {
      logger.error(`[AutoIndex  Queue] Error`, { error });
      return {
        error: true
      };
    }
  })();

  if (done || !data) {
    if (reduceQueue()) {
      logger.info(`[AutoIndex  Queue] Done`);
    }
    return;
  }
  if (error) {
    return reduceQueueAndReturn();
  }

  if (!data.dataset || !data.collection) {
    logger.info(`[AutoIndex Queue] Dataset or collection not found`, data);
    // Delete data
    await MongoDatasetTraining.deleteOne({ _id: data._id });
    return reduceQueueAndReturn();
  }

  // auth balance
  if (!(await checkTeamAiPointsAndLock(data.teamId))) {
    return reduceQueueAndReturn();
  }
  logger.info(`[AutoIndex  Queue] Start`);

  try {
    const modelData = getLLMModel(data.dataset.agentModel);
    const autoIndexPrompt = global.feConfigs.autoIndexPrompt || AutoIndexPromptDefault;
    const prompt = `${replaceVariable(autoIndexPrompt, { text })}`;

    // request LLM to get Index
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: prompt
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
        stream: true
      }
    });

    const { summary, questionIndex } = extractData(answer);

    logger.info(`[AutoIndex  Queue] Finish`, {
      time: Date.now() - startTime,
      summaryLength: summary?.length,
      questionIndexLength: questionIndex?.length,
      usage: { inputTokens, outputTokens }
    });

    const newData: PushDatasetDataChunkProps = {
      q: data.q,
      chunkIndex: data.chunkIndex,
      indexes: data.indexes || []
    };

    if (summary) {
      newData.indexes?.push({
        type: DatasetDataIndexTypeEnum.summary,
        text: summary
      });
    }

    if (questionIndex) {
      newData.indexes?.push({
        type: DatasetDataIndexTypeEnum.question,
        text: questionIndex
      });
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

    // delete data from training
    await MongoDatasetTraining.findByIdAndDelete(data._id);

    // add bill
    pushLLMTrainingUsage({
      teamId: data.teamId,
      inputTokens,
      outputTokens,
      usageId: data.billId,
      model: modelData.model,
      type: UsageItemTypeEnum.training_autoIndex
    });

    return reduceQueueAndReturn();
  } catch (err: any) {
    logger.error(`[AutoIndex  Queue] Error`, err);
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
