import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import {
  createEditDebugSandbox,
  deleteSandbox,
  deleteSkillRelatedSandboxes,
  packageSkillInSandbox
} from '@fastgpt/service/core/agentSkills/sandboxController';
import { getSandboxDefaults } from '@fastgpt/service/core/agentSkills/sandboxConfig';
import { generateSandboxIdentityId } from '@fastgpt/service/core/ai/sandbox/identity';
import { createSkillPackage } from '@fastgpt/service/core/agentSkills/zipBuilder';
import {
  AgentSkillCreationStatusEnum,
  AgentSkillSourceEnum,
  SandboxProtocolEnum,
  SandboxTypeEnum
} from '@fastgpt/global/core/agentSkills/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import type { SandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';

const {
  downloadMock,
  getClientMock,
  getExistingClientMock,
  executeMock,
  writeMock,
  quotaEnv,
  leaseKeys,
  leaseAssertMock,
  setHeartbeatMock,
  endpointReadyMock,
  deleteClientMock,
  readMock,
  initializeWorkspaceMock,
  exportWorkspaceMock,
  connectExistingMock
} = vi.hoisted(() => ({
  downloadMock: vi.fn(),
  getClientMock: vi.fn(),
  getExistingClientMock: vi.fn(),
  executeMock: vi.fn(),
  writeMock: vi.fn(),
  leaseKeys: new Set<string>(),
  leaseAssertMock: vi.fn(),
  setHeartbeatMock: vi.fn<(heartbeat?: () => Promise<boolean>) => void>(),
  endpointReadyMock: vi.fn(),
  deleteClientMock: vi.fn(),
  readMock: vi.fn(),
  initializeWorkspaceMock: vi.fn(),
  exportWorkspaceMock: vi.fn(),
  connectExistingMock: vi.fn(),
  quotaEnv: { AGENT_SANDBOX_MAX_EDIT_DEBUG: undefined as number | undefined }
}));

vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/env')>();
  return {
    env: {
      ...original.env,
      AGENT_SANDBOX_PROVIDER: 'opensandbox',
      AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://sandbox.example.test:8090',
      get AGENT_SANDBOX_MAX_EDIT_DEBUG() {
        return quotaEnv.AGENT_SANDBOX_MAX_EDIT_DEBUG;
      }
    }
  };
});
vi.mock('@fastgpt/service/core/agentSkills/storage', () => ({
  downloadSkillPackage: downloadMock
}));
vi.mock('@fastgpt/service/core/agentSkills/sandboxWorkspace', () => ({
  initializeEditSandboxWorkspace: initializeWorkspaceMock,
  exportEditSandboxWorkspace: exportWorkspaceMock
}));
vi.mock('@fastgpt/service/core/ai/sandbox/controller', () => ({
  getSandboxClient: getClientMock,
  getExistingSandboxClient: getExistingClientMock
}));
vi.mock('@fastgpt/service/core/ai/sandbox/lease', () => ({
  withSandboxLease: async (key: string, run: (lease: SandboxLease) => Promise<unknown>) => {
    if (leaseKeys.has(key)) throw new Error('operation_conflict');
    leaseKeys.add(key);
    try {
      return await run({
        token: 'test-lease',
        assertOwned: leaseAssertMock,
        setHeartbeat: setHeartbeatMock
      });
    } finally {
      leaseKeys.delete(key);
    }
  }
}));
vi.mock('@fastgpt/service/core/agentSkills/sandboxConfig', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@fastgpt/service/core/agentSkills/sandboxConfig')>();
  return {
    ...original,
    waitForSkillEditorReady: endpointReadyMock
  };
});

describe('Skill Edit workspace capacity', () => {
  const teamId = new Types.ObjectId().toHexString();
  const tmbId = new Types.ObjectId().toHexString();
  const endpoint = {
    host: 'sandbox.example.test',
    port: 44772,
    protocol: SandboxProtocolEnum.http,
    url: 'http://sandbox.example.test:44772'
  };
  let skillId: string;
  let previousFeConfigs: typeof global.feConfigs;

  beforeEach(async () => {
    vi.clearAllMocks();
    leaseKeys.clear();
    leaseAssertMock.mockResolvedValue(undefined);
    executeMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    writeMock.mockResolvedValue(undefined);
    endpointReadyMock.mockResolvedValue(undefined);
    readMock.mockResolvedValue([{ content: 'package-content' }]);
    connectExistingMock.mockResolvedValue(true);
    exportWorkspaceMock.mockResolvedValue(Buffer.from('package-content'));
    initializeWorkspaceMock.mockImplementation(async ({ provider, assertActive }) => {
      await assertActive();
      await provider.writeFiles([{ path: '/trusted-staging/package.zip', data: new Uint8Array() }]);
      await assertActive();
      const result = await provider.execute('initialize-atomic-edit-workspace');
      if (result.exitCode !== 0) throw new Error('Failed to initialize Edit workspace');
    });
    deleteClientMock.mockImplementation(async (sandboxId: string) =>
      MongoSandboxInstance.deleteOne({ sandboxId })
    );
    quotaEnv.AGENT_SANDBOX_MAX_EDIT_DEBUG = undefined;
    previousFeConfigs = global.feConfigs;
    global.feConfigs = { ...global.feConfigs, limit: {} };

    const packageBuffer = await createSkillPackage({
      name: 'capacity-test',
      skillMd: '---\nname: capacity-test\ndescription: Edit workspace capacity regression\n---\n'
    });
    downloadMock.mockResolvedValue(packageBuffer);

    const skill = await MongoAgentSkills.create({
      teamId,
      tmbId,
      name: 'capacity-test',
      source: AgentSkillSourceEnum.personal,
      creationStatus: AgentSkillCreationStatusEnum.ready
    });
    skillId = String(skill._id);
    const version = await MongoAgentSkillsVersion.create({
      skillId,
      tmbId,
      version: 0,
      storage: { bucket: 'private', key: 'capacity-test.zip', size: packageBuffer.length }
    });
    await MongoAgentSkills.updateOne({ _id: skillId }, { currentVersionId: version._id });
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: new Types.ObjectId().toHexString(),
      status: SandboxStatusEnum.running,
      metadata: { sandboxType: SandboxTypeEnum.editDebug }
    });

    getClientMock.mockImplementation(
      async (
        { sandboxId }: { sandboxId: string },
        options?: { identity?: Record<string, string>; workspaceRoot?: string }
      ) => {
        await MongoSandboxInstance.updateOne(
          { provider: 'opensandbox', sandboxId },
          {
            $setOnInsert: {
              ...options?.identity,
              ...(options?.workspaceRoot ? { 'metadata.workspaceRoot': options.workspaceRoot } : {})
            },
            $set: {
              status: SandboxStatusEnum.running,
              'metadata.volumeEnabled': true,
              operation: {
                id: new Types.ObjectId().toHexString(),
                type: 'start',
                checkpoint: 'ready',
                startedAt: new Date(),
                updatedAt: new Date()
              }
            }
          },
          { upsert: true }
        );
        return {
          provider: {
            provider: 'opensandbox',
            getInfo: async () => ({
              id: `provider-${sandboxId}`,
              image: { repository: 'test-image', tag: 'latest' },
              createdAt: new Date(),
              status: { state: 'Running' }
            }),
            writeFiles: writeMock,
            readFiles: readMock,
            execute: executeMock,
            getEndpoint: async () => endpoint,
            close: async () => undefined
          },
          delete: async () => deleteClientMock(sandboxId)
        };
      }
    );
    getExistingClientMock.mockImplementation((doc: { sandboxId: string }) => ({
      delete: async () => MongoSandboxInstance.deleteOne({ sandboxId: doc.sandboxId }),
      provider: {
        provider: 'opensandbox',
        connectExisting: connectExistingMock,
        execute: executeMock,
        getInfo: async () => ({ id: `provider-${doc.sandboxId}`, status: { state: 'Running' } }),
        close: async () => undefined
      }
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    global.feConfigs = previousFeConfigs;
    quotaEnv.AGENT_SANDBOX_MAX_EDIT_DEBUG = undefined;
  });

  it('observes the claimed Edit initialization during endpoint wait but not after ready', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const sandboxId = generateSandboxIdentityId({ sourceType: 'skillEdit', sourceId: skillId });
    endpointReadyMock.mockImplementationOnce(async () => {
      const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      expect(before?.operation?.heartbeatAt).toBeInstanceOf(Date);
      expect(before?.operation?.id).not.toBe('test-lease');
      const heartbeat = setHeartbeatMock.mock.calls[0]?.[0];
      expect(heartbeat).toBeTypeOf('function');
      if (!heartbeat) throw new Error('Edit heartbeat was not registered');
      vi.setSystemTime(Date.now() + 10_000);
      expect(await heartbeat()).toBe(true);
      const after = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      expect(after?.operation?.heartbeatAt?.getTime()).toBeGreaterThan(
        before!.operation!.heartbeatAt!.getTime()
      );
      expect(after?.operation?.updatedAt).toEqual(before?.operation?.updatedAt);
      expect(after?.operation?.checkpoint).toBe('endpoint_ready');
      expect(after?.operation?.id).toBe(before?.operation?.id);
    });
    await createEditDebugSandbox({ skillId, teamId, tmbId });
    const completed = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    const heartbeat = setHeartbeatMock.mock.calls[0]?.[0];
    if (!heartbeat) throw new Error('Edit heartbeat was not registered');
    vi.setSystemTime(Date.now() + 10_000);
    expect(await heartbeat()).toBe(false);
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(completed);
  });

  it.each([
    { source: 'frontend config', limit: 0 },
    { source: 'frontend config', limit: 1 },
    { source: 'environment', limit: 0 },
    { source: 'environment', limit: 1 }
  ])('rejects a new workspace at $source quota $limit', async ({ source, limit }) => {
    if (source === 'frontend config') {
      const configuredLimit = { ...global.feConfigs.limit, agentSandboxMaxEditDebug: limit };
      global.feConfigs = { ...global.feConfigs, limit: configuredLimit };
    } else {
      quotaEnv.AGENT_SANDBOX_MAX_EDIT_DEBUG = limit;
    }
    const onProgress = vi.fn();

    await expect(createEditDebugSandbox({ skillId, teamId, tmbId, onProgress })).rejects.toThrow(
      `Active edit-debug sandbox limit reached (1/${limit})`
    );

    expect(getClientMock).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.findOne({ appId: skillId }).lean()).toBeNull();
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'failed' }));
  });

  it.each([
    { source: 'unset', limit: undefined },
    { source: 'frontend config', limit: 2 },
    { source: 'environment', limit: 2 }
  ])('creates a workspace with $source quota $limit', async ({ source, limit }) => {
    if (source === 'frontend config') {
      const configuredLimit = { ...global.feConfigs.limit, agentSandboxMaxEditDebug: limit };
      global.feConfigs = { ...global.feConfigs, limit: configuredLimit };
    } else if (source === 'environment') {
      quotaEnv.AGENT_SANDBOX_MAX_EDIT_DEBUG = limit;
    }
    const onProgress = vi.fn();

    const result = await createEditDebugSandbox({ skillId, teamId, tmbId, onProgress });

    expect(result.status.state).toBe('Running');
    expect(await MongoSandboxInstance.findById(result.sandboxId).lean()).toMatchObject({
      appId: skillId,
      userId: tmbId,
      metadata: { sandboxType: SandboxTypeEnum.editDebug }
    });
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'ready' }));
  });

  it('reuses an existing workspace before checking a zero quota', async () => {
    const created = await createEditDebugSandbox({ skillId, teamId, tmbId });
    const configuredLimit = { ...global.feConfigs.limit, agentSandboxMaxEditDebug: 0 };
    global.feConfigs = { ...global.feConfigs, limit: configuredLimit };
    quotaEnv.AGENT_SANDBOX_MAX_EDIT_DEBUG = 0;

    const reused = await createEditDebugSandbox({ skillId, teamId, tmbId });

    expect(reused.sandboxId).toBe(created.sandboxId);
    expect(reused.status.state).toBe('Running');
    expect(await MongoSandboxInstance.countDocuments({ appId: skillId })).toBe(1);
  });

  it('still reports physical provider capacity failures', async () => {
    const capacityError = new Error('Provider capacity exhausted');
    getClientMock.mockRejectedValueOnce(capacityError);

    await expect(createEditDebugSandbox({ skillId, teamId, tmbId })).rejects.toBe(capacityError);
    expect(await MongoSandboxInstance.findOne({ appId: skillId }).lean()).toBeNull();
  });

  it('uses a stable Skill identity and retains the resource owner across editors', async () => {
    const result = await createEditDebugSandbox({ skillId, teamId, tmbId });
    const otherEditor = new Types.ObjectId().toHexString();
    const reused = await createEditDebugSandbox({ skillId, teamId, tmbId: otherEditor });
    expect(reused.sandboxId).toBe(result.sandboxId);
    const instance = await MongoSandboxInstance.findById(result.sandboxId).lean();
    expect(instance).toMatchObject({
      sandboxId: generateSandboxIdentityId({ sourceType: 'skillEdit', sourceId: skillId }),
      sourceType: 'skillEdit',
      sourceId: skillId,
      runtimeUserId: 'skillEdit',
      sessionId: 'edit-debug'
    });
    expect(String(instance?.teamId)).toBe(teamId);
    expect(String(instance?.ownerTmbId)).toBe(tmbId);
  });

  it('reuses a strictly matching legacy workspace without changing its ID or volume', async () => {
    const legacyId = new Types.ObjectId().toHexString();
    const legacy = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: legacyId,
      appId: skillId,
      userId: tmbId,
      chatId: 'edit-debug',
      storage: {
        volumes: [{ name: 'workspace', claimName: 'existing-volume', mountPath: '/workspace' }]
      },
      metadata: {
        sandboxType: SandboxTypeEnum.editDebug,
        skillId,
        teamId,
        providerSandboxId: `provider-${legacyId}`
      }
    });
    const result = await createEditDebugSandbox({ skillId, teamId, tmbId });
    expect(result.providerSandboxId).toBe(legacyId);
    expect(result.sandboxId).toBe(String(legacy._id));
    expect(await MongoSandboxInstance.findById(legacy._id).lean()).toMatchObject({
      sourceType: 'skillEdit',
      sourceId: skillId,
      storage: { volumes: [{ claimName: 'existing-volume' }] }
    });
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it.each(['team', 'skill', 'provider', 'type', 'duplicate'])(
    'rejects %s legacy ownership conflicts before connecting',
    async (conflict) => {
      const legacy = {
        provider: conflict === 'provider' ? 'sealosdevbox' : 'opensandbox',
        sandboxId: new Types.ObjectId().toHexString(),
        appId: skillId,
        userId: tmbId,
        chatId: 'edit-debug',
        metadata: {
          sandboxType:
            conflict === 'type' ? SandboxTypeEnum.sessionRuntime : SandboxTypeEnum.editDebug,
          skillId: conflict === 'skill' ? new Types.ObjectId().toHexString() : skillId,
          teamId: conflict === 'team' ? new Types.ObjectId().toHexString() : teamId
        }
      };
      await MongoSandboxInstance.create(legacy);
      if (conflict === 'duplicate') {
        await MongoSandboxInstance.create({
          ...legacy,
          sandboxId: new Types.ObjectId().toHexString(),
          userId: new Types.ObjectId().toHexString()
        });
      }
      await expect(createEditDebugSandbox({ skillId, teamId, tmbId })).rejects.toThrow(
        'sandbox_identity'
      );
      expect(getClientMock).not.toHaveBeenCalled();
    }
  );

  it('serializes the full initialization including package deployment', async () => {
    leaseKeys.add(`skill-edit-init:${skillId}`);
    await expect(createEditDebugSandbox({ skillId, teamId, tmbId })).rejects.toThrow(
      'operation_conflict'
    );
    expect(getClientMock).not.toHaveBeenCalled();
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it('preserves a rebuilt workspace after SKILL.md was removed but a draft remains', async () => {
    const created = await createEditDebugSandbox({ skillId, teamId, tmbId });
    await MongoSandboxInstance.updateOne(
      { _id: created.sandboxId },
      { 'metadata.providerSandboxId': 'old-container' }
    );
    downloadMock.mockClear();
    writeMock.mockClear();
    executeMock.mockResolvedValue({ exitCode: 0, stdout: '/workspace/draft.txt\n', stderr: '' });
    await createEditDebugSandbox({ skillId, teamId, tmbId });
    expect(executeMock).toHaveBeenLastCalledWith(
      expect.stringContaining('-mindepth 1 -maxdepth 1')
    );
    expect(downloadMock).not.toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('fails without restoring when workspace inspection fails', async () => {
    const created = await createEditDebugSandbox({ skillId, teamId, tmbId });
    await MongoSandboxInstance.updateOne(
      { _id: created.sandboxId },
      { 'metadata.providerSandboxId': 'old-container' }
    );
    downloadMock.mockClear();
    executeMock.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'Permission denied' });
    await expect(createEditDebugSandbox({ skillId, teamId, tmbId })).rejects.toThrow(
      'Failed to inspect'
    );
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it('does not extract or delete the workspace after losing its initialization lease', async () => {
    writeMock.mockImplementationOnce(async () => {
      leaseAssertMock.mockRejectedValue(new Error('operation_conflict'));
    });
    await expect(createEditDebugSandbox({ skillId, teamId, tmbId })).rejects.toThrow(
      'operation_conflict'
    );
    expect(executeMock).not.toHaveBeenCalled();
    expect(
      await MongoSandboxInstance.findOne({
        sandboxId: generateSandboxIdentityId({ sourceType: 'skillEdit', sourceId: skillId })
      }).lean()
    ).not.toBeNull();
  });

  it.each([true, false])(
    'resumes unfinished initial deployment only when workspace empty is %s',
    async (empty) => {
      const sandboxId = generateSandboxIdentityId({ sourceType: 'skillEdit', sourceId: skillId });
      const pending = await MongoSandboxInstance.create({
        provider: 'opensandbox',
        sandboxId,
        sourceType: 'skillEdit',
        sourceId: skillId,
        teamId,
        ownerTmbId: tmbId,
        runtimeUserId: 'skillEdit',
        sessionId: 'edit-debug',
        metadata: { providerSandboxId: `provider-${sandboxId}` }
      });
      executeMock.mockResolvedValue({
        exitCode: 0,
        stdout: empty ? '' : '/workspace/draft.txt\n',
        stderr: ''
      });
      if (empty) {
        await createEditDebugSandbox({ skillId, teamId, tmbId });
        expect(downloadMock).toHaveBeenCalledOnce();
        expect(writeMock).toHaveBeenCalledOnce();
        const instance = await MongoSandboxInstance.findById(pending._id).lean();
        const skill = await MongoAgentSkills.findById(skillId).lean();
        expect(String(instance?.baseVersionId)).toBe(String(skill?.currentVersionId));
        expect(instance?.currentDeploymentHash).toMatch(/^[0-9a-f]{64}$/);
      } else {
        await expect(createEditDebugSandbox({ skillId, teamId, tmbId })).rejects.toThrow(
          'sandbox_workspace_initialization_incomplete'
        );
        expect(downloadMock).not.toHaveBeenCalled();
        expect(writeMock).not.toHaveBeenCalled();
        expect(executeMock).toHaveBeenCalledOnce();
      }
    }
  );

  it('retains the shared volume flag after successful edit initialization', async () => {
    const created = await createEditDebugSandbox({ skillId, teamId, tmbId });
    expect(await MongoSandboxInstance.findById(created.sandboxId).lean()).toMatchObject({
      metadata: { volumeEnabled: true }
    });
  });

  it('creates a new Edit workspace below the configured persistent root', async () => {
    const workspaceRoot = `${getSandboxDefaults().workDirectory}/edit`;
    const created = await createEditDebugSandbox({ skillId, teamId, tmbId });
    expect(getClientMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceRoot,
        createConfig: expect.objectContaining({
          env: expect.objectContaining({ FASTGPT_WORKDIR: workspaceRoot })
        })
      })
    );
    expect(initializeWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({ workDirectory: workspaceRoot })
    );
    expect(await MongoSandboxInstance.findById(created.sandboxId).lean()).toMatchObject({
      metadata: { workspaceRoot }
    });
  });

  it('keeps the legacy workspace root instead of switching to the new persistent root', async () => {
    const sandboxId = new Types.ObjectId().toHexString();
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId,
      appId: skillId,
      userId: tmbId,
      chatId: 'edit-debug',
      metadata: {
        sandboxType: SandboxTypeEnum.editDebug,
        skillId,
        teamId,
        providerSandboxId: `provider-${sandboxId}`
      }
    });
    await createEditDebugSandbox({ skillId, teamId, tmbId });
    expect(getClientMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceRoot: '/home/sandbox/workspace',
        createConfig: expect.objectContaining({
          env: expect.objectContaining({ FASTGPT_WORKDIR: '/home/sandbox/workspace' })
        })
      })
    );
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('packages the stored workspace root and disallows a conflicting override', async () => {
    executeMock.mockResolvedValue({
      stdout: '1 0 1 -1 ? Ss bootstrap.sh',
      stderr: '',
      exitCode: 0
    });
    const sandboxId = new Types.ObjectId().toHexString();
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId,
      sourceType: 'skillEdit',
      sourceId: skillId,
      teamId,
      ownerTmbId: tmbId,
      runtimeUserId: 'skillEdit',
      sessionId: 'edit-debug',
      status: SandboxStatusEnum.running,
      metadata: {
        sandboxType: SandboxTypeEnum.editDebug,
        skillId,
        teamId,
        workspaceRoot: '/persisted/skill/edit'
      }
    });
    expect(await packageSkillInSandbox({ sandboxId })).toEqual(Buffer.from('package-content'));
    expect(exportWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({ workDirectory: '/persisted/skill/edit' })
    );
    expect(connectExistingMock).toHaveBeenCalledOnce();
    expect(getClientMock).not.toHaveBeenCalled();
    getClientMock.mockClear();
    await expect(
      packageSkillInSandbox({ sandboxId, workDirectory: '/tmp/escape' })
    ).rejects.toThrow('workspace root');
    expect(getClientMock).not.toHaveBeenCalled();
  });

  it('uses the initialization lease for packaging and never ensures a missing provider', async () => {
    const created = await createEditDebugSandbox({ skillId, teamId, tmbId });
    getClientMock.mockClear();
    leaseKeys.add(`skill-edit-init:${skillId}`);
    await expect(packageSkillInSandbox({ sandboxId: created.providerSandboxId })).rejects.toThrow(
      'operation_conflict'
    );
    expect(getExistingClientMock).not.toHaveBeenCalled();
    leaseKeys.clear();
    connectExistingMock.mockResolvedValue(false);
    await expect(packageSkillInSandbox({ sandboxId: created.providerSandboxId })).rejects.toThrow(
      'not running'
    );
    expect(getClientMock).not.toHaveBeenCalled();
    expect(exportWorkspaceMock).not.toHaveBeenCalled();
  });

  it('fails packaging for a paused existing provider without resuming it', async () => {
    const created = await createEditDebugSandbox({ skillId, teamId, tmbId });
    getClientMock.mockClear();
    getExistingClientMock.mockReturnValue({
      provider: {
        provider: 'opensandbox',
        connectExisting: connectExistingMock,
        getInfo: async () => ({ status: { state: 'Paused' } }),
        close: async () => undefined
      }
    });
    await expect(packageSkillInSandbox({ sandboxId: created.providerSandboxId })).rejects.toThrow(
      'not running'
    );
    expect(getClientMock).not.toHaveBeenCalled();
    expect(exportWorkspaceMock).not.toHaveBeenCalled();
  });

  it('preserves a failed deployment and refuses to report partial files as ready on retry', async () => {
    executeMock.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'Extraction interrupted'
    });
    await expect(createEditDebugSandbox({ skillId, teamId, tmbId })).rejects.toThrow(
      'Failed to initialize'
    );
    const sandboxId = generateSandboxIdentityId({ sourceType: 'skillEdit', sourceId: skillId });
    expect(deleteClientMock).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: SandboxStatusEnum.failed,
      metadata: { volumeEnabled: true },
      operation: {
        type: 'editInitialize',
        checkpoint: 'package_extract',
        error: { code: 'sandbox_edit_initialization_failed' }
      }
    });
    executeMock.mockResolvedValue({ exitCode: 0, stdout: '/workspace/package.zip\n', stderr: '' });
    writeMock.mockClear();
    await expect(createEditDebugSandbox({ skillId, teamId, tmbId })).rejects.toThrow(
      'sandbox_workspace_initialization_incomplete'
    );
    expect(writeMock).not.toHaveBeenCalled();
    expect(deleteClientMock).not.toHaveBeenCalled();
  });

  it('retries endpoint readiness without redeploying an already prepared workspace', async () => {
    endpointReadyMock.mockRejectedValueOnce(new Error('Endpoint timed out'));
    await expect(createEditDebugSandbox({ skillId, teamId, tmbId })).rejects.toThrow(
      'Endpoint timed out'
    );
    const sandboxId = generateSandboxIdentityId({ sourceType: 'skillEdit', sourceId: skillId });
    const failed = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    expect(failed).toMatchObject({
      status: SandboxStatusEnum.failed,
      operation: { checkpoint: 'endpoint_ready' }
    });
    expect(failed?.baseVersionId).toBeDefined();
    expect(deleteClientMock).not.toHaveBeenCalled();
    writeMock.mockClear();
    executeMock.mockResolvedValue({ exitCode: 0, stdout: '/workspace/draft.txt\n', stderr: '' });
    const retried = await createEditDebugSandbox({ skillId, teamId, tmbId });
    expect(retried.status.state).toBe('Running');
    expect(writeMock).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: SandboxStatusEnum.running
    });
  });

  it('does not overwrite another lifecycle operation when edit initialization fails', async () => {
    const sandboxId = generateSandboxIdentityId({ sourceType: 'skillEdit', sourceId: skillId });
    executeMock.mockImplementationOnce(async () => {
      await MongoSandboxInstance.updateOne(
        { sandboxId },
        {
          $set: {
            status: SandboxStatusEnum.deleting,
            operation: {
              id: 'other-operation',
              type: 'delete',
              checkpoint: 'provider_delete',
              startedAt: new Date(),
              updatedAt: new Date()
            }
          }
        }
      );
      return { exitCode: 1, stdout: '', stderr: 'Interrupted' };
    });
    await expect(createEditDebugSandbox({ skillId, teamId, tmbId })).rejects.toThrow();
    expect(deleteClientMock).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: SandboxStatusEnum.deleting,
      operation: { id: 'other-operation', type: 'delete', checkpoint: 'provider_delete' }
    });
  });

  it('deletes an edit sandbox without ensuring or creating provider resources', async () => {
    const created = await createEditDebugSandbox({ skillId, teamId, tmbId });
    getClientMock.mockClear();
    await deleteSandbox({ sandboxId: created.sandboxId, teamId });
    expect(getClientMock).not.toHaveBeenCalled();
    expect(getExistingClientMock).toHaveBeenCalled();
    expect(await MongoSandboxInstance.findById(created.sandboxId).lean()).toBeNull();
  });

  it('deletes only edit workspaces associated with a Skill without restarting them', async () => {
    const created = await createEditDebugSandbox({ skillId, teamId, tmbId });
    const runtime = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: new Types.ObjectId().toHexString(),
      appId: skillId,
      metadata: { sandboxType: SandboxTypeEnum.sessionRuntime, skillId }
    });
    getClientMock.mockClear();
    await deleteSkillRelatedSandboxes({
      skillIds: [skillId],
      teamId,
      assertAuthorized: async () => {}
    });
    expect(getClientMock).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.findById(created.sandboxId).lean()).toBeNull();
    expect(await MongoSandboxInstance.findById(runtime._id).lean()).not.toBeNull();
  });
});
