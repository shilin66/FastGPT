import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { pushQAUsage } from '@/service/support/wallet/usage/push';
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
import { pushDataListToTrainingQueueByCollectionId } from '@fastgpt/service/core/dataset/training/controller';
import { loadRequestMessages } from '@fastgpt/service/core/chat/utils';
import {
  llmCompletionsBodyFormat,
  llmStreamResponseToAnswerText
} from '@fastgpt/service/core/ai/utils';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';

const reduceQueue = () => {
  global.qaQueueLen = global.qaQueueLen > 0 ? global.qaQueueLen - 1 : 0;

  return global.qaQueueLen === 0;
};
const extractData = (content: string) => {
  const summaryMatch = content.match(/<summary>\n([\s\S]*?)\n<\/summary>/);
  const summary = summaryMatch ? summaryMatch[1].trim() : '';

  const questionIndexMatch = content.match(/<questionIndex>\n([\s\S]*?)\n<\/questionIndex>/);
  const questionIndex = questionIndexMatch ? questionIndexMatch[1].trim() : '';
  return { summary, questionIndex };
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
        .select({
          _id: 1,
          teamId: 1,
          tmbId: 1,
          datasetId: 1,
          collectionId: 1,
          q: 1,
          model: 1,
          chunkIndex: 1,
          indexes: 1,
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
    reduceQueue();
    return generateAuto();
  }

  // auth balance
  if (!(await checkTeamAiPointsAndLock(data.teamId))) {
    reduceQueue();
    return generateAuto();
  }
  addLog.info(`[AutoIndex  Queue] Start`);

  try {
    const modelData = getLLMModel(data.model);
    const autoIndexPrompt = global.feConfigs.autoIndexPrompt || AutoIndexPromptDefault;
    const prompt = `${replaceVariable(autoIndexPrompt, { text })}`;

    // request LLM to get QA
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
    const answer = await llmStreamResponseToAnswerText(chatResponse);

    const { summary, questionIndex } = extractData(answer);

    addLog.info(`[AutoIndex  Queue] Finish`, {
      time: Date.now() - startTime,
      summaryLength: summary?.length,
      questionIndexLength: questionIndex?.length,
      usage: chatResponse.usage
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
    const { insertLen } = await pushDataListToTrainingQueueByCollectionId({
      teamId: data.teamId,
      tmbId: data.tmbId,
      collectionId: data.collectionId,
      mode: TrainingModeEnum.chunk,
      data: [newData],
      billId: data.billId
    });

    // delete data from training
    await MongoDatasetTraining.findByIdAndDelete(data._id);

    // add bill
    if (insertLen > 0) {
      pushQAUsage({
        teamId: data.teamId,
        tmbId: data.tmbId,
        inputTokens: await countGptMessagesTokens(messages),
        outputTokens: await countPromptTokens(answer),
        billId: data.billId,
        model: modelData.model
      });
    } else {
      addLog.info(`AutoIndex result 0:`, { answer });
    }

    reduceQueue();
    generateAuto();
  } catch (err: any) {
    addLog.error(`[AutoIndex  Queue] Error`, err);
    reduceQueue();

    setTimeout(() => {
      generateAuto();
    }, 1000);
  }
}
