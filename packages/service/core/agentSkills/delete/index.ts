import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import { MongoAgentSkills } from '../schema';
import { getLogger, LogCategories } from '../../../common/logger';
import { cleanupAgentSkillDeletion } from './processor';
import { getSkillDeletionScope } from './entity';
import { MongoAgentSkillsVersion } from '../version/schema';
import { AGENT_SKILL_VERSION_RETENTION_MS } from '../version/cleanup';
import {
  AgentSkillDeleteJobSchema,
  type AgentSkillDeleteJobData,
  type AgentSkillDeleteQueueData
} from './type';

const logger = getLogger(LogCategories.INFRA.QUEUE);

const getAgentSkillDeleteQueue = () =>
  getQueue<AgentSkillDeleteQueueData>(QueueNames.agentSkillDelete, {
    defaultJobOptions: {
      attempts: 10,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: { age: 90 * 24 * 60 * 60 }
    }
  });

export const addAgentSkillDeleteJob = async (input: AgentSkillDeleteJobData) => {
  const data = AgentSkillDeleteJobSchema.parse(input);
  const scope = await getSkillDeletionScope(data);
  if (!scope) return;
  let delay = 0;
  if (scope.root.deletionOperation?.checkpoint === 'chat_deleted') {
    const latest = await MongoAgentSkillsVersion.findOne(
      { skillId: { $in: scope.memberIds }, isDeleted: true },
      { deleteTime: 1 }
    )
      .sort({ deleteTime: -1 })
      .lean();
    if (latest?.deleteTime)
      delay = Math.max(
        0,
        latest.deleteTime.getTime() + AGENT_SKILL_VERSION_RETENTION_MS - Date.now()
      );
  }
  const queue = getAgentSkillDeleteQueue();
  const jobId = `${data.skillId}-${data.operationId}`;
  const existing = await queue.getJob(jobId);
  if (existing) {
    if ((await existing.getState()) === 'failed') await existing.retry();
  } else await queue.add('delete_agent_skill', data, { jobId, ...(delay > 0 ? { delay } : {}) });
  await MongoAgentSkills.updateOne(
    {
      _id: data.skillId,
      teamId: data.teamId,
      deleteTime: new Date(data.deleteTime),
      'deletionOperation.id': data.operationId
    },
    { $set: { 'deletionOperation.lastQueuedAt': new Date() } }
  );
};

export const reconcileAgentSkillDeletions = async () => {
  const roots = await MongoAgentSkills.find({
    deleteTime: { $ne: null },
    'deletionOperation.id': { $exists: true },
    $expr: { $eq: ['$_id', '$deletionOperation.rootId'] },
    $or: [
      { 'deletionOperation.lastQueuedAt': { $exists: false } },
      { 'deletionOperation.lastQueuedAt': { $lt: new Date(Date.now() - 5 * 60 * 1000) } }
    ]
  })
    .sort({ 'deletionOperation.lastQueuedAt': 1, _id: 1 })
    .limit(100)
    .lean();
  for (const root of roots) {
    try {
      await addAgentSkillDeleteJob({
        kind: 'delete',
        teamId: String(root.teamId),
        skillId: String(root._id),
        operationId: root.deletionOperation!.id,
        deleteTime: root.deleteTime!.toISOString()
      });
    } catch (error) {
      logger.error('Failed to enqueue marked Skill deletion', {
        skillId: String(root._id),
        teamId: String(root.teamId),
        operationId: root.deletionOperation?.id,
        error
      });
    }
  }
};

export const initAgentSkillDeleteWorker = async () => {
  const worker = getWorker<AgentSkillDeleteQueueData>(
    QueueNames.agentSkillDelete,
    async (job) => {
      if (job.data.kind === 'reconcile') return reconcileAgentSkillDeletions();
      return cleanupAgentSkillDeletion(job.data);
    },
    { concurrency: 2 }
  );
  await getAgentSkillDeleteQueue().upsertJobScheduler(
    'reconcile-agent-skill-deletions',
    { every: 60_000 },
    { name: 'reconcile_agent_skill_deletions', data: { kind: 'reconcile' } }
  );
  return worker;
};
