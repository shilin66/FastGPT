import { MongoDatasetTraining } from './schema';
import type {
  PushDatasetDataChunkProps,
  PushDatasetDataProps,
  PushDatasetDataResponse
} from '@fastgpt/global/core/dataset/api.d';
import {
  DatasetCollectionTypeEnum,
  DatasetStatusEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { simpleText } from '@fastgpt/global/common/string/tools';
import { ClientSession } from '../../../common/mongo';
import { getLLMModel, getEmbeddingModel } from '../../ai/model';
import { addLog } from '../../../common/system/log';
import { getCollectionWithDataset } from '../controller';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoTeamMember } from '../../../support/user/team/teamMemberSchema';
import { TeamMemberWithTeamAndUserSchema } from '@fastgpt/global/support/user/team/type';
import ConfluenceClient, { Page } from '../../../common/confluence/client';
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

export const pushDataListToTrainingQueueByCollectionId = async ({
  collectionId,
  ...props
}: {
  teamId: string;
  tmbId: string;
  session?: ClientSession;
} & PushDatasetDataProps) => {
  const {
    dataset: { _id: datasetId, agentModel, vectorModel }
  } = await getCollectionWithDataset(collectionId);
  return pushDataListToTrainingQueue({
    ...props,
    datasetId,
    collectionId,
    agentModel,
    vectorModel
  });
};

export async function pushDataListToTrainingQueue({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  agentModel,
  vectorModel,
  data,
  prompt,
  billId,
  trainingMode = TrainingModeEnum.chunk,
  session
}: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  agentModel: string;
  vectorModel: string;
  session?: ClientSession;
} & PushDatasetDataProps): Promise<PushDatasetDataResponse> {
  const { model, maxToken, weight } = await (async () => {
    const agentModelData = getLLMModel(agentModel);
    if (!agentModelData) {
      return Promise.reject(`File model ${agentModel} is inValid`);
    }
    const vectorModelData = getEmbeddingModel(vectorModel);
    if (!vectorModelData) {
      return Promise.reject(`Vector model ${vectorModel} is inValid`);
    }

    if (trainingMode === TrainingModeEnum.chunk) {
      return {
        maxToken: vectorModelData.maxToken * 1.5,
        model: vectorModelData.model,
        weight: vectorModelData.weight
      };
    }

    // if (trainingMode === TrainingModeEnum.qa || trainingMode === TrainingModeEnum.auto) {
    if (trainingMode === TrainingModeEnum.qa) {
      return {
        maxToken: agentModelData.maxContext * 0.8,
        model: agentModelData.model,
        weight: 0
      };
    }

    return Promise.reject(`Training mode "${trainingMode}" is inValid`);
  })();

  // filter repeat or equal content
  const set = new Set();
  const filterResult: Record<string, PushDatasetDataChunkProps[]> = {
    success: [],
    overToken: [],
    repeat: [],
    error: []
  };

  // format q and a, remove empty char
  data.forEach((item) => {
    item.q = simpleText(item.q);
    item.a = simpleText(item.a);

    item.indexes = item.indexes
      ?.map((index) => {
        return {
          ...index,
          text: simpleText(index.text)
        };
      })
      .filter(Boolean);

    // filter repeat content
    if (!item.q) {
      filterResult.error.push(item);
      return;
    }

    const text = item.q + item.a;

    if (text.length > maxToken) {
      filterResult.overToken.push(item);
      return;
    }

    if (set.has(text)) {
      console.log('repeat', item);
      filterResult.repeat.push(item);
    } else {
      filterResult.success.push(item);
      set.add(text);
    }
  });

  // insert data to db
  const insertLen = filterResult.success.length;
  const failedDocuments: PushDatasetDataChunkProps[] = [];

  // 使用 insertMany 批量插入
  const batchSize = 200;
  const insertData = async (startIndex: number, session: ClientSession) => {
    const list = filterResult.success.slice(startIndex, startIndex + batchSize);

    if (list.length === 0) return;

    try {
      await MongoDatasetTraining.insertMany(
        list.map((item) => ({
          teamId,
          tmbId,
          datasetId,
          collectionId,
          billId,
          mode: trainingMode,
          prompt,
          model,
          q: item.q,
          a: item.a,
          chunkIndex: item.chunkIndex ?? 0,
          weight: weight ?? 0,
          indexes: item.indexes,
          retryCount: 5
        })),
        {
          session,
          ordered: true
        }
      );
    } catch (error: any) {
      addLog.error(`Insert error`, error);
      // 如果有错误，将失败的文档添加到失败列表中
      error.writeErrors?.forEach((writeError: any) => {
        failedDocuments.push(data[writeError.index]);
      });
      console.log('failed', failedDocuments);
    }

    // 对于失败的文档，尝试单独插入
    await MongoDatasetTraining.create(failedDocuments, { session });

    return insertData(startIndex + batchSize, session);
  };

  if (session) {
    await insertData(0, session);
  } else {
    await mongoSessionRun(async (session) => {
      await insertData(0, session);
    });
  }

  delete filterResult.success;

  return {
    insertLen,
    ...filterResult
  };
}

export const trainConfluenceCollection = async ({
  dataset,
  teamId
}: {
  dataset: DatasetSchemaType;
  teamId: string;
}) => {
  const tmb = (await MongoTeamMember.findById(dataset.tmbId)
    .populate('user')
    .lean()) as TeamMemberWithTeamAndUserSchema;
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

          // 创建或更新集合
          const createOrUpdateCollection = async () => {
            const col = pageConfluence[page.id];
            if (
              !col ||
              page.version.number !== col.confluence?.pageVersion ||
              dataset.confluenceConfig?.mode !== col.trainingType ||
              dataset.confluenceConfig?.chunkSize !== col.chunkSize ||
              dataset.confluenceConfig?.chunkSplitter !== col.chunkSplitter ||
              dataset.confluenceConfig?.qaPrompt !== col.qaPrompt
            ) {
              return {
                collection: await createOneCollection({
                  datasetId,
                  name: page.title,
                  teamId,
                  tmbId,
                  type: DatasetCollectionTypeEnum.link,
                  trainingType: dataset.confluenceConfig?.mode || TrainingModeEnum.chunk,
                  chunkSize: dataset.confluenceConfig?.chunkSize || 500,
                  chunkSplitter: dataset.confluenceConfig?.chunkSplitter || '',
                  qaPrompt: dataset.confluenceConfig?.qaPrompt || Prompt_AgentQA.description,
                  rawLink: pageLink,
                  confluence: {
                    pageId: page.id,
                    spaceId,
                    parentPageId: page.parentId,
                    pageVersion: page.version.number
                  },
                  metadata: {
                    relatedImgId: `${datasetId}-${page.id}`
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
                    relatedId: `${datasetId}-${page.id}`,
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
            collection: {
              ...collection.toObject(),
              dataset: dataset
            },
            tmbId,
            rawText: markdown.result,
            title: page.title,
            session // 同样使用同一个 session
          });

          if (option === 'update') {
            // delete old collection
            await delCollection({
              collections: [pageConfluence[page.id]],
              delRelatedSource: true,
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
        delRelatedSource: true,
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
