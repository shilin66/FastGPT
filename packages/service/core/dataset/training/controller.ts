import { MongoDatasetTraining } from './schema';
import type {
  PushDatasetDataChunkProps,
  PushDatasetDataResponse
} from '@fastgpt/global/core/dataset/api.d';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum,
  DatasetStatusEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { getNanoid, simpleText } from '@fastgpt/global/common/string/tools';
import { type ClientSession } from '../../../common/mongo';
import { getLLMModel, getEmbeddingModel, getVlmModel } from '../../ai/model';
import { addLog } from '../../../common/system/log';
import { getCollectionWithDataset } from '../controller';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { type PushDataToTrainingQueueProps } from '@fastgpt/global/core/dataset/training/type';
import { i18nT } from '../../../../web/i18n/utils';
import { getLLMMaxChunkSize } from '../../../../global/core/dataset/training/utils';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoTeamMember } from '../../../support/user/team/teamMemberSchema';
import type { TeamMemberWithTeamAndUserSchema } from '@fastgpt/global/support/user/team/type';
import type { Page } from '../../../common/confluence/client';
import ConfluenceClient from '../../../common/confluence/client';
import {
  getAllAttachmentsByPageId,
  getAllPagesByPageId,
  getSpaceAllPagesRecursive
} from '../../../common/confluence/utils';
import {
  getConfluenceCollectionsByDatasetId,
  reloadConfluencePageCollectionChunks
} from '../collection/utils';
import { delay } from '@fastgpt/global/common/system/utils';
import { createOneCollection, delCollection } from '../collection/controller';
import { MongoDataset } from '../schema';
import pLimit from 'p-limit';
import { Converter } from '../../../common/confluence/adf2md';
import { uploadMongoImg } from '../../../common/file/image/controller';
import adf2md = Converter.adf2md;
import parseADF = Converter.parseADF;
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';

export const lockTrainingDataByTeamId = async (teamId: string): Promise<any> => {
  try {
    await MongoDatasetTraining.updateMany(
      {
        teamId
      },
      {
        lockTime: new Date('2999/5/5')
      }
    );
  } catch (error) {}
};

export async function pushDataListToTrainingQueue({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  agentModel,
  vectorModel,
  vlmModel,
  data,
  billId,
  mode = TrainingModeEnum.chunk,
  indexSize,
  session
}: PushDataToTrainingQueueProps): Promise<PushDatasetDataResponse> {
  const vectorModelData = getEmbeddingModel(vectorModel);
  if (!vectorModelData) {
    return Promise.reject(i18nT('common:error_embedding_not_config'));
  }
  const agentModelData = getLLMModel(agentModel);
  if (!agentModelData) {
    return Promise.reject(i18nT('common:error_llm_not_config'));
  }

  const { model, maxToken, weight } = await (async () => {
    if (mode === TrainingModeEnum.chunk) {
      return {
        maxToken: getLLMMaxChunkSize(agentModelData),
        model: vectorModelData.model,
        weight: vectorModelData.weight
      };
    }
    if (mode === TrainingModeEnum.qa || mode === TrainingModeEnum.auto) {
      return {
        maxToken: getLLMMaxChunkSize(agentModelData),
        model: agentModelData.model,
        weight: 0
      };
    }
    if (mode === TrainingModeEnum.image || mode === TrainingModeEnum.imageParse) {
      const vllmModelData = getVlmModel(vlmModel);
      if (!vllmModelData) {
        return Promise.reject(i18nT('common:error_vlm_not_config'));
      }
      return {
        maxToken: getLLMMaxChunkSize(vllmModelData),
        model: vllmModelData.model,
        weight: 0
      };
    }

    return Promise.reject(`Training mode "${mode}" is inValid`);
  })();

  // format q and a, remove empty char
  data = data.filter((item) => {
    const q = item.q || '';
    const a = item.a || '';

    // filter repeat content
    if (!item.imageId && !q) {
      return;
    }

    const text = q + a;

    // Oversize llm tokens
    if (text.length > maxToken) {
      return;
    }

    return true;
  });

  // insert data to db
  const insertLen = data.length;

  // 使用 insertMany 批量插入
  const batchSize = 500;
  const insertData = async (startIndex: number, session: ClientSession) => {
    const list = data.slice(startIndex, startIndex + batchSize);

    if (list.length === 0) return;

    try {
      const result = await MongoDatasetTraining.insertMany(
        list.map((item) => ({
          teamId,
          tmbId,
          datasetId: datasetId,
          collectionId: collectionId,
          billId,
          mode,
          ...(item.q && { q: item.q }),
          ...(item.a && { a: item.a }),
          ...(item.imageId && { imageId: item.imageId }),
          chunkIndex: item.chunkIndex ?? 0,
          indexSize,
          weight: weight ?? 0,
          indexes: item.indexes,
          retryCount: 5
        })),
        {
          session,
          ordered: false,
          rawResult: true,
          includeResultMetadata: false // 进一步减少返回数据
        }
      );

      if (result.insertedCount !== list.length) {
        return Promise.reject(`Insert data error, ${JSON.stringify(result)}`);
      }
    } catch (error: any) {
      addLog.error(`Insert error`, error);
      return Promise.reject(error);
    }

    return insertData(startIndex + batchSize, session);
  };

  if (session) {
    await insertData(0, session);
  } else {
    await mongoSessionRun(async (session) => {
      await insertData(0, session);
    });
  }

  return {
    insertLen
  };
}

export const pushDatasetToParseQueue = async ({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  billId,
  session
}: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  billId: string;
  session: ClientSession;
}) => {
  await MongoDatasetTraining.create(
    [
      {
        teamId,
        tmbId,
        datasetId,
        collectionId,
        billId,
        mode: TrainingModeEnum.parse
      }
    ],
    { session, ordered: true }
  );
};

export const trainConfluenceCollection = async ({
  dataset,
  teamId
}: {
  dataset: DatasetSchemaType;
  teamId: string;
}) => {
  const tmb = (await MongoTeamMember.findById(dataset.tmbId)
    .populate('user')
    .lean()) as unknown as TeamMemberWithTeamAndUserSchema;
  if (!tmb) {
    throw new Error("The dataset's owner is not found");
  }

  if (
    !tmb.user.confluenceAccount ||
    !(tmb.user.confluenceAccount.account && tmb.user.confluenceAccount.apiToken)
  ) {
    throw new Error("The dataset's owner has not configured Confluence API token");
  }

  if (!dataset.confluenceConfig) {
    throw new Error('The dataset has not configured Confluence config');
  }

  const { spaceKey, pageId, syncSubPages } = dataset.confluenceConfig;

  const baseURL = global.feConfigs.confluenceUrl;
  if (!baseURL) {
    throw new Error('The Confluence base URL is not configured');
  }
  const confluenceClient = new ConfluenceClient(
    baseURL,
    tmb.user.confluenceAccount.account,
    tmb.user.confluenceAccount.apiToken
  );

  const spaces = await confluenceClient.getSpacesByKeys(spaceKey);
  if (spaces.results.length === 0) return Promise.reject(`Space ${spaceKey} not found`);
  const spaceId = spaces.results[0].id;

  let pages: Page[] = [];

  if (!pageId) {
    pages = await getSpaceAllPagesRecursive(confluenceClient, spaceId);
  } else {
    pages = await getAllPagesByPageId(confluenceClient, pageId, syncSubPages);
  }
  if (pages.length === 0) {
    throw new Error('No pages found in the specified space or page');
  }
  const datasetId = dataset._id;
  const pageConfluence = await getConfluenceCollectionsByDatasetId(datasetId);

  // 限制并发数，最多20个page同时处理
  const limit = pLimit(20);
  const tmbId = dataset.tmbId;

  await MongoDataset.findByIdAndUpdate(datasetId, {
    $set: {
      status: DatasetStatusEnum.syncing
    }
  });

  const taskPromises = pages.map((page) =>
    limit(() =>
      mongoSessionRun(async (session) => {
        try {
          // Random delay 0 ~ 5s
          await delay(Math.floor(Math.random() * 5 * 1000));
          const pageLink = baseURL + page._links.webui;
          const adf = page.body.atlas_doc_format;
          const markdown = adf2md(parseADF(adf.value));

          const imgId = getNanoid(16);
          // 创建或更新集合
          const createOrUpdateCollection = async () => {
            const col = pageConfluence[page.id];
            if (
              !col ||
              page.version.number !== col.confluence?.pageVersion ||
              dataset.chunkSettings?.autoIndexes !== col.autoIndexes ||
              dataset.chunkSettings?.imageIndex !== col.imageIndex ||
              dataset.chunkSettings?.trainingType !== col.trainingType ||
              dataset.chunkSettings?.chunkSize !== col.chunkSize ||
              dataset.chunkSettings?.chunkSplitter !== col.chunkSplitter ||
              dataset.chunkSettings?.qaPrompt !== col.qaPrompt
            ) {
              return {
                collection: await createOneCollection({
                  datasetId,
                  name: page.title,
                  teamId,
                  tmbId,
                  type: DatasetCollectionTypeEnum.link,
                  trainingType:
                    dataset.chunkSettings?.trainingType ||
                    DatasetCollectionDataProcessModeEnum.chunk,
                  imageIndex: dataset.chunkSettings?.imageIndex || false,
                  autoIndexes: dataset.chunkSettings?.autoIndexes || false,
                  chunkSize: dataset.chunkSettings?.chunkSize || 500,
                  indexSize: dataset.chunkSettings?.indexSize || 512,
                  chunkSplitter: dataset.chunkSettings?.chunkSplitter || '',
                  qaPrompt: dataset.chunkSettings?.qaPrompt || Prompt_AgentQA.description,
                  rawLink: pageLink,
                  confluence: {
                    pageId: page.id,
                    spaceId,
                    parentPageId: page.parentId,
                    pageVersion: page.version.number
                  },
                  metadata: {
                    relatedImgId: `${datasetId}-${page.id}-${imgId}`
                  },
                  session // 确保所有操作都在同一个 session 中
                }),
                option: !col ? 'create' : 'update'
              };
            }
            return { collection: col };
          };

          const { collection, option } = await createOrUpdateCollection();
          if (!collection || !option) {
            return;
          }
          console.log(`${option} confluence page: ${page.title}`);

          const attachments = await getAllAttachmentsByPageId(confluenceClient, page.id);
          for (const attachment of attachments) {
            // "image/...",
            if (markdown.result.includes(attachment.fileId)) {
              if (attachment.mediaType.startsWith('image')) {
                const imgBase64 = await confluenceClient.downloadAttachmentToBase64(
                  attachment.downloadLink,
                  attachment.mediaType
                );
                const mime = imgBase64.split(';')[0].split(':')[1];
                const src = await uploadMongoImg({
                  // type: MongoImageTypeEnum.collectionImage,
                  base64Img: imgBase64,
                  teamId,
                  metadata: {
                    relatedId: `${datasetId}-${page.id}-${imgId}`,
                    mime: mime
                  }
                });
                markdown.result = markdown.result.replaceAll(attachment.fileId, src);
              } else {
                const webUI = global.feConfigs.confluenceUrl + attachment.webuiLink;
                markdown.result = markdown.result.replaceAll(
                  `![](${attachment.fileId})`,
                  `[${attachment.title}](${webUI})`
                );
              }
            }
          }

          // 3. 加载页面数据
          await reloadConfluencePageCollectionChunks({
            dataset,
            collection: {
              teamId: collection.teamId,
              tmbId: collection.tmbId,
              name: page.title || collection.name,
              datasetId: collection.datasetId,
              parentId: collection.parentId,
              type: collection.type,

              trainingType: collection.trainingType,
              chunkSize: collection.chunkSize,
              chunkSplitter: collection.chunkSplitter,
              qaPrompt: collection.qaPrompt,

              fileId: collection.fileId,
              rawLink: collection.rawLink,
              externalFileId: collection.externalFileId,
              externalFileUrl: collection.externalFileUrl,
              apiFileId: collection.apiFileId,

              rawTextLength: markdown.result.length,

              metadata: collection.metadata,

              tags: collection.tags,
              createTime: collection.createTime,
              updateTime: new Date()
            },
            tmbId,
            collectionId: collection._id,
            rawText: markdown.result,
            session // 同样使用同一个 session
          });

          if (option === 'update') {
            // delete old collection
            await delCollection({
              collections: [pageConfluence[page.id]],
              delImg: true,
              delFile: true,
              session
            });
          }
        } catch (e) {
          console.error(`Error processing page ${page.title}:`, e);
        }
      })
    )
  );

  // 等待所有任务完成
  const results = await Promise.allSettled(taskPromises);

  console.log(`sync finished, total pages count: ${pages.length}`);

  // 处理结果
  results.forEach((result, index) => {
    const pageTitle = pages[index].title;
    if (result.status === 'fulfilled') {
      console.log(`Page "${pageTitle}" processed.`);
    } else if (result.status === 'rejected') {
      console.error(`Page "${pageTitle}" failed:`, result.reason);
    }
  });
  // 找出在 Confluence 中删除但在数据库中仍然存在的集合
  const pageIds = pages.map((page) => page.id);
  const collectionsToDelete = Object.keys(pageConfluence).filter(
    (collectionId) => !pageIds.includes(collectionId)
  );

  if (collectionsToDelete.length > 0) {
    console.log(
      `Deleting collections that no longer exist in Confluence: ${collectionsToDelete.join(', ')}`
    );
    await mongoSessionRun((session) =>
      delCollection({
        collections: collectionsToDelete.map((id) => pageConfluence[id]),
        delImg: true,
        delFile: true,
        session
      })
    );
  }
  // 更新数据集状态
  await MongoDataset.findByIdAndUpdate(datasetId, {
    $set: {
      status: DatasetStatusEnum.active
    }
  });
};
