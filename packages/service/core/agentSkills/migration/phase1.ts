import { Types, type ClientSession } from '../../../common/mongo';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import type { AgentSkillsVersionSchemaType } from '@fastgpt/global/core/agentSkills/type';
import { getLogger, LogCategories } from '../../../common/logger';
import {
  AgentSkillSchemaVersion,
  AgentSkillTypeEnum,
  agentSkillsCollectionName
} from '@fastgpt/global/core/agentSkills/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '../../app/schema';
import { MongoResourcePermission } from '../../../support/permission/schema';
import { probeSkillPackageExists, type SkillStorageInfo } from '../storage';
import { MongoAgentSkills } from '../schema';
import { recordAgentSkillMigrationConflict, recordAgentSkillOperation } from '../observability';
import { setCurrentVersion } from '../version/current';
import { MongoAgentSkillsVersion } from '../version/schema';
import { MongoAgentSkillMigrationCheckpoint } from './schema';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.MIGRATION);
export const AgentSkillPhase1MigrationKey = 'agent-skills-phase1-v2';

export type AgentSkillPhase1AuditIssueKind =
  | 'multiple_legacy_active_versions'
  | 'no_legacy_active_version'
  | 'dangling_current_version'
  | 'main_version_number_mismatch'
  | 'main_version_storage_mismatch'
  | 'runtime_skills_mismatch'
  | 'missing_storage_object'
  | 'storage_check_failed'
  | 'orphan_permission'
  | 'dangling_app_reference'
  | 'version_compatibility_conflict';

export type AgentSkillPhase1AuditIssue = {
  kind: AgentSkillPhase1AuditIssueKind;
  resourceId: string;
  relatedId?: string;
  detail?: Record<string, string | number | boolean | null>;
};

export type AgentSkillPhase1AuditReport = {
  migrationKey: typeof AgentSkillPhase1MigrationKey;
  dryRun: true;
  scannedSkills: number;
  scannedVersions: number;
  scannedPermissions: number;
  scannedApps: number;
  nextCursor?: string;
  issues: AgentSkillPhase1AuditIssue[];
  counts: Partial<Record<AgentSkillPhase1AuditIssueKind, number>>;
};

type StorageExists = (storage: SkillStorageInfo) => Promise<boolean>;

function addIssue(report: AgentSkillPhase1AuditReport, issue: AgentSkillPhase1AuditIssue) {
  report.issues.push(issue);
  report.counts[issue.kind] = (report.counts[issue.kind] ?? 0) + 1;
  recordAgentSkillMigrationConflict(issue.kind);
}

function getVersionCompatibilityConflict(
  version: AgentSkillsVersionSchemaType
): string | undefined {
  if (version.schemaVersion != null && version.schemaVersion > AgentSkillSchemaVersion)
    return 'unsupported_version_schema';
  if (version.storageKey !== undefined && version.storageKey !== version.storage.key)
    return 'version_storage_key_conflict';
  if (!version.isDeleted && (version.deleteTime != null || version.storageDeletedAt != null))
    return 'version_deletion_state_conflict';
}

function equalRuntimeSkills(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function extractSkillIdsFromModules(modules: unknown): string[] {
  if (!Array.isArray(modules)) return [];
  const ids = new Set<string>();

  for (const workflowModule of modules) {
    if (!workflowModule || typeof workflowModule !== 'object' || !('inputs' in workflowModule)) {
      continue;
    }
    const inputs = workflowModule.inputs;
    if (!Array.isArray(inputs)) continue;

    for (const input of inputs) {
      if (!input || typeof input !== 'object' || !('key' in input) || !('value' in input)) {
        continue;
      }
      if (input.key !== NodeInputKeyEnum.skills || !Array.isArray(input.value)) continue;

      for (const value of input.value) {
        if (typeof value === 'string') {
          ids.add(value);
        } else if (value && typeof value === 'object' && 'skillId' in value) {
          const skillId = value.skillId;
          if (typeof skillId === 'string') ids.add(skillId);
        }
      }
    }
  }

  return [...ids];
}

async function auditGlobalReferences(report: AgentSkillPhase1AuditReport) {
  const orphanPermissions = await MongoResourcePermission.aggregate([
    {
      $match: {
        resourceType: PerResourceTypeEnum.agentSkill,
        resourceId: { $exists: true }
      }
    },
    {
      $lookup: {
        from: agentSkillsCollectionName,
        localField: 'resourceId',
        foreignField: '_id',
        as: 'skill'
      }
    },
    { $match: { skill: { $size: 0 } } },
    { $project: { _id: 1, resourceId: 1 } }
  ]);
  report.scannedPermissions = await MongoResourcePermission.countDocuments({
    resourceType: PerResourceTypeEnum.agentSkill,
    resourceId: { $exists: true }
  });
  for (const permission of orphanPermissions) {
    addIssue(report, {
      kind: 'orphan_permission',
      resourceId: String(permission.resourceId),
      relatedId: String(permission._id)
    });
  }

  const apps = await MongoApp.find(
    { 'modules.inputs.key': NodeInputKeyEnum.skills },
    { _id: 1, modules: 1 }
  ).lean();
  report.scannedApps = apps.length;
  const appReferences = apps.flatMap((app) =>
    extractSkillIdsFromModules(app.modules).map((skillId) => ({
      appId: String(app._id),
      skillId
    }))
  );
  const validObjectIds = appReferences
    .map((item) => item.skillId)
    .filter((skillId) => Types.ObjectId.isValid(skillId));
  const existingSkills = await MongoAgentSkills.find(
    { _id: { $in: validObjectIds }, deleteTime: null },
    { _id: 1 }
  ).lean();
  const existingIds = new Set(existingSkills.map((skill) => String(skill._id)));

  for (const reference of appReferences) {
    if (!existingIds.has(reference.skillId)) {
      addIssue(report, {
        kind: 'dangling_app_reference',
        resourceId: reference.skillId,
        relatedId: reference.appId
      });
    }
  }
}

export async function auditAgentSkillsPhase1({
  cursor,
  batchSize = 100,
  storageExists = probeSkillPackageExists,
  includeGlobalReferences = cursor === undefined
}: {
  cursor?: string;
  batchSize?: number;
  storageExists?: StorageExists;
  includeGlobalReferences?: boolean;
} = {}): Promise<AgentSkillPhase1AuditReport> {
  const boundedBatchSize = Math.min(Math.max(batchSize, 1), 500);
  const skills = await MongoAgentSkills.find({
    type: AgentSkillTypeEnum.skill,
    deleteTime: null,
    ...(cursor ? { _id: { $gt: cursor } } : {})
  })
    .sort({ _id: 1 })
    .limit(boundedBatchSize)
    .lean();
  const report: AgentSkillPhase1AuditReport = {
    migrationKey: AgentSkillPhase1MigrationKey,
    dryRun: true,
    scannedSkills: skills.length,
    scannedVersions: 0,
    scannedPermissions: 0,
    scannedApps: 0,
    issues: [],
    counts: {}
  };

  for (const skill of skills) {
    const skillId = String(skill._id);
    const versions = await MongoAgentSkillsVersion.find({ skillId }).lean();
    const liveVersions = versions.filter((version) => !version.isDeleted);
    const legacyActiveVersions = liveVersions.filter((version) => version.isActive);
    report.scannedVersions += versions.length;
    for (const version of versions) {
      const reason = getVersionCompatibilityConflict(version);
      if (reason)
        addIssue(report, {
          kind: 'version_compatibility_conflict',
          resourceId: skillId,
          relatedId: String(version._id),
          detail: { reason }
        });
    }

    if (!skill.currentVersionId) {
      if (legacyActiveVersions.length === 0) {
        addIssue(report, { kind: 'no_legacy_active_version', resourceId: skillId });
      } else if (legacyActiveVersions.length > 1) {
        addIssue(report, {
          kind: 'multiple_legacy_active_versions',
          resourceId: skillId,
          detail: { count: legacyActiveVersions.length }
        });
      }
    } else {
      const currentVersion = liveVersions.find(
        (version) => String(version._id) === String(skill.currentVersionId)
      );
      if (!currentVersion) {
        addIssue(report, {
          kind: 'dangling_current_version',
          resourceId: skillId,
          relatedId: String(skill.currentVersionId)
        });
      } else {
        if (skill.currentVersion !== currentVersion.version) {
          addIssue(report, {
            kind: 'main_version_number_mismatch',
            resourceId: skillId,
            relatedId: String(currentVersion._id)
          });
        }
        if (skill.currentStorage?.key !== currentVersion.storage.key) {
          addIssue(report, {
            kind: 'main_version_storage_mismatch',
            resourceId: skillId,
            relatedId: String(currentVersion._id)
          });
        }
        if (!equalRuntimeSkills(skill.currentRuntimeSkills, currentVersion.runtimeSkills)) {
          addIssue(report, {
            kind: 'runtime_skills_mismatch',
            resourceId: skillId,
            relatedId: String(currentVersion._id)
          });
        }
      }
    }

    await Promise.all(
      liveVersions.map(async (version) => {
        try {
          if (!(await storageExists(version.storage))) {
            addIssue(report, {
              kind: 'missing_storage_object',
              resourceId: skillId,
              relatedId: String(version._id),
              detail: { storageKey: version.storage.key }
            });
          }
        } catch {
          addIssue(report, {
            kind: 'storage_check_failed',
            resourceId: skillId,
            relatedId: String(version._id)
          });
        }
      })
    );
  }

  if (includeGlobalReferences) await auditGlobalReferences(report);
  if (skills.length === boundedBatchSize) {
    report.nextCursor = String(skills.at(-1)?._id);
  }

  logger.info('Completed Agent Skill Phase 1 dry-run audit batch', {
    cursor,
    nextCursor: report.nextCursor,
    scannedSkills: report.scannedSkills,
    scannedVersions: report.scannedVersions,
    issueCount: report.issues.length,
    counts: report.counts
  });
  recordAgentSkillOperation({ operation: 'phase1_audit', status: 'ok' });
  return report;
}

async function writeCheckpoint({
  resourceId,
  status,
  reason,
  versionId,
  session
}: {
  resourceId: string;
  status: 'completed' | 'conflict';
  reason?: string;
  versionId?: string;
  session?: ClientSession;
}) {
  await MongoAgentSkillMigrationCheckpoint.updateOne(
    { migrationKey: AgentSkillPhase1MigrationKey, resourceId },
    {
      $set: { status, reason, versionId, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
      $inc: { attemptCount: 1 }
    },
    { upsert: true, session }
  );
}

export type AgentSkillPhase1BackfillResult = {
  migrationKey: typeof AgentSkillPhase1MigrationKey;
  scanned: number;
  updated: number;
  skipped: number;
  conflicts: number;
  nextCursor?: string;
};

export async function backfillAgentSkillsPhase1({
  cursor,
  batchSize = 100
}: {
  cursor?: string;
  batchSize?: number;
} = {}): Promise<AgentSkillPhase1BackfillResult> {
  const boundedBatchSize = Math.min(Math.max(batchSize, 1), 500);
  const skills = await MongoAgentSkills.find({
    type: AgentSkillTypeEnum.skill,
    deleteTime: null,
    ...(cursor ? { _id: { $gt: cursor } } : {})
  })
    .sort({ _id: 1 })
    .limit(boundedBatchSize)
    .lean();
  const result: AgentSkillPhase1BackfillResult = {
    migrationKey: AgentSkillPhase1MigrationKey,
    scanned: skills.length,
    updated: 0,
    skipped: 0,
    conflicts: 0
  };

  for (const scanned of skills) {
    const skillId = String(scanned._id);
    const outcome = await mongoSessionRun(async (session) => {
      const skill = await MongoAgentSkills.findOne(
        { _id: skillId, type: AgentSkillTypeEnum.skill, deleteTime: null },
        undefined,
        { session }
      ).lean();
      if (!skill) return 'skipped' as const;
      const completed = await MongoAgentSkillMigrationCheckpoint.exists({
        migrationKey: AgentSkillPhase1MigrationKey,
        resourceId: skillId,
        status: 'completed'
      }).session(session);
      if (completed) return 'skipped' as const;

      const allVersions = await MongoAgentSkillsVersion.find({ skillId }, undefined, {
        session
      }).lean();
      const versions = allVersions.filter((version) => !version.isDeleted);
      const activeVersions = versions.filter((version) => version.isActive);
      const candidates = skill.currentVersionId
        ? versions.filter((version) => String(version._id) === String(skill.currentVersionId))
        : activeVersions.length
          ? activeVersions
          : versions.filter(
              (version) =>
                version.version === skill.currentVersion &&
                (!skill.currentStorage || version.storage.key === skill.currentStorage.key)
            );
      const reason =
        allVersions.map(getVersionCompatibilityConflict).find(Boolean) ??
        (candidates.length === 1
          ? undefined
          : skill.currentVersionId
            ? 'dangling_current_version'
            : candidates.length > 1
              ? 'multiple_current_candidates'
              : 'no_current_candidate');
      if (reason) {
        await writeCheckpoint({ resourceId: skillId, status: 'conflict', reason, session });
        recordAgentSkillMigrationConflict(reason);
        return 'conflicts' as const;
      }

      for (const version of allVersions) {
        const fields = {
          schemaVersion: AgentSkillSchemaVersion,
          ...(version.storageKey === undefined ? { storageKey: version.storage.key } : {}),
          ...(version.runtimeSkills === undefined ? { runtimeSkills: [] } : {}),
          ...(version.createdBy === undefined ? { createdBy: version.tmbId } : {}),
          ...(version.isDeleted && !version.deleteTime ? { deleteTime: new Date() } : {})
        };
        const updated = await MongoAgentSkillsVersion.updateOne(
          { _id: version._id, skillId },
          { $set: fields, $inc: { __v: 1 } },
          { session }
        );
        if (updated.matchedCount !== 1) throw new Error('skill_migration_version_conflict');
      }
      const targetVersion = candidates[0];
      await setCurrentVersion({
        skillId,
        versionId: String(targetVersion._id),
        expectedCurrentVersionId: skill.currentVersionId ? String(skill.currentVersionId) : null,
        session
      });
      await writeCheckpoint({
        resourceId: skillId,
        status: 'completed',
        versionId: String(targetVersion._id),
        session
      });
      return skill.currentVersionId ? ('skipped' as const) : ('updated' as const);
    });
    result[outcome] += 1;
  }

  if (skills.length === boundedBatchSize) result.nextCursor = String(skills.at(-1)?._id);
  logger.info('Completed Agent Skill Phase 1 backfill batch', result);
  recordAgentSkillOperation({ operation: 'phase1_backfill', status: 'ok' });
  return result;
}
