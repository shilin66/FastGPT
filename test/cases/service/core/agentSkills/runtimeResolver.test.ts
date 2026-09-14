import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { getUser } from '@test/datas/users';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import {
  AgentSkillCreationStatusEnum,
  AgentSkillSourceEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/agentSkills/constants';
import {
  resolveRuntimeSkills,
  RuntimeSkillResolutionError
} from '@fastgpt/service/core/agentSkills/runtimeResolver';
import { createSkillPackage } from '@fastgpt/service/core/agentSkills/zipBuilder';
import { validateAndNormalizeSkillPackage } from '@fastgpt/service/core/agentSkills/packageValidator';

const { downloadMock } = vi.hoisted(() => ({ downloadMock: vi.fn() }));
vi.mock('@fastgpt/service/core/agentSkills/storage', () => ({
  downloadSkillPackage: downloadMock
}));

describe('App owner runtime Skill resolution', () => {
  let owner: Awaited<ReturnType<typeof getUser>>;
  let member: Awaited<ReturnType<typeof getUser>>;
  let skillId: string;
  let versionId: string;
  const runtimeSkills = [{ name: 'lookup', description: 'Lookup data', path: 'skills/lookup' }];
  const resolve = (ids = [skillId], tmbId = owner.tmbId) =>
    resolveRuntimeSkills({ skillIds: ids, teamId: owner.teamId, tmbId });

  beforeEach(async () => {
    vi.clearAllMocks();
    owner = await getUser('runtime-owner');
    member = await getUser('runtime-member', owner.teamId);
    const skill = await MongoAgentSkills.create({
      name: 'lookup',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      source: AgentSkillSourceEnum.personal,
      creationStatus: AgentSkillCreationStatusEnum.ready
    });
    skillId = String(skill._id);
    const version = await MongoAgentSkillsVersion.create({
      skillId,
      tmbId: owner.tmbId,
      version: 0,
      runtimeSkills,
      storage: { bucket: 'private', key: 'lookup.zip', size: 10 }
    });
    versionId = String(version._id);
    await MongoAgentSkills.updateOne(
      { _id: skillId },
      {
        currentVersionId: version._id,
        currentRuntimeSkills: runtimeSkills
      }
    );
  });

  it('resolves one immutable version per unique requested ID without starting storage or sandbox work', async () => {
    const result = await resolve([skillId, skillId]);
    expect(result).toHaveLength(1);
    expect(String(result[0].version._id)).toBe(versionId);
    expect(result[0].runtimeSkills).toEqual(runtimeSkills);
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it('does not require an owner lookup for an unbound App', async () => {
    await expect(
      resolveRuntimeSkills({ skillIds: [], teamId: 'none', tmbId: 'none' })
    ).resolves.toEqual([]);
  });

  it('rejects a same-team member with no Read permission without exposing Skill metadata', async () => {
    await expect(resolve([skillId], member.tmbId)).rejects.toThrow('skill_unavailable');
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it('uses inherited folder Read and observes its revocation on the next resolution', async () => {
    const folder = await MongoAgentSkills.create({
      name: 'folder',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      source: AgentSkillSourceEnum.personal,
      type: AgentSkillTypeEnum.folder
    });
    await MongoAgentSkills.updateOne({ _id: skillId }, { parentId: folder._id });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.agentSkill,
      resourceId: folder._id,
      teamId: owner.teamId,
      tmbId: member.tmbId,
      permission: ReadPermissionVal
    });
    expect(await resolve([skillId], member.tmbId)).toHaveLength(1);
    await MongoResourcePermission.deleteMany({ resourceId: folder._id });
    await expect(resolve([skillId], member.tmbId)).rejects.toThrow('skill_unavailable');
  });

  it('rejects a foreign team owner even when the caller supplies the Skill team ID', async () => {
    const foreign = await getUser('foreign-runtime-owner');
    await expect(resolve([skillId], foreign.tmbId)).rejects.toThrow('skill_unavailable');
  });

  it.each(['pending', 'initializing', 'failed', 'deleting'])(
    'rejects creation status %s',
    async (status) => {
      await MongoAgentSkills.updateOne({ _id: skillId }, { creationStatus: status });
      await expect(resolve()).rejects.toThrow('skill_unavailable');
    }
  );

  it('rejects deleted and absent bindings instead of returning a partial set', async () => {
    await expect(resolve([skillId, new Types.ObjectId().toHexString()])).rejects.toThrow(
      'skill_unavailable'
    );
    await MongoAgentSkills.updateOne({ _id: skillId }, { deleteTime: new Date() });
    await expect(resolve()).rejects.toThrow('skill_unavailable');
  });

  it('rejects a current pointer to a Version belonging to another Skill', async () => {
    await MongoAgentSkillsVersion.updateOne({ _id: versionId }, { skillId: new Types.ObjectId() });
    await expect(resolve()).rejects.toThrow('skill_unavailable');
  });

  it('rejects a deleted or storage-cleaned Version', async () => {
    await MongoAgentSkillsVersion.updateOne({ _id: versionId }, { isDeleted: true });
    await expect(resolve()).rejects.toThrow('skill_unavailable');
    await MongoAgentSkillsVersion.updateOne(
      { _id: versionId },
      { isDeleted: false, storageDeletedAt: new Date() }
    );
    await expect(resolve()).rejects.toThrow('skill_unavailable');
  });

  it('uses Version metadata when the rebuildable main-table cache disagrees', async () => {
    await MongoAgentSkills.updateOne(
      { _id: skillId },
      { currentRuntimeSkills: [{ name: 'stale', description: '', path: 'skills/stale' }] }
    );
    expect((await resolve())[0].runtimeSkills).toEqual(runtimeSkills);
  });

  it('pins the already resolved version across a current-version switch and rechecks Read', async () => {
    const next = await MongoAgentSkillsVersion.create({
      skillId,
      tmbId: owner.tmbId,
      version: 1,
      runtimeSkills,
      storage: { bucket: 'private', key: 'next.zip', size: 10 }
    });
    await MongoAgentSkills.updateOne({ _id: skillId }, { currentVersionId: next._id });
    const params = {
      skillIds: [skillId],
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      expectedVersionIds: { [skillId]: versionId }
    };
    expect(String((await resolveRuntimeSkills(params))[0].version._id)).toBe(versionId);
    await expect(resolveRuntimeSkills({ ...params, tmbId: member.tmbId })).rejects.toThrow(
      'skill_unavailable'
    );
    await MongoAgentSkillsVersion.updateOne({ _id: versionId }, { isDeleted: true });
    await expect(resolveRuntimeSkills(params)).rejects.toThrow('skill_unavailable');
  });

  it('requires an exact pinned version set rather than silently resolving unpinned entries', async () => {
    await expect(
      resolveRuntimeSkills({
        skillIds: [skillId],
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        expectedVersionIds: {}
      })
    ).rejects.toBeInstanceOf(RuntimeSkillResolutionError);
  });

  it('rejects ambiguous legacy active versions, and reads one unambiguous active version', async () => {
    await MongoAgentSkills.updateOne({ _id: skillId }, { $unset: { currentVersionId: 1 } });
    await MongoAgentSkillsVersion.updateOne({ _id: versionId }, { isActive: true });
    expect(String((await resolve())[0].version._id)).toBe(versionId);
    await MongoAgentSkillsVersion.create({
      skillId,
      tmbId: owner.tmbId,
      version: 1,
      isActive: true,
      runtimeSkills,
      storage: { bucket: 'private', key: 'ambiguous.zip', size: 10 }
    });
    await expect(resolve()).rejects.toThrow('skill_unavailable');
  });

  it('validates a legacy package once when runtime metadata is missing', async () => {
    const buffer = await createSkillPackage({
      name: 'lookup',
      skillMd: '---\nname: lookup\ndescription: Lookup data\n---\n'
    });
    downloadMock.mockResolvedValue(buffer);
    await MongoAgentSkillsVersion.updateOne({ _id: versionId }, { runtimeSkills: [] });
    expect((await resolve())[0].runtimeSkills).toEqual(runtimeSkills);
    expect(downloadMock).toHaveBeenCalledTimes(1);
  });

  it('validates object existence and checksum for publication even with cached metadata', async () => {
    const buffer = await createSkillPackage({
      name: 'lookup',
      skillMd: '---\nname: lookup\ndescription: Lookup data\n---\n'
    });
    const validated = await validateAndNormalizeSkillPackage(buffer);
    downloadMock.mockResolvedValue(buffer);
    await MongoAgentSkillsVersion.updateOne(
      { _id: versionId },
      { contentHash: validated.contentHash }
    );
    const params = {
      skillIds: [skillId],
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      validatePackages: true
    };
    expect(await resolveRuntimeSkills(params)).toHaveLength(1);
    downloadMock.mockRejectedValue(new Error('private storage address'));
    await expect(resolveRuntimeSkills(params)).rejects.toThrow('skill_unavailable');
    downloadMock.mockResolvedValue(buffer);
    await MongoAgentSkillsVersion.updateOne({ _id: versionId }, { contentHash: '0'.repeat(64) });
    await expect(resolveRuntimeSkills(params)).rejects.toThrow('skill_unavailable');
  });
});
