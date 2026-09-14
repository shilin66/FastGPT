import type { Processor } from 'bullmq';
import { MongoAgentSkills } from '../../schema';
import { deleteSkillPackage } from '../../storage';
import { MongoAgentSkillsVersion } from '../schema';
import type { AgentSkillVersionCleanupJobData } from './index';
import { AGENT_SKILL_VERSION_RETENTION_MS } from './index';
import { assertSkillPackageOwnership, assertSkillVersionUnreferenced } from '../../delete/service';

export async function cleanupAgentSkillVersion({
  skillId: inputSkillId,
  versionId: inputVersionId,
  deleteTime
}: AgentSkillVersionCleanupJobData): Promise<void> {
  const skillId = inputSkillId.toLowerCase();
  const versionId = inputVersionId.toLowerCase();
  const version = await MongoAgentSkillsVersion.findOne({
    _id: versionId,
    skillId,
    isDeleted: true,
    deleteTime: new Date(deleteTime),
    storageDeletedAt: null
  }).lean();
  if (!version) return;

  if (Date.now() - version.deleteTime!.getTime() < AGENT_SKILL_VERSION_RETENTION_MS) {
    throw new Error('Skill version retention period has not elapsed');
  }

  const skill = await MongoAgentSkills.findById(skillId, {
    currentVersionId: 1,
    teamId: 1,
    deleteTime: 1
  }).lean();
  if (!skill || skill.deleteTime) return;
  if (!skill.currentVersionId) throw new Error('Skill version current pointer is ambiguous');
  if (String(skill?.currentVersionId) === versionId) {
    throw new Error('Current Agent Skill version cannot be cleaned up');
  }

  await assertSkillPackageOwnership({ teamId: String(skill.teamId), version });
  await assertSkillVersionUnreferenced({ teamId: String(skill.teamId), skillId, versionId });
  const stillDeleted = await MongoAgentSkillsVersion.exists({
    _id: versionId,
    skillId,
    isDeleted: true,
    deleteTime: new Date(deleteTime),
    storageDeletedAt: null
  });
  const stillNoncurrent = await MongoAgentSkills.exists({
    _id: skillId,
    teamId: skill.teamId,
    deleteTime: null,
    currentVersionId: skill.currentVersionId
  });
  if (!stillDeleted || !stillNoncurrent)
    throw new Error('Skill version cleanup operation conflict');

  await deleteSkillPackage(version.storage);
  await MongoAgentSkillsVersion.updateOne(
    {
      _id: versionId,
      skillId,
      isDeleted: true,
      deleteTime: new Date(deleteTime),
      storageDeletedAt: null
    },
    { $set: { storageDeletedAt: new Date() } }
  );
}

export const agentSkillVersionCleanupProcessor: Processor<AgentSkillVersionCleanupJobData> = async (
  job
) => cleanupAgentSkillVersion(job.data);
