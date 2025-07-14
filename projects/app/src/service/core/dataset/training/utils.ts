import { generateQA } from '@/service/core/dataset/queues/generateQA';
import { generateVector } from '@/service/core/dataset/queues/generateVector';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { datasetParseQueue } from '../queues/datasetParse';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { delay } from '@fastgpt/global/common/system/utils';
import { trainConfluenceCollection } from '@fastgpt/service/core/dataset/training/controller';
import { generateAuto } from '@/service/core/dataset/queues/generateAuto';
import { generateImage } from '@/service/core/dataset/queues/generateImage';
import { generateImageParse } from '@/service/core/dataset/queues/generateImageParse';

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
        } else if (mode === TrainingModeEnum.parse) {
          datasetParseQueue();
        } else if (mode === TrainingModeEnum.auto) {
          generateAuto();
        } else if (mode === TrainingModeEnum.image) {
          generateImage();
        } else if (mode === TrainingModeEnum.imageParse) {
          generateImageParse();
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
    datasetParseQueue();
    generateAuto();
    generateImage();
    generateImageParse();
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
        await trainConfluenceCollection({ dataset, teamId: dataset.teamId, isSync: true });
      } catch (error) {
        console.error('scheduleTriggerDataset error', error);
      }
    })
  );
};
