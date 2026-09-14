import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import { publishSkillPackage } from '@fastgpt/service/core/agentSkills/version/publish';
import { createSkillPackage } from '@fastgpt/service/core/agentSkills/zipBuilder';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/agentSkills/constants';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const { finalizeMock, stageMock } = vi.hoisted(() => ({
  finalizeMock: vi.fn().mockResolvedValue(undefined),
  stageMock: vi
    .fn()
    .mockImplementation(async ({ teamId, skillId, versionId, zipBuffer, checksum }) => ({
      bucket: 'private',
      key: `agent-skills/${teamId}/${skillId}/versions/${versionId}/package.zip`,
      size: zipBuffer.length,
      checksum
    }))
}));

vi.mock('@fastgpt/service/core/agentSkills/storage', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@fastgpt/service/core/agentSkills/storage')>();
  return {
    ...original,
    finalizeStagedSkillPackage: finalizeMock,
    stageSkillPackage: stageMock
  };
});

describe('publishSkillPackage', () => {
  const teamId = new Types.ObjectId().toHexString();
  const tmbId = new Types.ObjectId().toHexString();
  let skillId: string;
  let currentVersionId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const skill = await MongoAgentSkills.create({
      source: AgentSkillSourceEnum.personal,
      name: 'publish-test',
      description: '',
      author: '',
      category: [],
      config: {},
      teamId,
      tmbId,
      deleteTime: null
    });
    skillId = String(skill._id);
    const current = await MongoAgentSkillsVersion.create({
      skillId,
      tmbId,
      version: 0,
      storage: { bucket: 'private', key: 'legacy-v0.zip', size: 1 },
      runtimeSkills: [],
      isDeleted: false
    });
    currentVersionId = String(current._id);
    await MongoAgentSkills.updateOne({ _id: skillId }, { $set: { currentVersionId: current._id } });
  });

  afterEach(async () => {
    await MongoAgentSkillsVersion.deleteMany({ skillId });
    await MongoAgentSkills.deleteMany({ teamId });
  });

  it('stores canonical metadata and atomically advances the current pointer', async () => {
    const packageBuffer = await createSkillPackage({
      name: 'demo',
      skillMd: '---\nname: demo\ndescription: Demo skill\n---\n'
    });

    const result = await publishSkillPackage({
      teamId,
      tmbId,
      skillId,
      expectedCurrentVersionId: currentVersionId,
      versionName: 'Published',
      packageBuffer
    });

    const [skill, version] = await Promise.all([
      MongoAgentSkills.findById(skillId).lean(),
      MongoAgentSkillsVersion.findById(result.versionId).lean()
    ]);
    expect(result.version).toBe(1);
    expect(version?.contentHash).toMatch(/^[a-f\d]{64}$/);
    expect(version?.runtimeSkills).toEqual([
      { name: 'demo', description: 'Demo skill', path: 'skills/demo' }
    ]);
    expect(String(skill?.currentVersionId)).toBe(result.versionId);
    expect(skill?.currentRuntimeSkills).toEqual(version?.runtimeSkills);
    expect(stageMock).toHaveBeenCalledOnce();
    expect(finalizeMock).toHaveBeenCalledOnce();
  });

  it('keeps the staged object under TTL and rolls back the Version on pointer conflict', async () => {
    const packageBuffer = await createSkillPackage({
      name: 'demo',
      skillMd: '---\nname: demo\ndescription: Demo skill\n---\n'
    });

    await expect(
      publishSkillPackage({
        teamId,
        tmbId,
        skillId,
        expectedCurrentVersionId: new Types.ObjectId().toHexString(),
        packageBuffer
      })
    ).rejects.toThrow('versionConflict');

    expect(await MongoAgentSkillsVersion.countDocuments({ skillId })).toBe(1);
    expect(finalizeMock).not.toHaveBeenCalled();
    expect(String((await MongoAgentSkills.findById(skillId).lean())?.currentVersionId)).toBe(
      currentVersionId
    );
  });
});
