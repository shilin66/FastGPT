import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { createChatCompletion } from '@fastgpt/service/core/ai/config';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { addLog } from '@fastgpt/service/common/system/log';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { AutoIndexPromptDefault } from '@fastgpt/global/core/ai/prompt/agent';
import type { PushDatasetDataChunkProps } from '@fastgpt/global/core/dataset/api.d';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { checkTeamAiPointsAndLock } from './utils';
import { addMinutes } from 'date-fns';
import { countGptMessagesTokens, countPromptTokens } from '@fastgpt/service/common/string/tiktoken';
import { loadRequestMessages } from '@fastgpt/service/core/chat/utils';
import { llmCompletionsBodyFormat, formatLLMResponse } from '@fastgpt/service/core/ai/utils';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';

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
      addLog.error(`[AutoIndex  Queue] Error`, error);
      return {
        error: true
      };
    }
  })();

  if (done || !data) {
    if (reduceQueue()) {
      addLog.info(`[AutoIndex  Queue] Done`);
    }
    return;
  }
  if (error) {
    return reduceQueueAndReturn();
  }

  if (!data.dataset || !data.collection) {
    addLog.info(`[AutoIndex Queue] Dataset or collection not found`, data);
    // Delete data
    await MongoDatasetTraining.deleteOne({ _id: data._id });
    return reduceQueueAndReturn();
  }

  // auth balance
  if (!(await checkTeamAiPointsAndLock(data.teamId))) {
    return reduceQueueAndReturn();
  }
  addLog.info(`[AutoIndex  Queue] Start`);

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

    const { response: chatResponse } = await createChatCompletion({
      body: llmCompletionsBodyFormat(
        {
          model: modelData.model,
          temperature: 0.3,
          messages: await loadRequestMessages({ messages, useVision: false }),
          stream: true
        },
        modelData
      )
    });
    const { text: answer, usage } = await formatLLMResponse(chatResponse);
    const inputTokens = usage?.prompt_tokens || (await countGptMessagesTokens(messages));
    const outputTokens = usage?.completion_tokens || (await countPromptTokens(answer));
    const { summary, questionIndex } = extractData(answer);

    addLog.info(`[AutoIndex  Queue] Finish`, {
      time: Date.now() - startTime,
      summaryLength: summary?.length,
      questionIndexLength: questionIndex?.length,
      usage
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
      tmbId: data.tmbId,
      inputTokens,
      outputTokens,
      billId: data.billId,
      model: modelData.model,
      mode: 'autoIndex'
    });

    return reduceQueueAndReturn();
  } catch (err: any) {
    addLog.error(`[AutoIndex  Queue] Error`, err);
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
