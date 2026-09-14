/**
 * Skill Version Schema
 *
 * Defines the database schema for skill versions.
 */

import { connectionMongo, getMongoModel } from '../../../common/mongo';
import {
  agentSkillsCollectionName,
  agentSkillsVersionCollectionName,
  AgentSkillSchemaVersion
} from '@fastgpt/global/core/agentSkills/constants';
import type { AgentSkillsVersionSchemaType } from '@fastgpt/global/core/agentSkills/type';

const { Schema } = connectionMongo;

const AgentSkillsVersionSchema = new Schema({
  schemaVersion: {
    type: Number,
    default: AgentSkillSchemaVersion
  },
  skillId: {
    type: Schema.Types.ObjectId,
    ref: agentSkillsCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: 'team_members',
    required: true
  },
  version: {
    type: Number,
    required: true
  },
  versionName: {
    type: String,
    default: ''
  },
  // Storage information
  storage: {
    bucket: {
      type: String,
      required: true
    },
    key: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    checksum: {
      type: String
    }
  },
  storageKey: String,
  runtimeSkills: {
    type: [
      {
        _id: false,
        name: { type: String, required: true },
        description: { type: String, default: '' },
        path: { type: String, required: true }
      }
    ],
    default: []
  },
  contentHash: String,
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'team_members'
  },
  // Import source (optional)
  importSource: {
    originalFilename: String,
    importedAt: Date
  },
  isActive: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deleteTime: {
    type: Date,
    default: null
  },
  storageDeletedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: () => new Date()
  }
});

// Create indexes
try {
  // Index for listing versions of a skill
  AgentSkillsVersionSchema.index({ skillId: 1, isDeleted: 1, version: -1 });

  // Index for finding active version
  AgentSkillsVersionSchema.index({ skillId: 1, isActive: 1 });

  // Unique index to prevent duplicate versions
  AgentSkillsVersionSchema.index({ skillId: 1, version: 1 }, { unique: true });
} catch (error) {
  console.log('SkillVersion index error:', error);
}

export const MongoAgentSkillsVersion = getMongoModel<AgentSkillsVersionSchemaType>(
  agentSkillsVersionCollectionName,
  AgentSkillsVersionSchema
);
