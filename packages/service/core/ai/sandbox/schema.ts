import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import type { SandboxInstanceSchemaType } from './type';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxProtocolEnum, SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { SandboxLimitSchema, SandboxProviderSchema } from './type';

export const collectionName = 'agent_sandbox_instances';

const SandboxOperationErrorSchema = new Schema(
  {
    code: String,
    message: String
  },
  { _id: false }
);

const SandboxOperationSchema = new Schema(
  {
    id: String,
    type: String,
    checkpoint: String,
    startedAt: Date,
    updatedAt: Date,
    heartbeatAt: Date,
    providerSandboxId: String,
    recoveredAt: Date,
    recoveredFromOperationId: String,
    effectState: { type: String, enum: ['idle', 'pending', 'completed'] },
    failureDisposition: { type: String, enum: ['retryable', 'unknown'] },
    error: SandboxOperationErrorSchema
  },
  { _id: false }
);

const SandboxInstanceSchema = new Schema(
  {
    schemaVersion: {
      type: Number,
      default: 2
    },
    provider: {
      type: String,
      enum: SandboxProviderSchema.options,
      required: true
    },
    // 唯一 id，chat 模式下，由 3 个 id hash 获取。
    sandboxId: {
      type: String,
      required: true
    },
    sourceType: {
      type: String,
      enum: ['appRuntime', 'skillEdit']
    },
    sourceId: String,
    teamId: Schema.Types.ObjectId,
    ownerTmbId: Schema.Types.ObjectId,
    runtimeUserId: String,
    sessionId: String,
    baseVersionId: Schema.Types.ObjectId,
    workspaceGeneration: String,
    currentDeploymentHash: String,
    capacityReserved: Boolean,
    operation: SandboxOperationSchema,
    // Chat 模式和 skill sandbox 都会复用这组根字段。
    appId: String,
    userId: String,
    chatId: String,

    status: {
      type: String,
      enum: Object.values(SandboxStatusEnum),
      default: SandboxStatusEnum.running,
      required: true
    },
    lastActiveAt: {
      type: Date,
      default: () => new Date(),
      required: true
    },
    createdAt: {
      type: Date,
      default: () => new Date(),
      required: true
    },
    archiveAt: {
      type: Date,
      default: null
    },
    deleteTime: {
      type: Date,
      default: null
    },
    limit: {
      type: SandboxLimitSchema.shape
    },
    storage: {
      type: Schema.Types.Mixed
    },
    metadata: {
      type: Schema.Types.Mixed
    }
  },
  { autoIndex: false, autoCreate: false }
);

export const sandboxInstanceIndexDefinitions: {
  key: Record<string, 1>;
  options: {
    name: string;
    unique?: boolean;
    partialFilterExpression?: Record<string, { $exists: true }>;
  };
}[] = [
  {
    key: { provider: 1, appId: 1, userId: 1, chatId: 1 },
    options: {
      name: 'provider_1_appId_1_userId_1_chatId_1',
      unique: true,
      partialFilterExpression: {
        appId: { $exists: true },
        userId: { $exists: true },
        chatId: { $exists: true }
      }
    }
  },
  { key: { status: 1, lastActiveAt: 1 }, options: { name: 'status_1_lastActiveAt_1' } },
  {
    key: { provider: 1, sandboxId: 1 },
    options: { name: 'provider_1_sandboxId_1', unique: true }
  },
  { key: { 'metadata.skillId': 1 }, options: { name: 'metadata.skillId_1' } },
  {
    key: { provider: 1, sourceType: 1, workspaceGeneration: 1 },
    options: { name: 'provider_1_sourceType_1_workspaceGeneration_1' }
  },
  {
    key: { 'metadata.sandboxType': 1, chatId: 1 },
    options: { name: 'metadata.sandboxType_1_chatId_1' }
  },
  {
    key: { provider: 1, sourceType: 1, sourceId: 1, runtimeUserId: 1, sessionId: 1 },
    options: {
      name: 'provider_1_sourceType_1_sourceId_1_runtimeUserId_1_sessionId_1',
      unique: true,
      partialFilterExpression: {
        provider: { $exists: true },
        sourceType: { $exists: true },
        sourceId: { $exists: true },
        runtimeUserId: { $exists: true },
        sessionId: { $exists: true }
      }
    }
  }
];

for (const { key, options } of sandboxInstanceIndexDefinitions) {
  SandboxInstanceSchema.index(key, options);
}

export const MongoSandboxInstance = getMongoModel<SandboxInstanceSchemaType>(
  collectionName,
  SandboxInstanceSchema
);
