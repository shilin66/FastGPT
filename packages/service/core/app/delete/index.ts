import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import { appDeleteProcessor } from './processor';

export type AppDeleteJobData = {
  teamId: string;
  appId: string;
};

// 创建工作进程
export const initAppDeleteWorker = () => {
  return getWorker<AppDeleteJobData>(QueueNames.appDelete, appDeleteProcessor, {
    concurrency: 1, // 确保同时只有1个删除任务
    removeOnFail: {
      age: 90 * 24 * 60 * 60, // 保留90天失败记录
      count: 10000 // 最多保留10000个失败任务
    }
  });
};

// 添加删除任务
const getAppDeleteQueue = () =>
  getQueue<AppDeleteJobData>(QueueNames.appDelete, {
    defaultJobOptions: {
      attempts: 10,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: true,
      removeOnFail: { age: 30 * 24 * 60 * 60 } // 保留30天失败记录
    }
  });

export const addAppDeleteJob = (data: AppDeleteJobData) => {
  const appDeleteQueue = getAppDeleteQueue();
  const jobId = `${String(data.teamId)}-${String(data.appId)}`;

  // Use jobId to automatically prevent duplicate deletion tasks (BullMQ feature)
  return appDeleteQueue.add('delete_app', data, {
    jobId,
    delay: 1000 // Delay 1 second to ensure API response completes
  });
};

export const retryAppDeleteJob = async (data: AppDeleteJobData) => {
  const queue = getAppDeleteQueue();
  const job = await queue.getJob(`${String(data.teamId)}-${String(data.appId)}`);
  if (!job) return addAppDeleteJob(data);
  if ((await job.getState()) === 'failed') await job.retry('failed');
};
