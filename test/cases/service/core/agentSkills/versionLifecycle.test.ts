import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/agentSkills/constants';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { createSkillPackage } from '@fastgpt/service/core/agentSkills/zipBuilder';
import { validateAndNormalizeSkillPackage } from '@fastgpt/service/core/agentSkills/packageValidator';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import { validateSkillVersionPackage } from '@fastgpt/service/core/agentSkills/version/validate';
import { softDeleteVersionById } from '@fastgpt/service/core/agentSkills/version/controller';
import { cleanupAgentSkillVersion } from '@fastgpt/service/core/agentSkills/version/cleanup/processor';
import { AGENT_SKILL_VERSION_RETENTION_MS } from '@fastgpt/service/core/agentSkills/version/cleanup';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';

const { deleteMock, downloadMock } = vi.hoisted(() => ({
  deleteMock: vi.fn().mockResolvedValue(undefined),
  downloadMock: vi.fn()
}));

vi.unmock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/core/agentSkills/storage', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@fastgpt/service/core/agentSkills/storage')>();
  return {
    ...original,
    deleteSkillPackage: deleteMock,
    downloadSkillPackage: downloadMock
  };
});

describe('Agent Skill version lifecycle', () => {
  const teamId = new Types.ObjectId().toHexString();
  const tmbId = new Types.ObjectId().toHexString();
  let skillId: string;
  let currentVersionId: string;
  let historyVersionId: string;
  let canonicalPackage: Buffer;
  let contentHash: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const validated = await validateAndNormalizeSkillPackage(
      await createSkillPackage({
        name: 'lifecycle',
        skillMd: '---\nname: lifecycle\ndescription: Lifecycle\n---\n'
      })
    );
    canonicalPackage = validated.zipBuffer;
    contentHash = validated.contentHash;
    downloadMock.mockResolvedValue(canonicalPackage);

    const skill = await MongoAgentSkills.create({
      source: AgentSkillSourceEnum.personal,
      name: 'Version lifecycle',
      description: '',
      author: '',
      category: [],
      config: {},
      teamId,
      tmbId,
      deleteTime: null
    });
    skillId = String(skill._id);
    const [current, history] = await MongoAgentSkillsVersion.create([
      {
        skillId,
        tmbId,
        version: 1,
        storage: {
          bucket: 'fastgpt-private',
          key: `agent-skills/${teamId}/${skillId}/v1/package.zip`,
          size: canonicalPackage.length
        },
        contentHash,
        isDeleted: false
      },
      {
        skillId,
        tmbId,
        version: 0,
        storage: {
          bucket: 'fastgpt-private',
          key: `agent-skills/${teamId}/${skillId}/v0/package.zip`,
          size: canonicalPackage.length
        },
        contentHash,
        isDeleted: false
      }
    ]);
    currentVersionId = String(current._id);
    historyVersionId = String(history._id);
    await MongoAgentSkills.updateOne({ _id: skillId }, { $set: { currentVersionId: current._id } });
  });

  afterEach(async () => {
    await Promise.all([
      MongoAgentSkillsVersion.deleteMany({ skillId }),
      MongoAgentSkills.deleteMany({ teamId })
    ]);
  });

  it('revalidates package content and rejects a hash mismatch before switching', async () => {
    await expect(
      validateSkillVersionPackage({ skillId, versionId: historyVersionId })
    ).resolves.toBeUndefined();

    await MongoAgentSkillsVersion.updateOne(
      { _id: historyVersionId },
      { $set: { contentHash: '0'.repeat(64) } }
    );
    await expect(
      validateSkillVersionPackage({ skillId, versionId: historyVersionId })
    ).rejects.toThrow('invalidSkillPackage');
  });

  it('forbids deleting the current version', async () => {
    await expect(
      softDeleteVersionById({
        skillId,
        versionId: currentVersionId,
        deleteTime: new Date()
      })
    ).rejects.toThrow('versionConflict');
  });

  it('rejects current-version cleanup even when a queued Object ID uses uppercase hex', async () => {
    const deleteTime = new Date(Date.now() - AGENT_SKILL_VERSION_RETENTION_MS - 1000);
    await MongoAgentSkillsVersion.updateOne(
      { _id: currentVersionId },
      { $set: { isDeleted: true, deleteTime } }
    );
    await expect(
      cleanupAgentSkillVersion({
        skillId: skillId.toUpperCase(),
        versionId: currentVersionId.toUpperCase(),
        deleteTime: deleteTime.toISOString()
      })
    ).rejects.toThrow('Current Agent Skill');
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('soft deletes inside a real Mongo transaction', async () => {
    const deleteTime = new Date();
    await mongoSessionRun((session) =>
      softDeleteVersionById({ skillId, versionId: historyVersionId, deleteTime, session })
    );

    const version = await MongoAgentSkillsVersion.findById(historyVersionId).lean();
    expect(version?.isDeleted).toBe(true);
    expect(version?.deleteTime?.getTime()).toBe(deleteTime.getTime());
  });

  it('soft deletes history then removes only storage while retaining audit metadata', async () => {
    const deleteTime = new Date(Date.now() - AGENT_SKILL_VERSION_RETENTION_MS - 1000);
    await softDeleteVersionById({ skillId, versionId: historyVersionId, deleteTime });
    await cleanupAgentSkillVersion({
      skillId,
      versionId: historyVersionId,
      deleteTime: deleteTime.toISOString()
    });

    const version = await MongoAgentSkillsVersion.findById(historyVersionId).lean();
    expect(deleteMock).toHaveBeenCalledWith(version?.storage);
    expect(version?.isDeleted).toBe(true);
    expect(version?.storageDeletedAt).toBeInstanceOf(Date);
    expect(version?.contentHash).toBe(contentHash);
  });

  it('refuses an early queue execution before thirty full days', async () => {
    const deleteTime = new Date();
    await softDeleteVersionById({ skillId, versionId: historyVersionId, deleteTime });
    await expect(
      cleanupAgentSkillVersion({
        skillId,
        versionId: historyVersionId,
        deleteTime: deleteTime.toISOString()
      })
    ).rejects.toThrow('retention');
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('retains a legacy version when the authoritative current pointer is missing', async () => {
    const deleteTime = new Date(Date.now() - AGENT_SKILL_VERSION_RETENTION_MS - 1000);
    await softDeleteVersionById({ skillId, versionId: historyVersionId, deleteTime });
    await MongoAgentSkills.updateOne({ _id: skillId }, { $unset: { currentVersionId: 1 } });
    await expect(
      cleanupAgentSkillVersion({
        skillId,
        versionId: historyVersionId,
        deleteTime: deleteTime.toISOString()
      })
    ).rejects.toThrow('pointer is ambiguous');
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('retains deleted version storage while an App runtime still binds the Skill', async () => {
    const deleteTime = new Date(Date.now() - AGENT_SKILL_VERSION_RETENTION_MS - 1000);
    await softDeleteVersionById({ skillId, versionId: historyVersionId, deleteTime });
    await MongoSandboxInstance.create({
      sandboxId: 'runtime-retention',
      provider: 'opensandbox',
      status: 'stopped',
      sourceType: 'appRuntime',
      sourceId: new Types.ObjectId().toHexString(),
      metadata: { skillIds: [skillId] }
    });
    await expect(
      cleanupAgentSkillVersion({
        skillId,
        versionId: historyVersionId,
        deleteTime: deleteTime.toISOString()
      })
    ).rejects.toThrow('runtime_reference');
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('does not clean a restored version from an older deletion operation', async () => {
    const deleteTime = new Date();
    await softDeleteVersionById({ skillId, versionId: historyVersionId, deleteTime });
    await MongoAgentSkillsVersion.updateOne(
      { _id: historyVersionId },
      { $set: { isDeleted: false, deleteTime: null } }
    );

    await cleanupAgentSkillVersion({
      skillId,
      versionId: historyVersionId,
      deleteTime: deleteTime.toISOString()
    });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('retains a paused version before a Sandbox exists but releases historical completed pauses', async () => {
    const deleteTime = new Date(Date.now() - AGENT_SKILL_VERSION_RETENTION_MS - 1000);
    await softDeleteVersionById({ skillId, versionId: historyVersionId, deleteTime });
    const appId = new Types.ObjectId().toHexString();
    await MongoChatItem.create({
      appId,
      sourceType: 'appRuntime',
      sourceId: appId,
      teamId,
      tmbId,
      chatId: 'paused-version',
      obj: 'AI',
      value: [
        {
          interactive: {
            type: 'agentPlanCheck',
            params: { confirmed: false },
            entryNodeIds: ['node'],
            memoryEdges: [],
            nodeOutputs: []
          }
        }
      ],
      memories: {
        'agentLoopMemory-node': {
          schemaVersion: 1,
          status: 'paused',
          providerState: { sandboxSkillVersions: { [skillId]: historyVersionId } }
        }
      }
    });
    const job = { skillId, versionId: historyVersionId, deleteTime: deleteTime.toISOString() };
    await expect(cleanupAgentSkillVersion(job)).rejects.toThrow('runtime_reference');
    expect(deleteMock).not.toHaveBeenCalled();
    await MongoChatItem.updateOne(
      { appId, sourceType: 'appRuntime', chatId: 'paused-version' },
      { $unset: { 'value.0.interactive.params': 1 } }
    );
    await MongoChatItem.create({
      appId,
      sourceType: 'skillEdit',
      sourceId: appId,
      teamId,
      tmbId,
      chatId: 'paused-version',
      obj: 'AI',
      value: [{ text: { content: 'other source completed' } }],
      memories: { 'agentLoopMemory-node': { schemaVersion: 1, status: 'completed' } }
    });
    await expect(cleanupAgentSkillVersion(job)).rejects.toThrow('runtime_reference');
    await MongoChatItem.create({
      appId,
      sourceType: 'appRuntime',
      sourceId: appId,
      teamId,
      tmbId,
      chatId: 'paused-version',
      obj: 'AI',
      value: [{ text: { content: 'completed' } }],
      memories: { 'agentLoopMemory-node': { schemaVersion: 1, status: 'completed' } }
    });
    await cleanupAgentSkillVersion(job);
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });
});
