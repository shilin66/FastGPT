import { connectionMongo, getMongoModel } from '../../../common/mongo';
import { agentSkillsCollectionName } from '@fastgpt/global/core/agentSkills/constants';

const { Schema } = connectionMongo;

export const AgentSkillMigrationCheckpointCollectionName = 'agent_skill_migration_checkpoints';

export type AgentSkillMigrationCheckpointSchemaType = {
  _id: string;
  migrationKey: string;
  resourceId: string;
  status: 'completed' | 'conflict' | 'rolled-back';
  reason?: string;
  versionId?: string;
  chatSource?: {
    teamId: string;
    skillId: string;
    chatId: string;
    chatItemIds: string[];
    responseIds: string[];
  };
  attemptCount: number;
  createdAt: Date;
  updatedAt: Date;
};

const AgentSkillMigrationCheckpointSchema = new Schema({
  migrationKey: { type: String, required: true },
  resourceId: {
    type: Schema.Types.ObjectId,
    ref: agentSkillsCollectionName,
    required: true
  },
  status: {
    type: String,
    enum: ['completed', 'conflict', 'rolled-back'],
    required: true
  },
  reason: String,
  versionId: Schema.Types.ObjectId,
  chatSource: {
    type: new Schema(
      {
        teamId: { type: Schema.Types.ObjectId, required: true },
        skillId: { type: Schema.Types.ObjectId, required: true },
        chatId: { type: String, required: true },
        chatItemIds: { type: [Schema.Types.ObjectId], required: true },
        responseIds: { type: [Schema.Types.ObjectId], required: true }
      },
      { _id: false }
    ),
    required: false
  },
  attemptCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() }
});

AgentSkillMigrationCheckpointSchema.index({ migrationKey: 1, resourceId: 1 }, { unique: true });
AgentSkillMigrationCheckpointSchema.index({ migrationKey: 1, status: 1, updatedAt: -1 });

export const MongoAgentSkillMigrationCheckpoint =
  getMongoModel<AgentSkillMigrationCheckpointSchemaType>(
    AgentSkillMigrationCheckpointCollectionName,
    AgentSkillMigrationCheckpointSchema
  );
