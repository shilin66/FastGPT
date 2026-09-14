import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Types } from '@fastgpt/service/common/mongo';
import { AgentSkillCreationStatusEnum } from '@fastgpt/global/core/agentSkills/constants';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import { initializeAgentSkill } from '@fastgpt/service/core/agentSkills/initialize/processor';

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

vi.unmock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/core/agentSkills/storage', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@fastgpt/service/core/agentSkills/storage')>();
  return {
    ...original,
    finalizeStagedSkillPackage: finalizeMock,
    stageSkillPackage: stageMock
  };
});

describe('Agent Skill initialization', () => {
  const teamId = new Types.ObjectId().toHexString();
  const tmbId = new Types.ObjectId().toHexString();
  let skillId: string;
  let operationId: string;
  let versionId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    operationId = randomUUID();
    versionId = new Types.ObjectId().toHexString();
    const skill = await MongoAgentSkills.create({
      source: 'personal',
      name: 'My 中文 Skill',
      description: 'Initialized without an LLM',
      author: '',
      category: [],
      config: {},
      teamId,
      tmbId,
      creationStatus: AgentSkillCreationStatusEnum.pending,
      lastOperationId: operationId,
      deleteTime: null
    });
    skillId = String(skill._id);
  });

  afterEach(async () => {
    await Promise.all([
      MongoAgentSkillsVersion.deleteMany({ skillId }),
      MongoAgentSkills.deleteMany({ teamId })
    ]);
  });

  it('creates the minimal canonical v0 and marks the resource ready', async () => {
    await initializeAgentSkill({ skillId, teamId, tmbId, operationId, versionId });

    const [skill, version] = await Promise.all([
      MongoAgentSkills.findById(skillId).lean(),
      MongoAgentSkillsVersion.findById(versionId).lean()
    ]);
    expect(skill?.creationStatus).toBe(AgentSkillCreationStatusEnum.ready);
    expect(String(skill?.currentVersionId)).toBe(versionId);
    expect(version?.runtimeSkills).toEqual([
      {
        name: 'my-skill',
        description: 'Initialized without an LLM',
        path: 'skills/my-skill'
      }
    ]);
    expect(stageMock).toHaveBeenCalledOnce();
    expect(finalizeMock).toHaveBeenCalledOnce();
  });

  it('ignores a stale operation without creating storage', async () => {
    await initializeAgentSkill({
      skillId,
      teamId,
      tmbId,
      operationId: randomUUID(),
      versionId
    });

    expect(stageMock).not.toHaveBeenCalled();
    expect(await MongoAgentSkillsVersion.countDocuments({ skillId })).toBe(0);
  });

  it('records a stable failure that can be retried', async () => {
    stageMock.mockRejectedValueOnce(new Error('object storage unavailable'));

    await expect(
      initializeAgentSkill({ skillId, teamId, tmbId, operationId, versionId })
    ).rejects.toThrow('object storage unavailable');

    const skill = await MongoAgentSkills.findById(skillId).lean();
    expect(skill?.creationStatus).toBe(AgentSkillCreationStatusEnum.failed);
    expect(skill?.error?.code).toBe('skill_initialization_failed');
    expect(skill?.error?.operationId).toBe(operationId);
  });
});
