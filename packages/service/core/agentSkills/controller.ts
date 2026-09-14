import { MongoAgentSkills } from './schema';
import { MongoAgentSkillsVersion } from './version/schema';
import {
  AgentSkillCreationStatusEnum,
  AgentSkillSourceEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/agentSkills/constants';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/agentSkills/type';
import { Types, type ClientSession } from '../../common/mongo';
import { finalizeStagedSkillPackage, stageSkillPackage } from './storage';
import { createVersion } from './version/controller';
import { setCurrentVersion } from './version/current';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { getLogger, LogCategories } from '../../common/logger';
import { randomUUID } from 'node:crypto';
import type { AgentSkillDeleteJobData } from './delete/type';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '../../support/permission/schema';
import type { ValidatedSkillPackage } from './packageValidator';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.CREATION);

// Types for service operations
type CreateSkillData = {
  skillId?: string;
  parentId?: string | null;
  name: string;
  description: string;
  author: string;
  category: string[];
  config: Record<string, any>;
  avatar?: string;
  teamId: string;
  tmbId: string;
  creationStatus?: AgentSkillCreationStatusEnum;
  lastOperationId?: string;
};

// UpdateSkillData excludes markdown to ensure consistency with version management
// markdown updates must go through version workflow to keep package.zip in sync
type UpdateSkillData = Partial<
  Pick<CreateSkillData, 'name' | 'description' | 'category' | 'config' | 'avatar'>
>;

// ==================== CRUD Operations ====================

/**
 * Create a new skill
 */
export async function createSkill(data: CreateSkillData, session?: ClientSession): Promise<string> {
  const skill = new MongoAgentSkills({
    ...(data.skillId && { _id: data.skillId }),
    ...data,
    parentId: data.parentId || null,
    type: AgentSkillTypeEnum.skill,
    source: AgentSkillSourceEnum.personal,
    currentVersion: 0,
    versionCount: 0,
    creationStatus: data.creationStatus ?? AgentSkillCreationStatusEnum.ready,
    updateTime: new Date()
  });
  await skill.save({ session });
  return skill._id.toString();
}

/**
 * Update an existing skill
 *
 * Note: This function does NOT update markdown field.
 * To update skill content (markdown), use version management workflow:
 * - Create a new version with updated markdown
 * - Generate and upload new package.zip
 * - Update currentVersion and currentStorage accordingly
 */
export async function updateSkill(
  skillId: string,
  data: UpdateSkillData,
  session?: ClientSession
): Promise<void> {
  const updateData = {
    ...data,
    updateTime: new Date()
  };

  await MongoAgentSkills.updateOne(
    { _id: skillId, deleteTime: null },
    { $set: updateData },
    { session }
  );
}

/**
 * Update currentStorage for a skill
 */
export async function updateCurrentStorage(
  skillId: string,
  storageInfo: {
    bucket: string;
    key: string;
    size: number;
  },
  session?: ClientSession
): Promise<void> {
  await MongoAgentSkills.updateOne(
    { _id: skillId, deleteTime: null },
    { $set: { currentStorage: storageInfo, updateTime: new Date() } },
    { session }
  );
}

/**
 * Soft delete a skill or folder (only personal skills can be deleted)
 * If it's a folder, recursively deletes all children
 */
export async function deleteSkill(
  { skillId: inputSkillId, teamId: inputTeamId }: { skillId: string; teamId: string },
  session?: ClientSession
): Promise<AgentSkillDeleteJobData> {
  const skillId = inputSkillId.toLowerCase();
  const teamId = inputTeamId.toLowerCase();
  if (!session) return mongoSessionRun((session) => deleteSkill({ skillId, teamId }, session));
  const skill = await MongoAgentSkills.findOne({ _id: skillId, teamId }, undefined, {
    session
  }).lean();
  if (!skill) throw new Error('Skill not found');
  if (skill.deleteTime) {
    if (!skill.deletionOperation) throw new Error('skill_deletion_legacy_conflict');
    return {
      kind: 'delete',
      teamId,
      skillId: String(skill.deletionOperation.rootId),
      deleteTime: skill.deleteTime.toISOString(),
      operationId: skill.deletionOperation.id
    };
  }

  const members = [skill];
  const seen = new Set([skillId]);
  for (let index = 0; index < members.length; index++) {
    const parent = members[index];
    if (parent.source === AgentSkillSourceEnum.system)
      throw new Error('Cannot delete system skill');
    if (parent.type !== AgentSkillTypeEnum.folder) continue;
    const children = await MongoAgentSkills.find({ parentId: parent._id }, undefined, { session })
      .limit(1001)
      .lean();
    for (const child of children) {
      if (String(child.teamId) !== teamId || child.deleteTime || seen.has(String(child._id))) {
        throw new Error('skill_deletion_tree_conflict');
      }
      seen.add(String(child._id));
      members.push(child);
      if (members.length > 1000) throw new Error('skill_deletion_tree_too_large');
    }
  }

  const operationId = randomUUID();
  const memberIds = members.map((member) => member._id);
  const now = new Date();
  const marked = await MongoAgentSkills.updateMany(
    { _id: { $in: memberIds }, teamId, deleteTime: null },
    {
      $set: {
        deleteTime: now,
        creationStatus: AgentSkillCreationStatusEnum.deleting,
        deletionOperation: {
          id: operationId,
          rootId: skillId,
          memberIds,
          checkpoint: 'marked',
          updatedAt: now
        }
      }
    },
    { session }
  );
  if (marked.matchedCount !== members.length) throw new Error('skill_deletion_tree_conflict');
  await MongoAgentSkillsVersion.updateMany(
    { skillId: { $in: memberIds }, isDeleted: false },
    { $set: { isDeleted: true, deleteTime: now } },
    { session }
  );
  return { kind: 'delete', teamId, skillId, operationId, deleteTime: now.toISOString() };
}

/**
 * Get skill by ID
 */
export async function getSkillById(skillId: string): Promise<AgentSkillSchemaType | null> {
  const skill = await MongoAgentSkills.findOne({
    _id: skillId,
    deleteTime: null
  }).lean();

  return skill as AgentSkillSchemaType | null;
}

// ==================== Import/Export ====================

/**
 * Import skill from package with full workflow (transaction)
 * This function expects to be called inside mongoSessionRun
 */
export async function importSkill({
  name,
  description,
  avatar,
  teamId,
  tmbId,
  userId,
  parentId,
  originalFilename,
  validatedPackage
}: {
  name: string;
  description: string;
  avatar?: string;
  teamId: string;
  tmbId: string;
  userId: string;
  parentId?: string | null;
  originalFilename: string;
  validatedPackage: ValidatedSkillPackage;
}): Promise<string> {
  const nameExists = await checkSkillNameExists(name, teamId, parentId || null);
  if (nameExists) {
    throw SkillErrEnum.skillNameExists;
  }

  const skillId = new Types.ObjectId().toHexString();
  const versionId = new Types.ObjectId().toHexString();
  const storageInfo = await stageSkillPackage({
    teamId,
    skillId,
    versionId,
    zipBuffer: validatedPackage.zipBuffer,
    checksum: validatedPackage.contentHash
  });

  return mongoSessionRun(async (session) => {
    const newSkill = new MongoAgentSkills({
      _id: skillId,
      parentId: parentId || null,
      type: AgentSkillTypeEnum.skill,
      source: AgentSkillSourceEnum.personal,
      name,
      description,
      author: userId,
      category: [],
      config: {},
      avatar,
      teamId,
      tmbId,
      currentVersion: 0,
      versionCount: 0,
      createTime: new Date(),
      updateTime: new Date()
    });
    await newSkill.save({ session });

    await createVersion(
      {
        versionId,
        skillId,
        tmbId,
        version: 0,
        versionName: 'Initial import',
        storage: storageInfo,
        runtimeSkills: validatedPackage.runtimeSkills,
        contentHash: validatedPackage.contentHash,
        importSource: {
          originalFilename,
          importedAt: new Date()
        }
      },
      session
    );
    await setCurrentVersion({
      skillId,
      versionId,
      expectedCurrentVersionId: null,
      session
    });
    await MongoResourcePermission.insertOne(
      {
        teamId,
        tmbId,
        resourceId: skillId,
        permission: OwnerRoleVal,
        resourceType: PerResourceTypeEnum.agentSkill
      },
      { session }
    );
    await finalizeStagedSkillPackage(storageInfo, session);

    return skillId;
  });
}

// ==================== Permission Checks ====================

/**
 * Check if user can modify/delete a skill
 */
export async function canModifySkill(skillId: string, tmbId: string): Promise<boolean> {
  const skill = await MongoAgentSkills.findOne({
    _id: skillId,
    deleteTime: null
  });

  if (!skill) {
    return false;
  }

  // System skills cannot be modified
  if (skill.source === AgentSkillSourceEnum.system) {
    return false;
  }

  // Only the creator can modify
  return skill.tmbId?.toString() === tmbId;
}

/**
 * Check if skill/folder name already exists in the same parent folder
 */
export async function checkSkillNameExists(
  name: string,
  teamId: string,
  parentId: string | null,
  excludeId?: string
): Promise<boolean> {
  const query: Record<string, any> = {
    name,
    teamId,
    parentId: parentId || null,
    deleteTime: null,
    source: AgentSkillSourceEnum.personal
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const count = await MongoAgentSkills.countDocuments(query);
  return count > 0;
}

// ==================== Folder Management ====================

/**
 * Recursively find a skill/folder and all its children
 */
export async function findSkillAndAllChildren({
  teamId,
  skillId,
  fields
}: {
  teamId: string;
  skillId: string;
  fields?: string;
}): Promise<AgentSkillSchemaType[]> {
  const find = async (id: string): Promise<AgentSkillSchemaType[]> => {
    const children = await MongoAgentSkills.find(
      {
        teamId,
        parentId: id,
        deleteTime: null
      },
      fields
    ).lean();

    let skills: AgentSkillSchemaType[] = children as AgentSkillSchemaType[];

    for (const child of children) {
      const grandChildren = await find(child._id);
      skills = skills.concat(grandChildren);
    }

    return skills;
  };

  const [skill, childSkills] = await Promise.all([
    MongoAgentSkills.findById(skillId, fields).lean(),
    find(skillId)
  ]);

  if (!skill) {
    throw new Error('Skill not found');
  }

  return [skill as AgentSkillSchemaType, ...childSkills];
}

/**
 * Create a skill folder
 */
export async function createSkillFolder(
  data: {
    name: string;
    description?: string;
    parentId?: string | null;
    teamId: string;
    tmbId: string;
  },
  session?: ClientSession
): Promise<AgentSkillSchemaType> {
  const { name, description, parentId, teamId, tmbId } = data;

  // Check name uniqueness in the same parent folder
  const nameExists = await checkSkillNameExists(name, teamId, parentId || null);
  if (nameExists) {
    throw new Error('Folder name already exists in this directory');
  }

  const folder = new MongoAgentSkills({
    type: AgentSkillTypeEnum.folder,
    source: AgentSkillSourceEnum.personal,
    parentId: parentId || null,
    name,
    description: description || '',
    author: '',
    category: [],
    config: {},
    teamId,
    tmbId,
    currentVersion: 0,
    versionCount: 0,
    createTime: new Date(),
    updateTime: new Date()
  });

  await folder.save({ session });
  return folder.toObject() as AgentSkillSchemaType;
}

/**
 * Get folder path from a skill/folder to root
 */
export async function getSkillFolderPath(
  skillId: string | null,
  type: 'current' | 'parent'
): Promise<{ parentId: string | null; parentName: string }[]> {
  if (!skillId) {
    return [];
  }

  const skill = await MongoAgentSkills.findById(skillId, 'name parentId type');
  if (!skill) {
    return [];
  }

  const targetId = type === 'current' ? skillId : skill.parentId ?? null;
  return await getParents(targetId);
}

/**
 * Recursively get parent folders
 */
async function getParents(
  parentId: string | null
): Promise<{ parentId: string | null; parentName: string }[]> {
  if (!parentId) {
    return [];
  }

  const parent = await MongoAgentSkills.findById(parentId, 'name parentId');
  if (!parent) {
    return [];
  }

  const paths = await getParents(parent.parentId ?? null);
  paths.push({ parentId, parentName: parent.name });

  return paths;
}

/**
 * Update parent folders' updateTime recursively (fire-and-forget)
 */
export const updateParentFoldersUpdateTime = ({ parentId }: { parentId?: string | null }) => {
  mongoSessionRun(async (session) => {
    const existsId = new Set<string>();
    let currentId: string | null | undefined = parentId;
    while (true) {
      if (!currentId || existsId.has(currentId)) return;

      existsId.add(currentId);

      const parentSkill = await MongoAgentSkills.findById(currentId, 'parentId updateTime');
      if (!parentSkill) return;

      parentSkill.updateTime = new Date();
      await parentSkill.save({ session });

      currentId = parentSkill.parentId ?? null;
    }
  }).catch((err) => {
    logger.error('Failed to update parent folder updateTime', { error: err });
  });
};
