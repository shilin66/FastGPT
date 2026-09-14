import { randomUUID } from 'node:crypto';
import { Types } from '../../../common/mongo';
import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import { AgentSkillCreationStatusEnum } from '@fastgpt/global/core/agentSkills/constants';
import { MongoAgentSkills } from '../schema';
import { agentSkillInitializeProcessor } from './processor';

export type AgentSkillInitializeJobData = {
  skillId: string;
  teamId: string;
  tmbId: string;
  operationId: string;
  versionId: string;
};

function getAgentSkillInitializeQueue() {
  return getQueue<AgentSkillInitializeJobData>(QueueNames.agentSkillInitialize, {
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: true,
      removeOnFail: { age: 30 * 24 * 60 * 60 }
    }
  });
}

export function initAgentSkillInitializeWorker() {
  return getWorker<AgentSkillInitializeJobData>(
    QueueNames.agentSkillInitialize,
    agentSkillInitializeProcessor,
    {
      concurrency: 2,
      removeOnFail: {
        age: 30 * 24 * 60 * 60,
        count: 10000
      }
    }
  );
}

export function addAgentSkillInitializeJob(data: AgentSkillInitializeJobData) {
  return getAgentSkillInitializeQueue().add('initialize_agent_skill', data, {
    jobId: `${data.skillId}-${data.operationId}`
  });
}

export async function markAgentSkillInitializationFailed({
  skillId,
  operationId,
  code,
  message
}: {
  skillId: string;
  operationId: string;
  code: string;
  message: string;
}): Promise<void> {
  await MongoAgentSkills.updateOne(
    { _id: skillId, lastOperationId: operationId, currentVersionId: { $exists: false } },
    {
      $set: {
        creationStatus: AgentSkillCreationStatusEnum.failed,
        error: {
          code,
          message,
          operationId,
          updatedAt: new Date()
        },
        updateTime: new Date()
      }
    }
  );
}

export async function retryAgentSkillInitialization({
  skillId,
  teamId,
  tmbId
}: {
  skillId: string;
  teamId: string;
  tmbId: string;
}): Promise<string> {
  const operationId = randomUUID();
  const versionId = new Types.ObjectId().toHexString();
  const result = await MongoAgentSkills.updateOne(
    {
      _id: skillId,
      teamId,
      deleteTime: null,
      currentVersionId: { $exists: false },
      creationStatus: {
        $in: [AgentSkillCreationStatusEnum.pending, AgentSkillCreationStatusEnum.failed]
      }
    },
    {
      $set: {
        creationStatus: AgentSkillCreationStatusEnum.pending,
        lastOperationId: operationId,
        updateTime: new Date()
      },
      $unset: { error: 1 }
    }
  );
  if (result.matchedCount === 0) {
    throw new Error('Skill is not available for initialization retry');
  }

  try {
    await addAgentSkillInitializeJob({ skillId, teamId, tmbId, operationId, versionId });
  } catch (error) {
    await markAgentSkillInitializationFailed({
      skillId,
      operationId,
      code: 'initialization_queue_unavailable',
      message: 'Skill initialization queue is unavailable'
    });
    throw error;
  }

  return operationId;
}
