import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { initS3MQWorker } from '@fastgpt/service/common/s3';
import { initDatasetDeleteWorker } from '@fastgpt/service/core/dataset/delete';
import { initAppDeleteWorker } from '@fastgpt/service/core/app/delete';
import { initTeamDeleteWorker } from '@fastgpt/service/support/user/team/delete';
import { initCollectionUpdateWorker } from '@fastgpt/service/core/dataset/collection/mq';
import { initWechatPollWorker } from '@fastgpt/service/support/outLink/wechat/mq';
import { initAdminOperationWorker } from '@fastgpt/service/admin/operation/queue';
import { initAgentSkillInitializeWorker } from '@fastgpt/service/core/agentSkills/initialize';
import { initAgentSkillVersionCleanupWorker } from '@fastgpt/service/core/agentSkills/version/cleanup';
import { initAgentSkillDeleteWorker } from '@fastgpt/service/core/agentSkills/delete';

const logger = getLogger(LogCategories.INFRA.QUEUE);

export const initBullMQWorkers = () => {
  logger.info('BullMQ workers initialization started');
  return Promise.all([
    initS3MQWorker(),
    initDatasetDeleteWorker(),
    initAppDeleteWorker(),
    initTeamDeleteWorker(),
    initCollectionUpdateWorker(),
    initWechatPollWorker(),
    initAdminOperationWorker(),
    initAgentSkillInitializeWorker(),
    initAgentSkillVersionCleanupWorker(),
    initAgentSkillDeleteWorker()
  ]);
};
