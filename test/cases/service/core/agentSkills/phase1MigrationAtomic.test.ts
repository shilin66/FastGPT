import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import { MongoAgentSkillMigrationCheckpoint } from '@fastgpt/service/core/agentSkills/migration/schema';
import { backfillAgentSkillsPhase1 } from '@fastgpt/service/core/agentSkills/migration/phase1';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');

describe('Skill backfill refuses conflicts without partial resource mutations', () => {
  beforeEach(async () => {
    for (const model of [
      MongoAgentSkills,
      MongoAgentSkillsVersion,
      MongoAgentSkillMigrationCheckpoint
    ]) {
      await model.createCollection();
      await model.init();
    }
  });
  afterEach(() => vi.restoreAllMocks());
  const seed = async (extra: Record<string, unknown> = {}) => {
    const tmbId = new Types.ObjectId().toHexString();
    const skill = await MongoAgentSkills.create({
      teamId: new Types.ObjectId(),
      tmbId,
      source: 'personal',
      name: 'isolated migration',
      currentVersion: 0
    });
    const version = await MongoAgentSkillsVersion.create({
      skillId: skill._id,
      tmbId,
      version: 0,
      isActive: true,
      storage: { bucket: 'qa-no-storage', key: 'legacy.zip', size: 1 },
      ...extra
    });
    return { skill, version };
  };

  it.each([
    { storageKey: 'conflicting-canonical.zip' },
    { deleteTime: new Date(1), isDeleted: false }
  ])('preserves existing incompatible fields: %j', async (extra) => {
    const { version } = await seed(extra);
    const before = await MongoAgentSkillsVersion.findById(version._id).lean();
    expect(await backfillAgentSkillsPhase1()).toMatchObject({ conflicts: 1, updated: 0 });
    expect(await MongoAgentSkillsVersion.findById(version._id).lean()).toEqual(before);
  });

  it('does not backfill any Version when multiple candidates are unresolved', async () => {
    const { skill, version } = await seed();
    await MongoAgentSkillsVersion.create({
      skillId: skill._id,
      tmbId: version.tmbId,
      version: 1,
      isActive: true,
      storage: { bucket: 'qa-no-storage', key: 'second.zip', size: 1 }
    });
    const before = await MongoAgentSkillsVersion.find({ skillId: skill._id }).lean();
    expect(await backfillAgentSkillsPhase1()).toMatchObject({ conflicts: 1, updated: 0 });
    expect(await MongoAgentSkillsVersion.find({ skillId: skill._id }).lean()).toEqual(before);
  });

  it('retries a stale Version snapshot without overwriting a concurrently committed deletion', async () => {
    const { version } = await seed();
    const before = await MongoAgentSkillsVersion.findById(version._id).lean();
    const deleteTime = new Date();
    const update = MongoAgentSkillsVersion.collection.updateOne.bind(
      MongoAgentSkillsVersion.collection
    );
    const writer = vi.fn(async () => {
      await update(
        { _id: new Types.ObjectId(String(version._id)) },
        { $set: { isDeleted: true, deleteTime } }
      );
    });
    vi.spyOn(MongoAgentSkillsVersion.collection, 'updateOne').mockImplementationOnce(
      async (filter, fields, options) => {
        await writer();
        return update(filter, fields, options);
      }
    );
    expect(await backfillAgentSkillsPhase1()).toMatchObject({ conflicts: 1, updated: 0 });
    expect(writer).toHaveBeenCalledOnce();
    expect(await MongoAgentSkillsVersion.findById(version._id).lean()).toEqual({
      ...before,
      isDeleted: true,
      deleteTime
    });
  });

  it('rolls back all fields and the current pointer when checkpoint persistence fails', async () => {
    const { skill, version } = await seed();
    const before = await MongoAgentSkillsVersion.findById(version._id).lean();
    vi.spyOn(MongoAgentSkillMigrationCheckpoint, 'updateOne').mockRejectedValue(
      new Error('QA checkpoint failure')
    );
    await expect(backfillAgentSkillsPhase1()).rejects.toThrow('QA checkpoint failure');
    expect(await MongoAgentSkillsVersion.findById(version._id).lean()).toEqual(before);
    expect((await MongoAgentSkills.findById(skill._id).lean())?.currentVersionId).toBeUndefined();
  });
});
