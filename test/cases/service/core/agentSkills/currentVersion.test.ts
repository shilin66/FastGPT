import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import {
  getCurrentVersion,
  setCurrentVersion
} from '@fastgpt/service/core/agentSkills/version/current';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/agentSkills/constants';

describe('agent skill current version', () => {
  const teamId = new Types.ObjectId().toHexString();
  const tmbId = new Types.ObjectId().toHexString();
  let skillId: string;

  beforeEach(async () => {
    const skill = await MongoAgentSkills.create({
      source: AgentSkillSourceEnum.personal,
      name: 'current-version-test',
      description: '',
      author: '',
      category: [],
      config: {},
      teamId,
      tmbId,
      deleteTime: null
    });
    skillId = String(skill._id);
  });

  afterEach(async () => {
    await MongoAgentSkillsVersion.deleteMany({});
    await MongoAgentSkills.deleteMany({ teamId });
  });

  it('sets the main pointer and compatibility projection without writing legacy isActive', async () => {
    const version = await MongoAgentSkillsVersion.create({
      skillId,
      tmbId,
      version: 3,
      storage: { bucket: 'private', key: 'skill-v3.zip', size: 128 },
      runtimeSkills: [{ name: 'lookup', description: 'Lookup data', path: 'skills/lookup' }],
      isActive: false,
      isDeleted: false
    });

    await setCurrentVersion({ skillId, versionId: String(version._id) });

    const [skill, storedVersion] = await Promise.all([
      MongoAgentSkills.findById(skillId).lean(),
      MongoAgentSkillsVersion.findById(version._id).lean()
    ]);
    expect(String(skill?.currentVersionId)).toBe(String(version._id));
    expect(skill?.currentRuntimeSkills).toEqual([
      { name: 'lookup', description: 'Lookup data', path: 'skills/lookup' }
    ]);
    expect(skill?.currentVersion).toBe(3);
    expect(skill?.currentStorage).toEqual({
      bucket: 'private',
      key: 'skill-v3.zip',
      size: 128
    });
    expect(storedVersion?.isActive).toBe(false);
  });

  it('rejects a version that belongs to another skill', async () => {
    const otherSkill = await MongoAgentSkills.create({
      source: AgentSkillSourceEnum.personal,
      name: 'other-current-version-test',
      description: '',
      author: '',
      category: [],
      config: {},
      teamId,
      tmbId,
      deleteTime: null
    });
    const otherVersion = await MongoAgentSkillsVersion.create({
      skillId: otherSkill._id,
      tmbId,
      version: 0,
      storage: { bucket: 'private', key: 'other-v0.zip', size: 1 },
      isDeleted: false
    });

    await expect(
      setCurrentVersion({ skillId, versionId: String(otherVersion._id) })
    ).rejects.toThrow('versionConflict');

    const skill = await MongoAgentSkills.findById(skillId).lean();
    expect(skill?.currentVersionId).toBeUndefined();
  });

  it('reads currentVersionId first and only falls back to legacy active data when absent', async () => {
    const [legacyActive, pointed] = await MongoAgentSkillsVersion.create([
      {
        skillId,
        tmbId,
        version: 0,
        storage: { bucket: 'private', key: 'legacy.zip', size: 1 },
        isActive: true,
        isDeleted: false
      },
      {
        skillId,
        tmbId,
        version: 1,
        storage: { bucket: 'private', key: 'pointed.zip', size: 1 },
        isActive: false,
        isDeleted: false
      }
    ]);

    const legacyResult = await getCurrentVersion(skillId);
    expect(String(legacyResult?._id)).toBe(String(legacyActive._id));

    await MongoAgentSkills.updateOne({ _id: skillId }, { $set: { currentVersionId: pointed._id } });
    const pointerResult = await getCurrentVersion(skillId);
    expect(String(pointerResult?._id)).toBe(String(pointed._id));
  });
});
