import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/agentSkills/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import {
  auditAgentSkillsPhase1,
  backfillAgentSkillsPhase1
} from '@fastgpt/service/core/agentSkills/migration/phase1';
import { MongoAgentSkillMigrationCheckpoint } from '@fastgpt/service/core/agentSkills/migration/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';

describe('Agent Skill Phase 1 migration', () => {
  const teamId = new Types.ObjectId().toHexString();
  const tmbId = new Types.ObjectId().toHexString();

  beforeEach(async () => {
    await Promise.all([
      MongoAgentSkills.deleteMany({}),
      MongoAgentSkillsVersion.deleteMany({}),
      MongoAgentSkillMigrationCheckpoint.deleteMany({}),
      MongoResourcePermission.deleteMany({ resourceType: PerResourceTypeEnum.agentSkill }),
      MongoApp.deleteMany({ teamId })
    ]);
  });

  afterEach(async () => {
    await Promise.all([
      MongoAgentSkills.deleteMany({}),
      MongoAgentSkillsVersion.deleteMany({}),
      MongoAgentSkillMigrationCheckpoint.deleteMany({}),
      MongoResourcePermission.deleteMany({ resourceType: PerResourceTypeEnum.agentSkill }),
      MongoApp.deleteMany({ teamId })
    ]);
  });

  async function createSkill(name: string) {
    return MongoAgentSkills.create({
      source: AgentSkillSourceEnum.personal,
      name,
      description: '',
      author: '',
      category: [],
      config: {},
      teamId,
      tmbId,
      deleteTime: null,
      currentVersion: 0
    });
  }

  it('reports multiple active versions, missing storage, orphan permissions and dangling app refs', async () => {
    const skill = await createSkill('audit-conflicts');
    await MongoAgentSkillsVersion.create([
      {
        skillId: skill._id,
        tmbId,
        version: 0,
        storage: { bucket: 'private', key: 'missing-v0.zip', size: 1 },
        isActive: true,
        isDeleted: false
      },
      {
        skillId: skill._id,
        tmbId,
        version: 1,
        storage: { bucket: 'private', key: 'missing-v1.zip', size: 1 },
        isActive: true,
        isDeleted: false
      }
    ]);
    const missingSkillId = new Types.ObjectId().toHexString();
    await MongoResourcePermission.create({
      teamId,
      tmbId,
      resourceId: missingSkillId,
      resourceType: PerResourceTypeEnum.agentSkill,
      permission: OwnerRoleVal
    });
    await MongoApp.create({
      teamId,
      tmbId,
      name: 'dangling-skill-app',
      modules: [
        {
          inputs: [{ key: NodeInputKeyEnum.skills, value: [{ skillId: missingSkillId }] }]
        }
      ]
    });

    const report = await auditAgentSkillsPhase1({
      batchSize: 100,
      storageExists: async () => false
    });
    const kinds = report.issues.map((item) => item.kind);

    expect(kinds).toContain('multiple_legacy_active_versions');
    expect(kinds).toContain('missing_storage_object');
    expect(kinds).toContain('orphan_permission');
    expect(kinds).toContain('dangling_app_reference');
  });

  it('backfills a unique legacy active version once and records a completed checkpoint', async () => {
    const skill = await createSkill('backfill-success');
    const version = await MongoAgentSkillsVersion.create({
      skillId: skill._id,
      tmbId,
      version: 0,
      storage: { bucket: 'private', key: 'v0.zip', size: 10 },
      isActive: true,
      isDeleted: false
    });

    const first = await backfillAgentSkillsPhase1({ batchSize: 100 });
    const second = await backfillAgentSkillsPhase1({ batchSize: 100 });

    const [updatedSkill, checkpoint] = await Promise.all([
      MongoAgentSkills.findById(skill._id).lean(),
      MongoAgentSkillMigrationCheckpoint.findOne({ resourceId: skill._id }).lean()
    ]);
    expect(first.updated).toBe(1);
    expect(second.updated).toBe(0);
    expect(second.skipped).toBeGreaterThanOrEqual(1);
    expect(String(updatedSkill?.currentVersionId)).toBe(String(version._id));
    expect(checkpoint?.status).toBe('completed');
  });

  it('reports main pointer cache mismatches against the pointed version', async () => {
    const skill = await createSkill('pointer-mismatch');
    const version = await MongoAgentSkillsVersion.create({
      skillId: skill._id,
      tmbId,
      version: 2,
      storage: { bucket: 'private', key: 'v2.zip', size: 10 },
      runtimeSkills: [{ name: 'v2', description: '', path: 'skills/v2' }],
      isActive: false,
      isDeleted: false
    });
    await MongoAgentSkills.updateOne(
      { _id: skill._id },
      {
        $set: {
          currentVersionId: version._id,
          currentVersion: 1,
          currentStorage: { bucket: 'private', key: 'wrong.zip', size: 1 },
          currentRuntimeSkills: []
        }
      }
    );

    const report = await auditAgentSkillsPhase1({
      storageExists: async () => true
    });
    const kinds = report.issues.map((item) => item.kind);

    expect(kinds).toContain('main_version_number_mismatch');
    expect(kinds).toContain('main_version_storage_mismatch');
    expect(kinds).toContain('runtime_skills_mismatch');
  });

  it('does not choose between multiple legacy active versions', async () => {
    const skill = await createSkill('backfill-conflict');
    await MongoAgentSkillsVersion.create([
      {
        skillId: skill._id,
        tmbId,
        version: 0,
        storage: { bucket: 'private', key: 'v0.zip', size: 1 },
        isActive: true,
        isDeleted: false
      },
      {
        skillId: skill._id,
        tmbId,
        version: 1,
        storage: { bucket: 'private', key: 'v1.zip', size: 1 },
        isActive: true,
        isDeleted: false
      }
    ]);

    const result = await backfillAgentSkillsPhase1({ batchSize: 100 });
    const updatedSkill = await MongoAgentSkills.findById(skill._id).lean();

    expect(result.conflicts).toBe(1);
    expect(updatedSkill?.currentVersionId).toBeUndefined();
  });

  it('records a conflict instead of replacing a dangling authoritative pointer', async () => {
    const skill = await createSkill('dangling-pointer');
    const danglingVersionId = new Types.ObjectId();
    await MongoAgentSkills.updateOne(
      { _id: skill._id },
      { $set: { currentVersionId: danglingVersionId } }
    );
    await MongoAgentSkillsVersion.create({
      skillId: skill._id,
      tmbId,
      version: 0,
      storage: { bucket: 'private', key: 'v0.zip', size: 1 },
      isActive: true,
      isDeleted: false
    });

    const result = await backfillAgentSkillsPhase1();
    const [updatedSkill, checkpoint] = await Promise.all([
      MongoAgentSkills.findById(skill._id).lean(),
      MongoAgentSkillMigrationCheckpoint.findOne({ resourceId: skill._id }).lean()
    ]);

    expect(result.conflicts).toBe(1);
    expect(String(updatedSkill?.currentVersionId)).toBe(String(danglingVersionId));
    expect(checkpoint?.reason).toBe('dangling_current_version');
  });
});
