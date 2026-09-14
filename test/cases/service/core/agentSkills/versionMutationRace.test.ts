import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionMongo, Types } from '@fastgpt/service/common/mongo';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import { setCurrentVersion } from '@fastgpt/service/core/agentSkills/version/current';
import { softDeleteVersionById } from '@fastgpt/service/core/agentSkills/version/controller';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');

describe('Skill current pointer and version deletion share a transaction fence', () => {
  beforeEach(async () => {
    for (const model of [MongoAgentSkills, MongoAgentSkillsVersion]) {
      await model.createCollection();
      await model.init();
    }
  });

  const seed = async () => {
    const tmbId = new Types.ObjectId().toHexString();
    const skill = await MongoAgentSkills.create({
      teamId: new Types.ObjectId(),
      tmbId,
      name: 'isolated mutation race',
      source: 'personal'
    });
    const versions = await MongoAgentSkillsVersion.create(
      [0, 1].map((version) => ({
        skillId: skill._id,
        tmbId,
        version,
        storage: { bucket: 'qa-no-external-storage', key: `v${version}.zip`, size: 1 }
      }))
    );
    await setCurrentVersion({ skillId: String(skill._id), versionId: String(versions[0]._id) });
    return { skillId: String(skill._id), versionId: String(versions[1]._id) };
  };

  it.each(['switch', 'delete'] as const)(
    'rejects a stale competing snapshot after %s commits',
    async (first) => {
      const ids = await seed();
      const sessions = await Promise.all([
        connectionMongo.startSession(),
        connectionMongo.startSession()
      ]);
      try {
        for (const session of sessions) {
          session.startTransaction();
          await MongoAgentSkills.findById(ids.skillId).session(session).lean();
        }
        const switchVersion = (session: (typeof sessions)[number]) =>
          setCurrentVersion({ ...ids, session });
        const deleteVersion = (session: (typeof sessions)[number]) =>
          softDeleteVersionById({ ...ids, session, deleteTime: new Date() });
        await (first === 'switch' ? switchVersion : deleteVersion)(sessions[0]);
        await sessions[0].commitTransaction();
        await expect(
          (first === 'switch' ? deleteVersion : switchVersion)(sessions[1])
        ).rejects.toMatchObject({ code: 112 });
        await sessions[1].abortTransaction();
        const skill = await MongoAgentSkills.findById(ids.skillId).orFail().lean();
        expect(await MongoAgentSkillsVersion.findById(skill.currentVersionId).lean()).toMatchObject(
          { isDeleted: false }
        );
      } finally {
        for (const session of sessions) {
          if (session.inTransaction()) await session.abortTransaction();
          await session.endSession();
        }
      }
    }
  );

  it('does not let an uppercase current version ID bypass deletion protection', async () => {
    const ids = await seed();
    await setCurrentVersion(ids);
    await expect(
      softDeleteVersionById({
        ...ids,
        versionId: ids.versionId.toUpperCase(),
        deleteTime: new Date()
      })
    ).rejects.toThrow('versionConflict');
    expect(await MongoAgentSkillsVersion.findById(ids.versionId).lean()).toMatchObject({
      isDeleted: false
    });
  });

  it.each(['pointer', 'legacy projection'] as const)(
    'refuses deletion when the unresolved current %s is inconsistent',
    async (source) => {
      const ids = await seed();
      await MongoAgentSkills.updateOne(
        { _id: ids.skillId },
        source === 'pointer'
          ? { $set: { currentVersionId: new Types.ObjectId() } }
          : { $unset: { currentVersionId: 1 }, $set: { currentVersion: 999 } }
      );
      const before = await MongoAgentSkillsVersion.findById(ids.versionId).lean();
      await expect(softDeleteVersionById({ ...ids, deleteTime: new Date() })).rejects.toThrow(
        'versionConflict'
      );
      expect(await MongoAgentSkillsVersion.findById(ids.versionId).lean()).toEqual(before);
    }
  );
});
