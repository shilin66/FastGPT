import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoS3TTL } from '@fastgpt/service/common/s3/models/ttl';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import {
  getEditWorkspaceState,
  publishEditWorkspace,
  resetEditWorkspace
} from '@fastgpt/service/core/agentSkills/editWorkspace/service';
import { createSkillPackage } from '@fastgpt/service/core/agentSkills/zipBuilder';
import * as skillStorage from '@fastgpt/service/core/agentSkills/storage';
import type { SandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';

type ExportParams = { assertActive: SandboxLease['assertOwned'] };
type UploadParams = { key: string; body: Buffer };

vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const mocks = vi.hoisted(() => ({
  export: vi.fn<(params: ExportParams) => Promise<Buffer>>(),
  upload: vi.fn<(params: UploadParams) => Promise<void>>(),
  objects: new Map<string, Buffer>(),
  held: new Set<string>()
}));

vi.mock('@fastgpt/service/core/agentSkills/sandboxController', () => ({
  packageSkillInSandbox: mocks.export
}));
vi.mock('@fastgpt/service/common/s3/buckets/private', () => ({
  S3PrivateBucket: class {
    bucketName = 'fastgpt-private';
    client = { uploadObject: mocks.upload };
  }
}));
vi.mock('@fastgpt/service/core/ai/sandbox/lease', async (original: <T>() => Promise<T>) => ({
  ...(await original<typeof import('@fastgpt/service/core/ai/sandbox/lease')>()),
  withSandboxLease: async (key: string, run: (lease: SandboxLease) => Promise<unknown>) => {
    if (mocks.held.has(key)) throw new Error('operation_conflict');
    mocks.held.add(key);
    try {
      return await run({
        token: 'publish-fault-lease',
        assertOwned: async () => {
          if (!mocks.held.has(key)) throw new Error('lease lost');
        },
        setHeartbeat: () => {}
      });
    } finally {
      mocks.held.delete(key);
    }
  }
}));

describe('publishEditWorkspace external failures preserve draft recovery', () => {
  const teamId = new Types.ObjectId().toHexString();
  const tmbId = new Types.ObjectId().toHexString();
  let skillId: string;
  let baseVersionId: string;
  let currentVersionId: string;
  let instanceId: string;
  let packageBuffer: Buffer;

  const publish = () =>
    publishEditWorkspace({
      skillId,
      teamId,
      tmbId,
      expectedBaseVersionId: baseVersionId,
      expectedCurrentVersionId: currentVersionId
    });
  const readPersistence = async () => ({
    skill: await MongoAgentSkills.findById(skillId)
      .select('currentVersionId currentVersion currentStorage currentRuntimeSkills versionCount')
      .lean(),
    versions: await MongoAgentSkillsVersion.find({ skillId }).sort({ version: 1 }).lean(),
    workspace: await MongoSandboxInstance.findById(instanceId)
      .select(
        'baseVersionId provider sandboxId metadata storage workspaceGeneration currentDeploymentHash'
      )
      .lean()
  });
  const expectRecoveryRequired = async () => {
    const failed = await MongoSandboxInstance.findById(instanceId).lean();
    expect(failed).toMatchObject({
      status: 'failed',
      operation: {
        id: 'publish-fault-lease',
        type: 'publish',
        checkpoint: 'package_ready',
        failureDisposition: 'unknown',
        error: { code: 'workspace_publish_failed' }
      }
    });
    expect(await getEditWorkspaceState({ skillId, teamId, currentVersionId })).toMatchObject({
      status: 'failed',
      baseVersionId,
      currentVersionId,
      resetAvailable: false,
      resetUnavailableReason: 'recovery_required',
      operation: { failureDisposition: 'unknown' }
    });
    await expect(publish()).rejects.toThrow('workspace_not_running');
    await expect(
      resetEditWorkspace({
        skillId,
        teamId,
        expectedBaseVersionId: baseVersionId,
        expectedCurrentVersionId: currentVersionId,
        expectedOperationId: 'publish-fault-lease',
        confirmDiscard: true
      })
    ).rejects.toThrow('workspace_reset_unavailable');
    expect(await MongoSandboxInstance.findById(instanceId).lean()).toEqual(failed);
    expect(mocks.export).toHaveBeenCalledOnce();
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.held.size).toBe(0);
  };
  const expectCandidateTTL = async () => {
    const key = mocks.upload.mock.calls[0][0].key;
    const records = await MongoS3TTL.find({ bucketName: 'fastgpt-private' }).lean();
    expect(records).toHaveLength(1);
    expect(records[0].minioKey).toBe(key);
    expect(records[0].expiredTime.getTime()).toBeGreaterThan(Date.now());
    return key;
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    mocks.export.mockReset();
    mocks.upload.mockReset();
    mocks.objects.clear();
    mocks.held.clear();
    const skill = await MongoAgentSkills.create({
      source: 'personal',
      name: 'Draft',
      author: '',
      description: '',
      category: [],
      config: {},
      teamId,
      tmbId
    });
    skillId = String(skill._id);
    const versions = await MongoAgentSkillsVersion.create(
      [0, 1].map((version) => ({
        skillId,
        tmbId,
        version,
        storage: { bucket: 'fastgpt-private', key: `published-v${version}.zip`, size: 1 }
      }))
    );
    baseVersionId = String(versions[0]._id);
    currentVersionId = String(versions[1]._id);
    await MongoAgentSkills.updateOne(
      { _id: skillId },
      {
        currentVersionId,
        currentVersion: 1,
        currentStorage: versions[1].storage,
        currentRuntimeSkills: [],
        versionCount: 2
      }
    );
    const instance = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: `publish-fault-${skillId}`,
      status: 'running',
      sourceType: 'skillEdit',
      sourceId: skillId,
      teamId,
      runtimeUserId: 'skillEdit',
      sessionId: 'edit-debug',
      baseVersionId,
      workspaceGeneration: 'original-generation',
      currentDeploymentHash: 'original-deployment-hash',
      operation: {
        id: 'initialized',
        type: 'editInitialize',
        checkpoint: 'ready',
        failureDisposition: 'retryable',
        startedAt: new Date(),
        updatedAt: new Date()
      },
      metadata: {
        sandboxType: 'edit-debug',
        skillId,
        teamId,
        workspaceRoot: '/workspace/edit',
        providerSandboxId: 'original-provider',
        volumeEnabled: true
      },
      storage: {
        mountPath: '/workspace',
        volumes: [{ name: 'workspace', mountPath: '/workspace', claimName: 'original-volume' }]
      }
    });
    instanceId = String(instance._id);
    packageBuffer = await createSkillPackage({
      name: 'draft',
      skillMd: '---\nname: draft\ndescription: Updated draft\n---\n'
    });
    mocks.export.mockImplementation(async ({ assertActive }: ExportParams) => {
      await assertActive();
      return packageBuffer;
    });
    mocks.upload.mockImplementation(async ({ key, body }: UploadParams) => {
      expect(mocks.held.has(`skill-edit-init:${skillId}`)).toBe(true);
      expect(
        await MongoS3TTL.exists({ bucketName: 'fastgpt-private', minioKey: key })
      ).not.toBeNull();
      mocks.objects.set(key, body);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['before object storage', 'after object storage'] as const)(
    'preserves both distinct pointers and the draft identity when staging fails %s',
    async (boundary: 'before object storage' | 'after object storage') => {
      const before = await readPersistence();
      const upload = mocks.upload.getMockImplementation()!;
      mocks.upload.mockImplementationOnce(async (params: UploadParams) => {
        if (boundary === 'after object storage') await upload(params);
        throw new Error('S3 staging response failed');
      });

      await expect(publish()).rejects.toThrow('S3 staging response failed');

      const candidateKey = await expectCandidateTTL();
      expect(mocks.objects.has(candidateKey)).toBe(boundary === 'after object storage');
      await expectRecoveryRequired();
      expect(await readPersistence()).toEqual(before);
    }
  );

  it('rolls back version, current, baseline and TTL deletion when finalization throws inside the transaction', async () => {
    const before = await readPersistence();
    const finalize = skillStorage.finalizeStagedSkillPackage;
    const finalizeFault = vi
      .spyOn(skillStorage, 'finalizeStagedSkillPackage')
      .mockImplementation(async (...[storage, session]: Parameters<typeof finalize>) => {
        expect(session?.inTransaction()).toBe(true);
        if (!session) throw new Error('Expected a real Mongo transaction');
        const candidate = await MongoAgentSkillsVersion.findOne({
          skillId,
          'storage.key': storage.key
        })
          .session(session)
          .lean();
        expect(candidate).not.toBeNull();
        expect(String(candidate?._id)).not.toBe(currentVersionId);
        const skill = await MongoAgentSkills.findById(skillId).session(session).lean();
        const workspace = await MongoSandboxInstance.findById(instanceId).session(session).lean();
        expect(String(skill?.currentVersionId)).toBe(String(candidate?._id));
        expect(String(workspace?.baseVersionId)).toBe(String(candidate?._id));
        expect(workspace?.operation?.checkpoint).toBe('ready');
        await finalize(storage, session);
        expect(
          await MongoS3TTL.findOne({ bucketName: storage.bucket, minioKey: storage.key })
            .session(session)
            .lean()
        ).toBeNull();
        throw new Error('TTL finalization failed');
      });

    await expect(publish()).rejects.toThrow('TTL finalization failed');

    expect(finalizeFault).toHaveBeenCalled();
    const candidateKey = await expectCandidateTTL();
    expect(mocks.objects.has(candidateKey)).toBe(true);
    await expectRecoveryRequired();
    expect(await readPersistence()).toEqual(before);
  });

  it('commits the published version and both pointers together, removing only its candidate TTL', async () => {
    const before = await readPersistence();
    const unrelatedTTL = await MongoS3TTL.create({
      bucketName: 'fastgpt-private',
      minioKey: `unrelated-candidate/${skillId}.zip`,
      expiredTime: new Date(Date.now() + 86_400_000)
    });

    const result = await publish();

    const after = await readPersistence();
    const version = await MongoAgentSkillsVersion.findById(result.versionId).lean();
    expect(version).not.toBeNull();
    expect(result.version).toBe(2);
    expect(String(after.skill?.currentVersionId)).toBe(result.versionId);
    expect(String(after.workspace?.baseVersionId)).toBe(result.versionId);
    expect(String(version?._id)).toBe(result.versionId);
    expect(after.skill?.currentStorage).toEqual(result.storage);
    expect(after.skill?.currentRuntimeSkills).toEqual(version?.runtimeSkills);
    expect(after.versions).toHaveLength(3);
    expect(after.versions.slice(0, 2)).toEqual(before.versions);
    expect(after.workspace).toEqual({
      ...before.workspace,
      baseVersionId: result.versionId,
      currentDeploymentHash: version?.contentHash
    });
    expect(result.workspace).toMatchObject({
      status: 'running',
      baseVersionId: result.versionId,
      currentVersionId: result.versionId,
      generation: 'original-generation',
      stale: false,
      resetAvailable: true,
      operation: { checkpoint: 'ready', failureDisposition: 'retryable' }
    });
    expect(version?.contentHash).toMatch(/^[a-f\d]{64}$/);
    expect(mocks.objects.has(result.storage.key)).toBe(true);
    const remainingTTL = await MongoS3TTL.find({}).lean();
    expect(remainingTTL).toHaveLength(1);
    expect(String(remainingTTL[0]._id)).toBe(String(unrelatedTTL._id));
    expect(remainingTTL[0].minioKey).toBe(unrelatedTTL.minioKey);
    expect(mocks.held.size).toBe(0);
  });
});
