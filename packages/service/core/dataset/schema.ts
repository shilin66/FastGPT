import { getMongoModel, Schema } from '../../common/mongo';
import {
  ChunkSettingModeEnum,
  ChunkTriggerConfigTypeEnum,
  DataChunkSplitModeEnum,
  DatasetCollectionDataProcessModeEnum,
  DatasetStatusEnum,
  DatasetStatusMap,
  DatasetTypeEnum,
  DatasetTypeMap,
  ParagraphChunkAIModeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type.d';

export const DatasetCollectionName = 'datasets';

export const ChunkSettings = {
  trainingType: {
    type: String,
    enum: Object.values(DatasetCollectionDataProcessModeEnum)
  },

  chunkTriggerType: {
    type: String,
    enum: Object.values(ChunkTriggerConfigTypeEnum)
  },
  chunkTriggerMinSize: Number,

  dataEnhanceCollectionName: Boolean,

  imageIndex: Boolean,
  autoIndexes: Boolean,

  chunkSettingMode: {
    type: String,
    enum: Object.values(ChunkSettingModeEnum)
  },
  chunkSplitMode: {
    type: String,
    enum: Object.values(DataChunkSplitModeEnum)
  },
  paragraphChunkAIMode: {
    type: String,
    enum: Object.values(ParagraphChunkAIModeEnum)
  },
  paragraphChunkDeep: Number,
  paragraphChunkMinSize: Number,
  chunkSize: Number,
  chunkSplitter: String,

  indexSize: Number,
  qaPrompt: String
};

const DatasetSchema = new Schema({
  parentId: {
    type: Schema.Types.ObjectId,
    ref: DatasetCollectionName,
    default: null
  },
  userId: {
    //abandon
    type: Schema.Types.ObjectId,
    ref: 'user'
  },
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  type: {
    type: String,
    enum: Object.keys(DatasetTypeMap),
    required: true,
    default: DatasetTypeEnum.dataset
  },
  avatar: {
    type: String,
    default: '/icon/logo.svg'
  },
  name: {
    type: String,
    required: true
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  vectorModel: {
    type: String,
    required: true,
    default: 'text-embedding-3-small'
  },
  agentModel: {
    type: String,
    required: true,
    default: 'gpt-4o-mini'
  },
  vlmModel: String,
  intro: {
    type: String,
    default: ''
  },
  websiteConfig: {
    type: {
      url: {
        type: String,
        required: true
      },
      selector: {
        type: String,
        default: 'body'
      }
    }
  },
  chunkSettings: {
    type: ChunkSettings
  },
  confluenceConfig: {
    type: {
      spaceKey: {
        type: String
      },
      pageId: {
        type: String
      },
      syncSubPages: {
        type: Boolean,
        default: false
      },
      syncSchedule: {
        type: Boolean,
        default: false
      },

      // abandon
      mode: {
        type: String,
        enum: DatasetCollectionDataProcessModeEnum
      },
      way: {
        type: String,
        enum: Object.values(ChunkSettingModeEnum)
      },
      chunkSize: {
        type: Number,
        required: true
      },
      chunkSplitter: {
        type: String
      },
      qaPrompt: {
        type: String
      }
    }
  },
  inheritPermission: {
    type: Boolean,
    default: true
  },
  apiServer: Object,
  feishuServer: Object,
  yuqueServer: Object,

  // abandoned
  status: {
    type: String,
    enum: Object.keys(DatasetStatusMap),
    default: DatasetStatusEnum.active
  },
  autoSync: Boolean,
  externalReadUrl: String,
  defaultPermission: Number
});

try {
  DatasetSchema.index({ teamId: 1 });
  DatasetSchema.index({ type: 1 });
} catch (error) {
  console.log(error);
}

export const MongoDataset = getMongoModel<DatasetSchemaType>(DatasetCollectionName, DatasetSchema);
