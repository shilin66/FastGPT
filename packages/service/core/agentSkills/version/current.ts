import type { ClientSession } from '../../../common/mongo';
import { getLogger, LogCategories } from '../../../common/logger';
import { UserError } from '@fastgpt/global/common/error/utils';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import {
  AgentSkillCreationStatusEnum,
  AgentSkillSchemaVersion
} from '@fastgpt/global/core/agentSkills/constants';
import type { AgentSkillsVersionSchemaType } from '@fastgpt/global/core/agentSkills/type';
import { MongoAgentSkills } from '../schema';
import { recordAgentSkillOperation } from '../observability';
import { MongoAgentSkillsVersion } from './schema';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.VERSION);

export async function getCurrentVersion(
  skillId: string,
  session?: ClientSession
): Promise<AgentSkillsVersionSchemaType | null> {
  const skill = await MongoAgentSkills.findOne(
    { _id: skillId, deleteTime: null },
    { currentVersionId: 1, currentVersion: 1, currentStorage: 1 },
    { session }
  ).lean();

  if (!skill) return null;

  if (skill.currentVersionId) {
    const pointedVersion = await MongoAgentSkillsVersion.findOne(
      { _id: skill.currentVersionId, skillId, isDeleted: false },
      undefined,
      { session }
    ).lean();
    return pointedVersion as AgentSkillsVersionSchemaType | null;
  }

  const legacyActiveVersion = await MongoAgentSkillsVersion.findOne(
    { skillId, isActive: true, isDeleted: false },
    undefined,
    { sort: { version: -1 }, session }
  ).lean();
  if (legacyActiveVersion) {
    return legacyActiveVersion as AgentSkillsVersionSchemaType;
  }

  if (typeof skill.currentVersion === 'number' && skill.currentStorage) {
    const legacyNumberVersion = await MongoAgentSkillsVersion.findOne(
      { skillId, version: skill.currentVersion, isDeleted: false },
      undefined,
      { session }
    ).lean();
    return legacyNumberVersion as AgentSkillsVersionSchemaType | null;
  }

  return null;
}

async function setCurrentVersionInSession({
  skillId,
  versionId,
  expectedCurrentVersionId,
  session
}: {
  skillId: string;
  versionId: string;
  expectedCurrentVersionId?: string | null;
  session?: ClientSession;
}): Promise<void> {
  const targetVersion = await MongoAgentSkillsVersion.findOne(
    { _id: versionId, skillId, isDeleted: false },
    undefined,
    { session }
  ).lean();

  if (!targetVersion) {
    logger.warn('Rejected Agent Skill version switch', {
      skillId,
      versionId,
      reason: 'version_not_owned_or_deleted'
    });
    recordAgentSkillOperation({ operation: 'set_current_version', status: 'conflict' });
    throw new UserError(SkillErrEnum.versionConflict);
  }

  const pointerCondition = (() => {
    if (expectedCurrentVersionId === undefined) return {};
    if (expectedCurrentVersionId === null) {
      return { $or: [{ currentVersionId: { $exists: false } }, { currentVersionId: null }] };
    }
    return { currentVersionId: expectedCurrentVersionId };
  })();

  const legacyStorageProjection = {
    bucket: targetVersion.storage.bucket,
    key: targetVersion.storage.key,
    size: targetVersion.storage.size
  };

  const result = await MongoAgentSkills.updateOne(
    { _id: skillId, deleteTime: null, ...pointerCondition },
    {
      $set: {
        schemaVersion: AgentSkillSchemaVersion,
        currentVersionId: targetVersion._id,
        currentRuntimeSkills: targetVersion.runtimeSkills ?? [],
        creationStatus: AgentSkillCreationStatusEnum.ready,
        updateTime: new Date(),
        currentVersion: targetVersion.version,
        currentStorage: legacyStorageProjection
      },
      $max: { versionCount: targetVersion.version + 1 }
    },
    { session }
  );

  if (result.matchedCount === 0) {
    logger.warn('Agent Skill current version compare-and-set conflict', {
      skillId,
      versionId,
      expectedCurrentVersionId
    });
    recordAgentSkillOperation({ operation: 'set_current_version', status: 'conflict' });
    throw new UserError(SkillErrEnum.versionConflict);
  }

  logger.info('Updated Agent Skill current version', { skillId, versionId });
  recordAgentSkillOperation({ operation: 'set_current_version', status: 'ok' });
}

export function setCurrentVersion(args: Parameters<typeof setCurrentVersionInSession>[0]) {
  return args.session
    ? setCurrentVersionInSession(args)
    : mongoSessionRun((session) => setCurrentVersionInSession({ ...args, session }));
}
