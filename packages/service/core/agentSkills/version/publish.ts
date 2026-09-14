import { Types } from '../../../common/mongo';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { UserError } from '@fastgpt/global/common/error/utils';
import { validateAndNormalizeSkillPackage } from '../packageValidator';
import { finalizeStagedSkillPackage, stageSkillPackage } from '../storage';
import { createVersion, getNextVersionNumber } from './controller';
import { setCurrentVersion } from './current';
import { MongoSandboxInstance } from '../../ai/sandbox/schema';

export type PublishSkillPackageParams = {
  teamId: string;
  tmbId: string;
  skillId: string;
  expectedCurrentVersionId: string | null;
  packageBuffer: Buffer;
  versionName?: string;
  workspace?: {
    instanceId: string;
    sandboxId: string;
    operationId: string;
    generation?: string;
    expectedBaseVersionId: string | null;
    assertActive: () => Promise<void>;
    markExternalEffect: () => Promise<void>;
  };
  importSource?: {
    originalFilename: string;
    importedAt: Date;
  };
};

export type PublishSkillPackageResult = {
  versionId: string;
  version: number;
  versionName: string;
  storage: {
    bucket: string;
    key: string;
    size: number;
  };
  createdAt: string;
};

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export async function publishSkillPackage(
  params: PublishSkillPackageParams
): Promise<PublishSkillPackageResult> {
  const validated = await validateAndNormalizeSkillPackage(params.packageBuffer);
  const versionId = new Types.ObjectId().toHexString();
  await params.workspace?.markExternalEffect();
  const storage = await stageSkillPackage({
    teamId: params.teamId,
    skillId: params.skillId,
    versionId,
    zipBuffer: validated.zipBuffer,
    checksum: validated.contentHash
  });

  try {
    return await mongoSessionRun(async (session) => {
      await params.workspace?.assertActive();
      const version = await getNextVersionNumber(params.skillId, session);
      const versionName = params.versionName || `v${version}`;
      const createdAt = new Date();

      await createVersion(
        {
          versionId,
          skillId: params.skillId,
          tmbId: params.tmbId,
          version,
          versionName,
          storage,
          runtimeSkills: validated.runtimeSkills,
          contentHash: validated.contentHash,
          importSource: params.importSource
        },
        session
      );
      await setCurrentVersion({
        skillId: params.skillId,
        versionId,
        expectedCurrentVersionId: params.expectedCurrentVersionId,
        session
      });
      if (params.workspace) {
        const workspace = params.workspace;
        const result = await MongoSandboxInstance.updateOne(
          {
            _id: workspace.instanceId,
            sandboxId: workspace.sandboxId,
            status: 'provisioning',
            deleteTime: null,
            baseVersionId: workspace.expectedBaseVersionId,
            workspaceGeneration: workspace.generation ?? { $exists: false },
            'operation.id': workspace.operationId,
            'operation.type': 'publish',
            'operation.checkpoint': 'package_ready',
            'operation.error': { $exists: false }
          },
          {
            $set: {
              baseVersionId: versionId,
              currentDeploymentHash: validated.contentHash,
              status: 'running',
              lastActiveAt: createdAt,
              'operation.checkpoint': 'ready',
              'operation.failureDisposition': 'retryable',
              'operation.updatedAt': createdAt
            }
          },
          { session }
        );
        if (result.matchedCount !== 1) throw new UserError('workspace_conflict');
      }
      await finalizeStagedSkillPackage(storage, session);
      await params.workspace?.assertActive();

      return {
        versionId,
        version,
        versionName,
        storage: {
          bucket: storage.bucket,
          key: storage.key,
          size: storage.size
        },
        createdAt: createdAt.toISOString()
      };
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new UserError(SkillErrEnum.versionConflict);
    }
    throw error;
  }
}
