import { MongoDatasetCollection } from './schema';
import type { ClientSession } from '../../../common/mongo';
import { MongoDatasetCollectionTags } from '../tag/schema';
import { readFromSecondary } from '../../../common/mongo/utils';
import type { CollectionWithDatasetType } from '@fastgpt/global/core/dataset/type';
import type { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import { type DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionSyncResultEnum,
  DatasetCollectionTypeEnum,
  DatasetSourceReadTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { rawText2Chunks, readDatasetSourceRawText } from '../read';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import type { CreateOneCollectionParams } from './controller';
import { createCollectionAndInsertData, delCollection } from './controller';
import { collectionCanSync } from '@fastgpt/global/core/dataset/collection/utils';
import type { PushDatasetDataResponse } from '@fastgpt/global/core/dataset/api';
import { pushDataListToTrainingQueue } from '../training/controller';
import { createTrainingUsage } from '../../../support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getEmbeddingModel, getLLMModel, getVlmModel } from '../../ai/model';
import {
  computedCollectionChunkSettings,
  getLLMMaxChunkSize
} from '@fastgpt/global/core/dataset/training/utils';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';

/**
 * get all collection by top collectionId
 */
export async function findCollectionAndChild({
  teamId,
  datasetId,
  collectionId,
  fields = '_id parentId name metadata'
}: {
  teamId: string;
  datasetId: string;
  collectionId: string;
  fields?: string;
}) {
  async function find(id: string) {
    // find children
    const children = await MongoDatasetCollection.find(
      { teamId, datasetId, parentId: id },
      fields
    ).lean();

    let collections = children;

    for (const child of children) {
      const grandChildrenIds = await find(child._id);
      collections = collections.concat(grandChildrenIds);
    }

    return collections;
  }
  const [collection, childCollections] = await Promise.all([
    MongoDatasetCollection.findById(collectionId, fields).lean(),
    find(collectionId)
  ]);

  if (!collection) {
    return Promise.reject('Collection not found');
  }

  return [collection, ...childCollections];
}

export function getCollectionUpdateTime({ name, time }: { time?: Date; name: string }) {
  if (time) return time;
  if (name.startsWith('手动') || ['manual', 'mark'].includes(name)) return new Date('2999/9/9');
  return new Date();
}
export const reloadConfluencePageCollectionChunks = async ({
  dataset,
  collection,
  tmbId,
  rawText,
  collectionId,
  session
}: {
  dataset: DatasetSchemaType;
  collection: CreateOneCollectionParams;
  tmbId: string;
  rawText: string;
  collectionId: string;
  session: ClientSession;
}): Promise<PushDatasetDataResponse> => {
  const formatCreateCollectionParams = computedCollectionChunkSettings({
    ...collection,
    llmModel: getLLMModel(dataset.agentModel),
    vectorModel: getEmbeddingModel(dataset.vectorModel)
  });

  const trainingType =
    formatCreateCollectionParams.trainingType || DatasetCollectionDataProcessModeEnum.chunk;
  const trainingMode = getTrainingModeByCollection({
    trainingType: trainingType,
    autoIndexes: formatCreateCollectionParams.autoIndexes,
    imageIndex: formatCreateCollectionParams.imageIndex
  });

  if (trainingType === DatasetCollectionDataProcessModeEnum.qa) {
    delete formatCreateCollectionParams.chunkTriggerType;
    delete formatCreateCollectionParams.chunkTriggerMinSize;
    delete formatCreateCollectionParams.dataEnhanceCollectionName;
    delete formatCreateCollectionParams.imageIndex;
    delete formatCreateCollectionParams.autoIndexes;
  }

  // 1. split chunks or create image chunks
  const {
    chunks,
    chunkSize,
    indexSize
  }: {
    chunks: Array<{
      q?: string;
      a?: string; // answer or custom content
      imageId?: string;
      indexes?: string[];
    }>;
    chunkSize?: number;
    indexSize?: number;
  } = await (async () => {
    if (rawText) {
      // Process text chunks
      const chunks = await rawText2Chunks({
        rawText,
        chunkTriggerType: formatCreateCollectionParams.chunkTriggerType,
        chunkTriggerMinSize: formatCreateCollectionParams.chunkTriggerMinSize,
        chunkSize: formatCreateCollectionParams.chunkSize,
        paragraphChunkDeep: formatCreateCollectionParams.paragraphChunkDeep,
        paragraphChunkMinSize: formatCreateCollectionParams.paragraphChunkMinSize,
        maxSize: getLLMMaxChunkSize(getLLMModel(dataset.agentModel)),
        overlapRatio: trainingType === DatasetCollectionDataProcessModeEnum.chunk ? 0.2 : 0,
        customReg: formatCreateCollectionParams.chunkSplitter
          ? [formatCreateCollectionParams.chunkSplitter]
          : [],
        backupParse: false
      });
      return {
        chunks,
        chunkSize: formatCreateCollectionParams.chunkSize,
        indexSize: formatCreateCollectionParams.indexSize
      };
    }

    return {
      chunks: [],
      chunkSize: formatCreateCollectionParams.chunkSize,
      indexSize: formatCreateCollectionParams.indexSize
    };
  })();

  // 4. create training bill
  const traingBillId = await (async () => {
    // if (billId) return billId;
    const { billId: newBillId } = await createTrainingUsage({
      teamId: collection.teamId,
      tmbId,
      appName: collection.name,
      billSource: UsageSourceEnum.training,
      vectorModel: getEmbeddingModel(dataset.vectorModel)?.name,
      agentModel: getLLMModel(dataset.agentModel)?.name,
      vllmModel: getVlmModel(dataset.vlmModel)?.name,
      session
    });
    return newBillId;
  })();

  // 5. insert to training queue
  const insertResults = await pushDataListToTrainingQueue({
    teamId: formatCreateCollectionParams.teamId,
    tmbId,
    datasetId: dataset._id,
    collectionId: collectionId,
    agentModel: dataset.agentModel,
    vectorModel: dataset.vectorModel,
    vlmModel: dataset.vlmModel,
    mode: trainingMode,
    billId: traingBillId,
    data: chunks.map((item, index) => ({
      ...item,
      indexes: item.indexes?.map((text) => ({
        type: DatasetDataIndexTypeEnum.custom,
        text
      })),
      chunkIndex: index
    })),
    session
  });

  // update raw text
  await MongoDatasetCollection.findByIdAndUpdate(
    collectionId,
    {
      ...(collection.name && { name: collection.name }),
      rawTextLength: rawText.length
    },
    { session }
  );

  return {
    insertLen: insertResults.insertLen
  };
};
export const createOrGetCollectionTags = async ({
  tags,
  datasetId,
  teamId,
  session
}: {
  tags?: string[];
  datasetId: string;
  teamId: string;
  session?: ClientSession;
}) => {
  if (!tags) return undefined;

  if (tags.length === 0) return [];

  const existingTags = await MongoDatasetCollectionTags.find(
    {
      teamId,
      datasetId,
      tag: { $in: tags }
    },
    undefined,
    { session }
  ).lean();

  const existingTagContents = existingTags.map((tag) => tag.tag);
  const newTagContents = tags.filter((tag) => !existingTagContents.includes(tag));

  const newTags = await MongoDatasetCollectionTags.insertMany(
    newTagContents.map((tagContent) => ({
      teamId,
      datasetId,
      tag: tagContent
    })),
    { session, ordered: true }
  );

  return [...existingTags.map((tag) => tag._id), ...newTags.map((tag) => tag._id)];
};

export const collectionTagsToTagLabel = async ({
  datasetId,
  tags
}: {
  datasetId: string;
  tags?: string[];
}) => {
  if (!tags) return undefined;
  if (tags.length === 0) return;

  // Get all the tags
  const collectionTags = await MongoDatasetCollectionTags.find({ datasetId }, undefined, {
    ...readFromSecondary
  }).lean();
  const tagsMap = new Map<string, string>();
  collectionTags.forEach((tag) => {
    tagsMap.set(String(tag._id), tag.tag);
  });

  return tags
    .map((tag) => {
      return tagsMap.get(tag) || '';
    })
    .filter(Boolean);
};

export const syncCollection = async (collection: CollectionWithDatasetType) => {
  const dataset = collection.dataset;

  if (!collectionCanSync(collection.type)) {
    return Promise.reject(DatasetErrEnum.notSupportSync);
  }

  // Get new text
  const sourceReadType = await (async () => {
    if (collection.type === DatasetCollectionTypeEnum.link) {
      if (!collection.rawLink) return Promise.reject('rawLink is missing');
      return {
        type: DatasetSourceReadTypeEnum.link,
        sourceId: collection.rawLink,
        selector: collection.metadata?.webPageSelector
      };
    }

    const sourceId = collection.apiFileId;

    if (!sourceId) return Promise.reject('apiFileId is missing');

    return {
      type: DatasetSourceReadTypeEnum.apiFile,
      sourceId,
      apiDatasetServer: dataset.apiDatasetServer
    };
  })();

  const { title, rawText } = await readDatasetSourceRawText({
    teamId: collection.teamId,
    tmbId: collection.tmbId,
    ...sourceReadType
  });

  if (!rawText) {
    return DatasetCollectionSyncResultEnum.failed;
  }

  // Check if the original text is the same: skip if same
  const hashRawText = hashStr(rawText);
  if (collection.hashRawText && hashRawText === collection.hashRawText) {
    return DatasetCollectionSyncResultEnum.sameRaw;
  }

  await mongoSessionRun(async (session) => {
    // Delete old collection
    await delCollection({
      collections: [collection],
      delImg: false,
      delFile: false,
      session
    });

    // Create new collection
    await createCollectionAndInsertData({
      session,
      dataset,
      rawText: rawText,
      createCollectionParams: {
        ...collection,
        name: title || collection.name,
        updateTime: new Date()
      }
    });
  });

  return DatasetCollectionSyncResultEnum.success;
};

/* 
  QA: 独立进程
  Chunk: Image Index -> Auto index -> chunk index
*/
export const getTrainingModeByCollection = ({
  trainingType,
  autoIndexes,
  imageIndex
}: {
  trainingType: DatasetCollectionDataProcessModeEnum;
  autoIndexes?: boolean;
  imageIndex?: boolean;
}) => {
  if (
    trainingType === DatasetCollectionDataProcessModeEnum.imageParse &&
    global.feConfigs?.isPlus
  ) {
    return TrainingModeEnum.imageParse;
  }

  if (trainingType === DatasetCollectionDataProcessModeEnum.qa) {
    return TrainingModeEnum.qa;
  }
  if (
    trainingType === DatasetCollectionDataProcessModeEnum.chunk &&
    imageIndex &&
    global.feConfigs?.isPlus
  ) {
    return TrainingModeEnum.image;
  }
  if (
    trainingType === DatasetCollectionDataProcessModeEnum.chunk &&
    autoIndexes &&
    global.feConfigs?.isPlus
  ) {
    return TrainingModeEnum.auto;
  }
  return TrainingModeEnum.chunk;
};

export const getConfluenceCollection = async ({
  collectionId,
  session
}: {
  collectionId: string;
  session?: ClientSession;
}) => {
  const collection = await MongoDatasetCollection.findById(collectionId, undefined, {
    ...readFromSecondary,
    session
  }).lean();

  if (!collection) throw new Error('Collection not found');

  return collection;
};

export const getConfluenceCollectionsByDatasetId = async (datasetId: string) => {
  const collections = await MongoDatasetCollection.find({
    datasetId
  }).lean();
  // key collection.confluence.pageId, value collection
  const pageCollection: { [key: string]: DatasetCollectionSchemaType } = {};

  collections.forEach((collection) => {
    if (collection.confluence?.pageId) {
      pageCollection[collection.confluence.pageId] = collection;
    }
  });
  return pageCollection;
};
