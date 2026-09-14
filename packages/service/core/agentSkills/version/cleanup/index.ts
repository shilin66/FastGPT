import { getQueue, getWorker, QueueNames } from '../../../../common/bullmq';
import { agentSkillVersionCleanupProcessor } from './processor';

export const AGENT_SKILL_VERSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type AgentSkillVersionCleanupJobData = {
  skillId: string;
  versionId: string;
  deleteTime: string;
};

function getAgentSkillVersionCleanupQueue() {
  return getQueue<AgentSkillVersionCleanupJobData>(QueueNames.agentSkillVersionCleanup, {
    defaultJobOptions: {
      attempts: 10,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: true,
      removeOnFail: { age: 90 * 24 * 60 * 60 }
    }
  });
}

export function initAgentSkillVersionCleanupWorker() {
  return getWorker<AgentSkillVersionCleanupJobData>(
    QueueNames.agentSkillVersionCleanup,
    agentSkillVersionCleanupProcessor,
    {
      concurrency: 2,
      removeOnFail: {
        age: 90 * 24 * 60 * 60,
        count: 10000
      }
    }
  );
}

export function addAgentSkillVersionCleanupJob(data: AgentSkillVersionCleanupJobData) {
  const deleteAt = new Date(data.deleteTime).getTime() + AGENT_SKILL_VERSION_RETENTION_MS;
  return getAgentSkillVersionCleanupQueue().add('cleanup_agent_skill_version', data, {
    jobId: `${data.versionId}-${new Date(data.deleteTime).getTime()}`,
    delay: Math.max(0, deleteAt - Date.now())
  });
}
