import { generateQA } from '@/service/events/generateQA';
import { generateVector } from '@/service/events/generateVector';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { delay } from '@fastgpt/global/common/system/utils';
import { trainConfluenceCollection } from '@fastgpt/service/core/dataset/training/controller';

export const createDatasetTrainingMongoWatch = () => {
  const changeStream = MongoDatasetTraining.watch();

  changeStream.on('change', async (change) => {
    try {
      if (change.operationType === 'insert') {
        const fullDocument = change.fullDocument as DatasetTrainingSchemaType;
        const { mode } = fullDocument;
        if (mode === TrainingModeEnum.qa) {
          generateQA();
        } else if (mode === TrainingModeEnum.chunk) {
          generateVector();
        }
      }
    } catch (error) {}
  });
};

export const startTrainingQueue = (fast?: boolean) => {
  const max = global.systemEnv?.qaMaxProcess || 10;
  for (let i = 0; i < (fast ? max : 1); i++) {
    generateQA();
    generateVector();
  }
};

export const scheduleTriggerDataset = async () => {
  const datasets = await MongoDataset.find({
    'confluenceConfig.syncSchedule': true
  });
  console.log('scheduleTriggerDataset datasets', datasets.length);
  await Promise.allSettled(
    datasets.map(async (dataset) => {
      // random delay 0 ~ 60s
      await delay(Math.floor(Math.random() * 60 * 1000));
      try {
        await trainConfluenceCollection({ dataset, teamId: dataset.teamId });
      } catch (error) {
        console.log('scheduleTriggerDataset error', error);
      }
    })
  );
};
